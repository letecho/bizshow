import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { createLocalStorage, createStorageFromEnv, imageUrlFor } from '../storage/storage';
import { testApp } from './helpers/fixtures';

const storage = createLocalStorage({ apiBaseUrl: 'http://localhost:4000', secret: 'secret' });
let dir: string;
let app: ReturnType<typeof testApp>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'uploads-'));
  app = testApp([], {
    serviceRepository: createInMemoryServiceRepository([]),
    storage,
    localUploads: { storage, dir },
  });
});

/** presigned URL のパス部分（supertest はアプリに直接送るため） */
const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

describe('POST /api/v1/admin/uploads', () => {
  it('requires admin authentication', async () => {
    const unauth = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    const res = await request(unauth).post('/api/v1/admin/uploads').send({ contentType: 'image/png', size: 10 });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid MIME type or a file over 5MB', async () => {
    const gif = await request(app).post('/api/v1/admin/uploads').send({ contentType: 'image/gif', size: 10 });
    expect(gif.status).toBe(400);
    expect(gif.body.error.code).toBe('VALIDATION_ERROR');
    const big = await request(app)
      .post('/api/v1/admin/uploads')
      .send({ contentType: 'image/png', size: 5 * 1024 * 1024 + 1 });
    expect(big.status).toBe(400);
  });

  it('issues a presigned URL that accepts the PUT, then serves the image', async () => {
    const image = Buffer.from('fake-png-bytes');
    const ticket = await request(app).post('/api/v1/admin/uploads').send({ contentType: 'image/png', size: image.length });
    expect(ticket.status).toBe(201);
    const { key, uploadUrl, headers, publicUrl } = ticket.body.data;
    expect(key).toMatch(/^listings\/[0-9a-f-]{36}\.png$/);
    expect(headers).toEqual({ 'Content-Type': 'image/png' });
    expect(publicUrl).toBe(`http://localhost:4000/uploads/${key}`);

    const put = await request(app).put(pathOf(uploadUrl)).set(headers).send(image);
    expect(put.status).toBe(200);
    expect(await readFile(path.join(dir, key))).toEqual(image);

    const get = await request(app).get(`/uploads/${key}`);
    expect(get.status).toBe(200);
    expect(get.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('rejects a PUT with a different type, a different size or a tampered token', async () => {
    const ticket = await request(app).post('/api/v1/admin/uploads').send({ contentType: 'image/jpeg', size: 4 });
    const url = pathOf(ticket.body.data.uploadUrl);
    expect((await request(app).put(url).set('Content-Type', 'image/png').send(Buffer.from('abcd'))).status).toBe(400);
    expect((await request(app).put(url).set('Content-Type', 'image/jpeg').send(Buffer.from('abcde'))).status).toBe(400);
    const tampered = url.replace(/\.[^.]+$/, '.AAAA');
    expect((await request(app).put(tampered).set('Content-Type', 'image/jpeg').send(Buffer.from('abcd'))).status).toBe(403);
  });

  it('rejects expired upload tokens', async () => {
    const { url } = await storage.createUploadUrl('listings/123e4567-e89b-12d3-a456-426614174000.png', {
      contentType: 'image/png',
      size: 1,
    });
    const token = new URL(url).searchParams.get('token')!;
    expect(storage.verify(token)).not.toBeNull();
    expect(storage.verify(token, Date.now() + 10 * 60 * 1000)).toBeNull();
  });
});

describe('image on listings', () => {
  it('stores imageKey and exposes imageUrl in admin and public APIs', async () => {
    const key = 'listings/123e4567-e89b-12d3-a456-426614174000.webp';
    const created = await request(app)
      .post('/api/v1/admin/services')
      .send({
        slug: 'with-image',
        categories: ['daily'],
        prefecture: 'tokyo',
        supportedLanguages: ['en'],
        name: { en: 'With image' },
        description: { en: 'x' },
        isPublished: true,
        imageKey: key,
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ imageKey: key, imageUrl: `http://localhost:4000/uploads/${key}` });
    const detail = await request(app).get('/api/v1/services/with-image');
    expect(detail.body.data.imageUrl).toBe(`http://localhost:4000/uploads/${key}`);
    expect(detail.body.data).not.toHaveProperty('imageKey');
  });

  it('rejects an imageKey outside the upload prefix', async () => {
    const res = await request(app)
      .post('/api/v1/admin/services')
      .send({
        slug: 'bad-image',
        categories: ['daily'],
        prefecture: 'tokyo',
        supportedLanguages: ['en'],
        name: { en: 'x' },
        description: { en: 'x' },
        imageKey: '../secret.png',
      });
    expect(res.status).toBe(400);
  });
});

describe('storage config', () => {
  it('uses ASSET_BASE_URL (CDN) for public URLs', () => {
    expect(imageUrlFor('listings/a.png', { ASSET_BASE_URL: 'https://cdn.example.com/' })).toBe(
      'https://cdn.example.com/listings/a.png',
    );
    expect(imageUrlFor(null)).toBeNull();
  });

  it('requires S3_BUCKET and ASSET_BASE_URL for the s3 driver', () => {
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: 's3' })).toThrow('S3_BUCKET');
    expect(() => createStorageFromEnv({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toThrow('ASSET_BASE_URL');
    expect(createStorageFromEnv({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b', ASSET_BASE_URL: 'https://cdn' }).local).toBeUndefined();
    expect(createStorageFromEnv({}).local?.dir).toBe('uploads');
  });

  it('signs S3 PUT URLs with content type and length', async () => {
    const { storage: s3 } = createStorageFromEnv({
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'bizshow-assets',
      ASSET_BASE_URL: 'https://cdn',
      AWS_REGION: 'ap-northeast-1',
    });
    process.env.AWS_ACCESS_KEY_ID ??= 'test';
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
    const { url, headers } = await s3.createUploadUrl('listings/x.png', { contentType: 'image/png', size: 123 });
    const u = new URL(url);
    expect(u.hostname).toBe('bizshow-assets.s3.ap-northeast-1.amazonaws.com');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(headers['Content-Type']).toBe('image/png');
  });
});

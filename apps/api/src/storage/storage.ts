import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ImageContentType, UploadRequest } from '@fss/shared';

/** presigned URL の有効期限 */
export const UPLOAD_URL_TTL_SEC = 300;

const EXTENSIONS: Record<ImageContentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function newImageKey(contentType: ImageContentType): string {
  return `listings/${randomUUID()}.${EXTENSIONS[contentType]}`;
}

/** 画像の公開 URL（CDN）。ASSET_BASE_URL 未設定時はローカル API の /uploads */
export function imageUrlFor(key: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!key) return null;
  const base = env.ASSET_BASE_URL || `${env.API_PUBLIC_URL || 'http://localhost:4000'}/uploads`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

/** アップロード先の発行。STORAGE_DRIVER=local（既定）| s3 */
export interface Storage {
  createUploadUrl(key: string, request: UploadRequest): Promise<{ url: string; headers: Record<string, string> }>;
}

export function createS3Storage(options: { bucket: string; region?: string }): Storage {
  let client: Promise<Storage> | undefined;
  const load = () =>
    (client ??= Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')]).then(
      ([{ S3Client, PutObjectCommand }, { getSignedUrl }]) => {
        const s3 = new S3Client({ region: options.region });
        return {
          async createUploadUrl(key, { contentType, size }) {
            // Content-Type と Content-Length を署名に含め、宣言と異なる PUT を拒否させる
            const command = new PutObjectCommand({
              Bucket: options.bucket,
              Key: key,
              ContentType: contentType,
              ContentLength: size,
            });
            const url = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SEC });
            return { url, headers: { 'Content-Type': contentType } };
          },
        };
      },
    ));
  return {
    async createUploadUrl(key, request) {
      return (await load()).createUploadUrl(key, request);
    },
  };
}

// ---- local driver -------------------------------------------------------------

export interface LocalUploadClaims {
  key: string;
  contentType: ImageContentType;
  size: number;
  /** epoch 秒 */
  exp: number;
}

/** ローカル用の presigned URL 相当。HMAC 署名付きトークンを PUT /api/v1/uploads/local で検証する */
export function createLocalStorage(options: { apiBaseUrl: string; secret?: string }): Storage & {
  verify(token: string, now?: number): LocalUploadClaims | null;
} {
  const secret = options.secret || randomBytes(32).toString('hex');
  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    async createUploadUrl(key, { contentType, size }) {
      const claims: LocalUploadClaims = { key, contentType, size, exp: Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SEC };
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const token = `${payload}.${sign(payload)}`;
      return {
        url: `${options.apiBaseUrl.replace(/\/$/, '')}/api/v1/uploads/local?token=${token}`,
        headers: { 'Content-Type': contentType },
      };
    },
    verify(token, now = Date.now()) {
      const [payload, signature] = token.split('.');
      if (!payload || !signature) return null;
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as LocalUploadClaims;
      return claims.exp * 1000 >= now ? claims : null;
    },
  };
}

export type LocalStorage = ReturnType<typeof createLocalStorage>;

export interface StorageConfig {
  storage: Storage;
  /** STORAGE_DRIVER=local のときのみ。アップロード受付と /uploads 配信に使う */
  local?: { storage: LocalStorage; dir: string };
}

export function createStorageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const driver = env.STORAGE_DRIVER || 'local';
  if (driver === 's3') {
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    if (!env.ASSET_BASE_URL) throw new Error('ASSET_BASE_URL (CDN URL) is required when STORAGE_DRIVER=s3');
    return { storage: createS3Storage({ bucket: env.S3_BUCKET, region: env.AWS_REGION }) };
  }
  if (driver !== 'local') throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  const storage = createLocalStorage({ apiBaseUrl: env.API_PUBLIC_URL || 'http://localhost:4000' });
  return { storage, local: { storage, dir: env.LOCAL_UPLOAD_DIR || 'uploads' } };
}

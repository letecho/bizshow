import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createInMemoryInquiryRepository } from '../repositories/inquiryRepository';
import type { Mailer } from '../mail/mailer';
import { createMailerFromEnv } from '../mail/mailer';
import { testApp } from './helpers/fixtures';

const valid = { name: 'Nguyen Van A', email: 'a@example.com', message: 'Xin chào', locale: 'vi' };

function setup() {
  const repo = createInMemoryInquiryRepository();
  const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const app = testApp([], { inquiryRepository: repo, mailer, operatorEmail: 'ops@example.com' });
  return { app, repo, mailer };
}

describe('POST /api/v1/inquiries', () => {
  it('saves the inquiry, notifies the operator and returns 201', async () => {
    const { app, repo, mailer } = setup();
    const res = await request(app).post('/api/v1/inquiries').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { received: true } });
    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]).toMatchObject({ name: 'Nguyen Van A', email: 'a@example.com', locale: 'vi' });
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@example.com' }));
  });

  it('does not save when the honeypot is filled but still returns 201', async () => {
    const { app, repo, mailer } = setup();
    const res = await request(app)
      .post('/api/v1/inquiries')
      .send({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(repo.records).toHaveLength(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for invalid input', async () => {
    const { app, repo } = setup();
    const res = await request(app)
      .post('/api/v1/inquiries')
      .send({ ...valid, email: 'not-an-email', message: 'a'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repo.records).toHaveLength(0);
  });

  it('returns 429 RATE_LIMITED on the 6th request from the same IP within 10 minutes', async () => {
    const { app, repo } = setup();
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/inquiries').send(valid);
      expect(res.status).toBe(201);
    }
    const res = await request(app).post('/api/v1/inquiries').send(valid);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { code: 'RATE_LIMITED', message: expect.any(String) } });
    expect(repo.records).toHaveLength(5);
  });

  it('still returns 201 when the notification fails', async () => {
    const repo = createInMemoryInquiryRepository();
    const mailer: Mailer = { send: vi.fn().mockRejectedValue(new Error('SES down')) };
    const app = testApp([], { inquiryRepository: repo, mailer, operatorEmail: 'ops@example.com' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/v1/inquiries').send(valid);
    expect(res.status).toBe(201);
    expect(repo.records).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('createMailerFromEnv', () => {
  it('defaults to the log driver and requires MAIL_FROM for ses', () => {
    expect(createMailerFromEnv({})).toBeDefined();
    expect(() => createMailerFromEnv({ MAIL_DRIVER: 'ses' })).toThrow('MAIL_FROM');
    expect(createMailerFromEnv({ MAIL_DRIVER: 'ses', MAIL_FROM: 'no-reply@example.com' })).toBeDefined();
    expect(() => createMailerFromEnv({ MAIL_DRIVER: 'smtp' })).toThrow('Unknown MAIL_DRIVER');
  });
});

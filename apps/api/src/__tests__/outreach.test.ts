import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { OutreachConfig } from '@fss/shared';
import type { MailMessage } from '../mail/mailer';
import { createInMemoryBlocklistRepository } from '../repositories/blocklistRepository';
import { createInMemoryCandidateRepository, type InMemoryCandidateRecord } from '../repositories/candidateRepository';
import { createInMemoryOutreachRepository } from '../repositories/outreachRepository';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { signOutreachToken, verifyOutreachToken } from '../outreach/token';
import { testApp } from './helpers/fixtures';

const SECRET = 's'.repeat(32);
const enabled: OutreachConfig = {
  enabled: true,
  dailyLimit: 2,
  linkTtlDays: 30,
  sender: { name: 'テスト運営', address: '東京都千代田区1-1-1', contact: 'ops@example.com' },
  linkSecret: SECRET,
  webOrigin: 'https://web.example',
};

let seq = 0;
function candidate(overrides: Partial<InMemoryCandidateRecord> = {}): InMemoryCandidateRecord {
  seq += 1;
  return {
    id: `cand-${seq}`,
    sourceId: 'mhlw-medical',
    sourceName: '医療情報ネット',
    sourceAttribution: '出典',
    sourceUrl: null,
    sourceRecordId: `r${seq}`,
    fetchedAt: '2026-11-19T00:00:00.000Z',
    extracted: {
      category: 'medical',
      prefecture: 'tokyo',
      supportedLanguages: ['ja', 'vi'],
      name: { ja: `医療法人 クリニック${seq}` },
      description: { ja: '収集元の説明文' },
      phone: '03-1234-5678',
      websiteUrl: `https://clinic${seq}.example/`,
    },
    languageEvidence: [],
    hasTargetLanguage: true,
    entityType: 'corporation',
    entityEvidence: [],
    corporateNumber: '1234567890123',
    matchedListingId: null,
    matchType: 'new',
    score: 50,
    status: 'pending',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: '2026-11-19T00:00:00.000Z',
    ...overrides,
  };
}

function setup(config: OutreachConfig = enabled, records = [candidate({ id: 'c1' }), candidate({ id: 'c2' }), candidate({ id: 'c3' })]) {
  const services = createInMemoryServiceRepository([]);
  const candidates = createInMemoryCandidateRepository(records, services);
  const outreach = createInMemoryOutreachRepository();
  const blocklist = createInMemoryBlocklistRepository();
  const sent: MailMessage[] = [];
  let failMail = false;
  const app = testApp([], {
    serviceRepository: services,
    candidateRepository: candidates,
    outreachRepository: outreach,
    blocklistRepository: blocklist,
    outreachConfig: config,
    mailer: {
      async send(message) {
        if (failMail) throw new Error('SES down: secret detail');
        sent.push(message);
      },
    },
  });
  return { app, outreach, blocklist, sent, failNextMail: () => (failMail = true) };
}

const body = (to: string, extra: Record<string, unknown> = {}) => ({
  to,
  publishedUrl: 'https://clinic.example/contact',
  confirmedNoOptOutNotice: true,
  ...extra,
});

const tokenFrom = (text: string, path: string) => {
  const match = text.match(new RegExp(`${path}\\?(?:invite|token)=([^\\s]+)`));
  return match ? decodeURIComponent(match[1]) : '';
};

describe('outreach (F-118)', () => {
  it('requires authentication for the admin routes', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    expect((await request(app).get('/api/v1/admin/candidates/c1/outreach')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'))).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/outreach/opt-outs').send({ email: 'a@b.example' })).status).toBe(401);
  });

  it('does not send when disabled (default)', async () => {
    const { app, sent } = setup({ enabled: false, dailyLimit: 10, linkTtlDays: 30 });
    const res = await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('info@clinic.example'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUTREACH_DISABLED');
    expect(sent).toHaveLength(0);
    const status = await request(app).get('/api/v1/admin/candidates/c1/outreach');
    expect(status.body.data).toMatchObject({ enabled: false, sentToday: 0, history: [] });
  });

  it('sends one email with the listing, sender information and opt-out method, and records it', async () => {
    const { app, sent } = setup();
    const res = await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('Info@Clinic.example'));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ enabled: true, dailyLimit: 2, sentToday: 1 });
    expect(res.body.data.history).toMatchObject([{ email: 'info@clinic.example', status: 'sent', sentBy: 'dev-admin' }]);
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.to).toBe('info@clinic.example');
    expect(mail.text).toContain('https://web.example/ja/apply?invite=');
    expect(mail.text).toContain('https://web.example/ja/outreach/opt-out?token=');
    expect(mail.text).toContain('住所: 東京都千代田区1-1-1');
    expect(mail.text).toContain('連絡先: ops@example.com');
    expect(mail.text).not.toContain('収集元の説明文');
  });

  it('validates the input', async () => {
    const { app } = setup();
    const post = (b: unknown) => request(app).post('/api/v1/admin/candidates/c1/outreach').send(b as object);
    expect((await post(body('not-an-email'))).status).toBe(400);
    expect((await post(body('a@b.example', { confirmedNoOptOutNotice: false }))).status).toBe(400);
    expect((await post(body('a@b.example', { publishedUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await request(app).post('/api/v1/admin/candidates/missing/outreach').send(body('a@b.example'))).status).toBe(404);
  });

  it('does not send twice to the same address, and stops at the daily limit', async () => {
    const { app, sent } = setup();
    expect((await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@one.example'))).status).toBe(201);
    const again = await request(app).post('/api/v1/admin/candidates/c2/outreach').send(body('A@one.example'));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('OUTREACH_ALREADY_SENT');
    expect((await request(app).post('/api/v1/admin/candidates/c2/outreach').send(body('b@two.example'))).status).toBe(201);
    const over = await request(app).post('/api/v1/admin/candidates/c3/outreach').send(body('c@three.example'));
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('OUTREACH_DAILY_LIMIT');
    expect(sent).toHaveLength(2);
  });

  it('does not send to opted-out addresses or blocklisted businesses', async () => {
    const c2 = candidate({ id: 'c2', corporateNumber: null });
    c2.extracted = { ...c2.extracted, websiteUrl: 'https://www.blocked-site.example/' };
    const { app, blocklist, sent } = setup({ ...enabled, dailyLimit: 10 }, [candidate({ id: 'c1' }), c2, candidate({ id: 'c3' })]);
    expect((await request(app).post('/api/v1/admin/outreach/opt-outs').send({ email: 'NO@clinic.example' })).status).toBe(201);
    const optedOut = await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('no@clinic.example'));
    expect(optedOut.body.error.code).toBe('OUTREACH_OPTED_OUT');

    await blocklist.create({ domain: 'blocked-site.example', reason: 'optout' });
    const byWebsite = await request(app).post('/api/v1/admin/candidates/c2/outreach').send(body('info@other.example'));
    expect(byWebsite.body.error.code).toBe('OUTREACH_BLOCKED');

    await blocklist.create({ domain: 'blocked-mail.example', reason: 'optout' });
    const byEmail = await request(app).post('/api/v1/admin/candidates/c3/outreach').send(body('info@sub.blocked-mail.example'));
    expect(byEmail.body.error.code).toBe('OUTREACH_BLOCKED');
    expect(sent).toHaveLength(0);
  });

  it('does not send for processed candidates', async () => {
    const { app } = setup(enabled, [candidate({ id: 'done', status: 'approved' })]);
    const res = await request(app).post('/api/v1/admin/candidates/done/outreach').send(body('a@b.example'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('records a failure without exposing the mail provider error, and allows a retry', async () => {
    const { app, failNextMail, outreach } = setup();
    failNextMail();
    const res = await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'));
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
    expect(outreach.records).toMatchObject([{ status: 'failed' }]);
  });

  it('prefills the listing request from the invite link, without the collected description', async () => {
    const { app, sent } = setup();
    await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'));
    const token = tokenFrom(sent[0].text, '/ja/apply');
    const res = await request(app).get(`/api/v1/outreach/invites/${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ category: 'medical', prefecture: 'tokyo', phone: '03-1234-5678', name: { ja: expect.stringMatching(/^医療法人 クリニック\d+$/) } });
    expect(res.body.data).not.toHaveProperty('description');
    expect(JSON.stringify(res.body)).not.toContain('a@b.example');
  });

  it('rejects tampered, wrong-kind and expired links', async () => {
    const { app, sent, outreach } = setup();
    await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'));
    const invite = tokenFrom(sent[0].text, '/ja/apply');
    const optOut = tokenFrom(sent[0].text, '/ja/outreach/opt-out');
    const get = (t: string) => request(app).get(`/api/v1/outreach/invites/${encodeURIComponent(t)}`);
    expect((await get(`${invite}x`)).status).toBe(404);
    expect((await get(optOut)).status).toBe(404);
    expect((await get(signOutreachToken('t'.repeat(32), 'invite', outreach.records[0].id))).status).toBe(404);
    const expired = signOutreachToken(SECRET, 'invite', outreach.records[0].id, new Date(Date.now() - 1000));
    expect((await get(expired)).status).toBe(404);
    expect((await get(expired)).body.error.code).toBe('INVALID_TOKEN');
  });

  it('opts out from the link and never sends to that address again', async () => {
    const { app, sent, outreach } = setup({ ...enabled, dailyLimit: 10 });
    await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'));
    const optOut = tokenFrom(sent[0].text, '/ja/outreach/opt-out');
    expect((await request(app).post('/api/v1/outreach/opt-out').send({ token: 'bad' })).status).toBe(404);
    const res = await request(app).post('/api/v1/outreach/opt-out').send({ token: optOut });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('a@b.example');
    expect(await outreach.isOptedOut('a@b.example')).toBe(true);
    // 再度押しても成功（冪等）
    expect((await request(app).post('/api/v1/outreach/opt-out').send({ token: optOut })).status).toBe(200);
  });

  it('keeps opt-out links working after outreach is disabled', async () => {
    const { app, sent, outreach } = setup();
    await request(app).post('/api/v1/admin/candidates/c1/outreach').send(body('a@b.example'));
    const optOut = tokenFrom(sent[0].text, '/ja/outreach/opt-out');
    const disabled = testApp([], {
      outreachRepository: outreach,
      outreachConfig: { enabled: false, dailyLimit: 10, linkTtlDays: 30, linkSecret: SECRET },
    });
    expect((await request(disabled).post('/api/v1/outreach/opt-out').send({ token: optOut })).status).toBe(200);
  });
});

describe('outreach tokens', () => {
  it('verifies the signature, kind and expiry', () => {
    const now = new Date('2026-11-19T00:00:00Z');
    const token = signOutreachToken(SECRET, 'invite', 'm1', new Date('2026-11-20T00:00:00Z'));
    expect(verifyOutreachToken(SECRET, 'invite', token, now)).toBe('m1');
    expect(verifyOutreachToken(SECRET, 'optout', token, now)).toBeNull();
    expect(verifyOutreachToken(SECRET, 'invite', token, new Date('2026-11-20T00:00:01Z'))).toBeNull();
    expect(verifyOutreachToken(SECRET, 'invite', 'garbage', now)).toBeNull();
    expect(verifyOutreachToken(SECRET, 'optout', signOutreachToken(SECRET, 'optout', 'm2'), new Date('2100-01-01'))).toBe('m2');
  });
});

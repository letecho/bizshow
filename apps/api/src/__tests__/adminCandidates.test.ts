import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createBudgetedLlm, createMemoryLlmUsageStore, type CandidateExtract, type LlmClient } from '@fss/shared';
import { createInMemoryCandidateRepository, type InMemoryCandidateRecord } from '../repositories/candidateRepository';
import { createInMemoryServiceRepository } from '../repositories/inMemoryServiceRepository';
import { makeRecord, testApp } from './helpers/fixtures';

let seq = 0;
function candidate(
  overrides: Omit<Partial<InMemoryCandidateRecord>, 'extracted'> & { extracted?: Partial<CandidateExtract> } = {},
): InMemoryCandidateRecord {
  seq += 1;
  const { extracted, ...rest } = overrides;
  return {
    id: `cand-${seq}`,
    sourceId: 'mhlw-medical',
    sourceName: '医療情報ネット',
    sourceAttribution: '出典: 医療情報ネット（厚生労働省）のデータを加工して作成',
    sourceUrl: `https://example.go.jp/r/${seq}`,
    sourceRecordId: `r${seq}`,
    fetchedAt: '2026-11-19T00:00:00.000Z',
    extracted: { category: 'medical', prefecture: 'tokyo', supportedLanguages: ['ja', 'vi'], name: { ja: `医療法人 クリニック${seq}` }, ...extracted },
    languageEvidence: [{ lang: 'vi', kind: 'source_field', value: '外国語対応: ベトナム語' }],
    hasTargetLanguage: false,
    entityType: 'corporation',
    entityEvidence: [{ kind: 'name_suffix', value: '医療法人' }],
    corporateNumber: null,
    matchedListingId: null,
    matchType: 'new',
    score: 50,
    status: 'pending',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 19, 0, 0, seq)).toISOString(),
    ...rest,
  };
}

const approval = {
  slug: 'tokyo-clinic',
  category: 'medical',
  prefecture: 'tokyo',
  supportedLanguages: ['ja', 'vi'],
  name: { en: 'Tokyo Clinic', ja: '東京クリニック' },
  description: { en: 'Internal medicine with Vietnamese support.' },
  isPublished: true,
};

function setup(candidates: InMemoryCandidateRecord[], listings = [makeRecord({ slug: 'existing-clinic', phone: '03-0000-0000' })], scope?: 'all') {
  const services = createInMemoryServiceRepository(listings);
  const repo = createInMemoryCandidateRepository(candidates, services);
  const app = testApp([], { serviceRepository: services, candidateRepository: repo, ...(scope && { entityScope: scope }) });
  return { app, repo, services, listings };
}

describe('admin candidates API (F-113)', () => {
  it('requires authentication', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    expect((await request(app).get('/api/v1/admin/candidates')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/candidates/x/approve').send(approval)).status).toBe(401);
  });

  it('lists pending candidates with target-language evidence first, then by score, with filters', async () => {
    const { app } = setup([
      candidate({ id: 'low', score: 30 }),
      candidate({ id: 'high', score: 90 }),
      candidate({ id: 'vi', score: 40, hasTargetLanguage: true }),
      candidate({ id: 'osaka', score: 80, extracted: { prefecture: 'osaka' } }),
      candidate({ id: 'done', score: 99, status: 'approved' }),
    ]);
    const all = await request(app).get('/api/v1/admin/candidates');
    expect(all.status).toBe(200);
    expect(all.body.data.map((c: { id: string }) => c.id)).toEqual(['vi', 'high', 'osaka', 'low']);
    expect(all.body.meta).toMatchObject({ total: 4, sources: [{ id: 'mhlw-medical', name: '医療情報ネット' }] });
    expect(all.body.data[0]).not.toHaveProperty('sourceAttribution');

    const ids = async (q: string) => (await request(app).get(`/api/v1/admin/candidates?${q}`)).body.data.map((c: { id: string }) => c.id);
    expect(await ids('targetLang=1')).toEqual(['vi']);
    expect(await ids('prefecture=osaka')).toEqual(['osaka']);
    expect(await ids('minScore=80')).toEqual(['high', 'osaka']);
    expect(await ids('status=approved')).toEqual(['done']);
    expect(await ids('source=other')).toEqual([]);
    expect((await request(app).get('/api/v1/admin/candidates?minScore=101')).status).toBe(400);
  });

  it('approves a new candidate: creates a listing with the source and verified date', async () => {
    const { app, repo, listings } = setup([candidate({ id: 'c1' })]);
    const res = await request(app).post('/api/v1/admin/candidates/c1/approve').send(approval);
    expect(res.status).toBe(200);
    expect(res.body.data.candidate).toMatchObject({ status: 'approved', reviewedBy: 'dev-admin', matchedListingId: res.body.data.listing.id });
    expect(res.body.data.listing).toMatchObject({
      slug: 'tokyo-clinic',
      isPublished: true,
      sources: [{ attribution: '出典: 医療情報ネット（厚生労働省）のデータを加工して作成', url: 'https://example.go.jp/r/' + repo.records[0].sourceRecordId.slice(1) }],
    });
    expect(res.body.data.listing.lastVerifiedAt).toEqual(expect.any(String));
    expect(listings.map((l) => l.slug)).toContain('tokyo-clinic');
    // 公開 API に出る
    expect((await request(app).get('/api/v1/services/tokyo-clinic')).status).toBe(200);
  });

  it('shows the diff with the matched listing and updates it on approval (update candidate)', async () => {
    const existing = makeRecord({ slug: 'existing-clinic', phone: '03-0000-0000', sources: [{ attribution: 'Other', url: null }] });
    const { app, listings } = setup(
      [candidate({ id: 'u1', matchType: 'update', matchedListingId: existing.id, extracted: { phone: '03-1111-1111', category: existing.category } })],
      [existing],
    );
    const detail = await request(app).get('/api/v1/admin/candidates/u1');
    expect(detail.status).toBe(200);
    expect(detail.body.data.matchedListing.slug).toBe('existing-clinic');
    expect(detail.body.data.diff).toEqual(
      expect.arrayContaining([{ field: 'phone', current: '03-0000-0000', candidate: '03-1111-1111' }]),
    );
    expect(detail.body.data.diff.map((d: { field: string }) => d.field)).not.toContain('category');
    expect(detail.body.data.entityApprovable).toBe(true);

    const res = await request(app)
      .post('/api/v1/admin/candidates/u1/approve')
      .send({ ...approval, slug: 'existing-clinic', phone: '03-1111-1111' });
    expect(res.status).toBe(200);
    expect(listings).toHaveLength(1);
    expect(res.body.data.listing).toMatchObject({ id: existing.id, phone: '03-1111-1111' });
    expect(res.body.data.listing.sources).toHaveLength(2);
  });

  it('rejects re-approval of processed candidates with 409 and leaves listings untouched', async () => {
    const { app, listings } = setup([candidate({ id: 'a', status: 'approved' }), candidate({ id: 'r', status: 'rejected' })]);
    for (const id of ['a', 'r']) {
      const res = await request(app).post(`/api/v1/admin/candidates/${id}/approve`).send(approval);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    }
    expect((await request(app).post('/api/v1/admin/candidates/a/reject').send({})).status).toBe(409);
    expect(listings).toHaveLength(1);
  });

  it('rejects and holds candidates with a note; held candidates can still be approved', async () => {
    const { app } = setup([candidate({ id: 'r' }), candidate({ id: 'h' })]);
    const rejected = await request(app).post('/api/v1/admin/candidates/r/reject').send({ reason: '閉院済み' });
    expect(rejected.body.data).toMatchObject({ status: 'rejected', reviewNote: '閉院済み', reviewedBy: 'dev-admin' });
    const held = await request(app).post('/api/v1/admin/candidates/h/hold').send({ note: '電話で確認中' });
    expect(held.body.data).toMatchObject({ status: 'on_hold', reviewNote: '電話で確認中' });
    expect((await request(app).post('/api/v1/admin/candidates/h/hold').send({})).status).toBe(409);
    expect((await request(app).post('/api/v1/admin/candidates/h/approve').send(approval)).status).toBe(200);
  });

  it('validates the approval input (en name and description are required) and slug conflicts', async () => {
    const { app, repo } = setup([candidate({ id: 'c' })]);
    const invalid = await request(app).post('/api/v1/admin/candidates/c/approve').send({ ...approval, name: { ja: '名前' } });
    expect(invalid.status).toBe(400);
    const conflict = await request(app).post('/api/v1/admin/candidates/c/approve').send({ ...approval, slug: 'existing-clinic' });
    expect(conflict.status).toBe(409);
    expect(repo.records[0].status).toBe('pending');
  });

  it('does not approve individual or unknown entities without an override under corporate_public', async () => {
    const { app, repo } = setup([candidate({ id: 'i', entityType: 'individual' }), candidate({ id: 'u', entityType: 'unknown' })]);
    expect((await request(app).get('/api/v1/admin/candidates/i')).body.data.entityApprovable).toBe(false);
    const res = await request(app).post('/api/v1/admin/candidates/i/approve').send(approval);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    // 範囲外の種類への変更・根拠なしも不可
    expect(
      (await request(app).post('/api/v1/admin/candidates/i/approve').send({ ...approval, entityOverride: { entityType: 'corporation', evidence: '' } })).status,
    ).toBe(400);
    expect(repo.records[0].status).toBe('pending');

    const ok = await request(app)
      .post('/api/v1/admin/candidates/u/approve')
      .send({ ...approval, entityOverride: { entityType: 'corporation', evidence: '法人番号 1234567890123 を確認' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.candidate.entityType).toBe('corporation');
    expect(ok.body.data.candidate.entityEvidence).toContainEqual({ kind: 'admin_review', value: '法人番号 1234567890123 を確認' });
  });

  it('does not publish individual or unknown entities without a consent record when COLLECTOR_ENTITY_SCOPE=all (F-119)', async () => {
    const { app, repo, services } = setup(
      [candidate({ id: 'i', entityType: 'individual' }), candidate({ id: 'u', entityType: 'unknown' }), candidate({ id: 'c' })],
      [],
      'all',
    );
    const detail = (await request(app).get('/api/v1/admin/candidates/i')).body.data;
    expect(detail).toMatchObject({ entityApprovable: true, consentRequired: true });
    expect((await request(app).get('/api/v1/admin/candidates/c')).body.data.consentRequired).toBe(false);

    for (const id of ['i', 'u']) {
      const res = await request(app).post(`/api/v1/admin/candidates/${id}/approve`).send({ ...approval, slug: `s-${id}` });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
      const empty = await request(app).post(`/api/v1/admin/candidates/${id}/approve`).send({ ...approval, slug: `s-${id}`, consent: { evidence: ' ' } });
      expect(empty.status).toBe(400);
    }
    expect(repo.records.filter((r) => r.status !== 'pending')).toHaveLength(0);
    expect((await services.adminList({ page: 1, limit: 50 })).total).toBe(0);

    const ok = await request(app)
      .post('/api/v1/admin/candidates/i/approve')
      .send({ ...approval, slug: 's-i', consent: { evidence: '掲載申請 #123 で掲載に同意' } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.candidate.entityType).toBe('individual');
    expect(ok.body.data.candidate.entityEvidence).toContainEqual({ kind: 'consent', value: '掲載申請 #123 で掲載に同意' });
    // 法人は同意の記録なしで承認できる
    expect((await request(app).post('/api/v1/admin/candidates/c/approve').send({ ...approval, slug: 's-c' })).status).toBe(200);
  });

  it('returns 404 for unknown candidates', async () => {
    const { app } = setup([]);
    expect((await request(app).get('/api/v1/admin/candidates/nope')).status).toBe(404);
    expect((await request(app).post('/api/v1/admin/candidates/nope/approve').send(approval)).status).toBe(404);
    expect((await request(app).post('/api/v1/admin/candidates/nope/reject').send({})).status).toBe(404);
  });
});

describe('description draft (F-117)', () => {
  const draft = { ja: '新宿区の医療機関です。', en: 'A clinic in Shinjuku.', zh: '位于新宿区的诊所。', vi: 'Phòng khám ở Shinjuku.' };
  const settings = { enabled: true, monthlyBudgetJpy: 100, model: 'test-model', priceInPerMTokJpy: 500, priceOutPerMTokJpy: 2500, apiKey: 'dummy' };

  function setupLlm(text: string | null, opts: { spent?: number; fail?: boolean } = {}) {
    const complete = vi.fn<LlmClient['complete']>();
    if (opts.fail) complete.mockRejectedValue(new Error('provider error with sk-secret'));
    else complete.mockResolvedValue({ text, tokensIn: 100, tokensOut: 50 });
    const { store, entries } = createMemoryLlmUsageStore(
      opts.spent ? [{ month: '2026-11', purpose: 'extract', model: 'test-model', tokensIn: 0, tokensOut: 0, costJpy: opts.spent }] : [],
    );
    const llm = createBudgetedLlm({ client: { complete }, store, settings, now: () => new Date('2026-11-19T00:00:00Z') });
    const c = candidate({
      extracted: {
        city: '新宿区',
        description: { ja: '収集元の説明文 SOURCE-DESCRIPTION' },
        address: { ja: '東京都新宿区西新宿1-1-1 SOURCE-ADDRESS' },
        phone: '03-1234-5678',
      },
    });
    const services = createInMemoryServiceRepository([]);
    const repo = createInMemoryCandidateRepository([c], services);
    const app = testApp([], { serviceRepository: services, candidateRepository: repo, llm });
    return { app, c, complete, entries, repo };
  }

  it('is unavailable when the LLM is disabled (default)', async () => {
    const { app } = setup([candidate()]);
    const id = (await request(app).get('/api/v1/admin/candidates')).body.data[0].id;
    expect((await request(app).get(`/api/v1/admin/candidates/${id}`)).body.data.descriptionDraftAvailable).toBe(false);
    const res = await request(app).post(`/api/v1/admin/candidates/${id}/description-draft`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LLM_DISABLED');
  });

  it('returns a 4-language draft built from facts only and records the usage', async () => {
    const { app, c, complete, entries, repo } = setupLlm(JSON.stringify(draft));
    expect((await request(app).get(`/api/v1/admin/candidates/${c.id}`)).body.data.descriptionDraftAvailable).toBe(true);
    const res = await request(app).post(`/api/v1/admin/candidates/${c.id}/description-draft`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { description: draft } });
    const req = complete.mock.calls[0]![0];
    const input = req.system + req.user;
    expect(input).toContain('新宿区');
    expect(input).not.toContain('SOURCE-DESCRIPTION');
    expect(input).not.toContain('SOURCE-ADDRESS');
    expect(input).not.toContain('03-1234-5678');
    expect(entries).toEqual([{ month: '2026-11', purpose: 'description_draft', model: 'test-model', tokensIn: 100, tokensOut: 50, costJpy: 0.175 }]);
    // 下書きは保存しない
    expect(repo.records[0]!.extracted.description).toEqual({ ja: '収集元の説明文 SOURCE-DESCRIPTION' });
  });

  it('skips the call once the monthly budget is reached', async () => {
    const { app, c, complete } = setupLlm(JSON.stringify(draft), { spent: 100 });
    const res = await request(app).post(`/api/v1/admin/candidates/${c.id}/description-draft`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LLM_BUDGET_EXCEEDED');
    expect(complete).not.toHaveBeenCalled();
  });

  it('rejects output that fails validation', async () => {
    const { app, c } = setupLlm(JSON.stringify({ ja: 'a', en: 'b' }));
    const res = await request(app).post(`/api/v1/admin/candidates/${c.id}/description-draft`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LLM_INVALID_OUTPUT');
  });

  it('does not leak provider errors', async () => {
    const { app, c } = setupLlm(null, { fail: true });
    const res = await request(app).post(`/api/v1/admin/candidates/${c.id}/description-draft`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('LLM_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });

  it('is not available for reviewed candidates', async () => {
    const { app, c } = setupLlm(JSON.stringify(draft));
    await request(app).post(`/api/v1/admin/candidates/${c.id}/reject`).send({});
    expect((await request(app).get(`/api/v1/admin/candidates/${c.id}`)).body.data.descriptionDraftAvailable).toBe(false);
    expect((await request(app).post(`/api/v1/admin/candidates/${c.id}/description-draft`)).status).toBe(409);
  });

  it('requires authentication', async () => {
    const app = testApp([], { auth: { mode: 'cognito', verify: () => Promise.reject(new Error('x')) } });
    expect((await request(app).post('/api/v1/admin/candidates/x/description-draft')).status).toBe(401);
  });
});

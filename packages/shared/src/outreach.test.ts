import { describe, expect, it } from 'vitest';
import type { CandidateExtract } from './collector';
import {
  buildOutreachMessage,
  listingInvitePrefill,
  loadOutreachConfig,
  OutreachOptOutInputSchema,
  SendOutreachSchema,
  startOfJstDay,
} from './outreach';

const enabledEnv = {
  OUTREACH_ENABLED: 'true',
  OUTREACH_SENDER_NAME: 'テスト運営',
  OUTREACH_SENDER_ADDRESS: '東京都千代田区1-1-1',
  OUTREACH_SENDER_CONTACT: 'ops@example.com',
  OUTREACH_LINK_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'https://example.com/',
};

describe('loadOutreachConfig', () => {
  it('is disabled with a daily limit of 10 by default', () => {
    expect(loadOutreachConfig({})).toEqual({ enabled: false, dailyLimit: 10, linkTtlDays: 30 });
  });

  it('reads the sender, secret and web origin when enabled', () => {
    const config = loadOutreachConfig({ ...enabledEnv, OUTREACH_DAILY_LIMIT: '3' });
    expect(config).toMatchObject({
      enabled: true,
      dailyLimit: 3,
      webOrigin: 'https://example.com',
      sender: { name: 'テスト運営', address: '東京都千代田区1-1-1', contact: 'ops@example.com' },
    });
  });

  it('refuses to start when enabled without the sender information', () => {
    expect(() => loadOutreachConfig({ ...enabledEnv, OUTREACH_SENDER_ADDRESS: ' ' })).toThrow(/OUTREACH_SENDER_ADDRESS/);
    expect(() => loadOutreachConfig({ ...enabledEnv, WEB_ORIGIN: '' })).toThrow(/WEB_ORIGIN/);
    expect(() => loadOutreachConfig({ ...enabledEnv, WEB_ORIGIN: '*' })).toThrow(/WEB_ORIGIN/);
    expect(() => loadOutreachConfig({ ...enabledEnv, OUTREACH_LINK_SECRET: 'short' })).toThrow(/OUTREACH_LINK_SECRET/);
  });

  it('rejects invalid values', () => {
    expect(() => loadOutreachConfig({ OUTREACH_ENABLED: 'yes' })).toThrow(/OUTREACH_ENABLED/);
    expect(() => loadOutreachConfig({ OUTREACH_DAILY_LIMIT: '0' })).toThrow(/OUTREACH_DAILY_LIMIT/);
    expect(() => loadOutreachConfig({ OUTREACH_DAILY_LIMIT: '1.5' })).toThrow(/OUTREACH_DAILY_LIMIT/);
  });
});

describe('SendOutreachSchema', () => {
  const valid = { to: ' Info@Example.COM ', publishedUrl: 'https://example.com/contact', confirmedNoOptOutNotice: true };

  it('normalizes the address to lower case', () => {
    expect(SendOutreachSchema.parse(valid).to).toBe('info@example.com');
  });

  it('requires the confirmation, a valid address and an http(s) page', () => {
    expect(SendOutreachSchema.safeParse({ ...valid, confirmedNoOptOutNotice: false }).success).toBe(false);
    expect(SendOutreachSchema.safeParse({ ...valid, to: 'not-an-email' }).success).toBe(false);
    expect(SendOutreachSchema.safeParse({ ...valid, publishedUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('normalizes opt-out addresses', () => {
    expect(OutreachOptOutInputSchema.parse({ email: 'A@B.example' }).email).toBe('a@b.example');
  });
});

describe('startOfJstDay', () => {
  it('returns midnight in Japan time', () => {
    expect(startOfJstDay(new Date('2026-11-19T14:59:59Z')).toISOString()).toBe('2026-11-18T15:00:00.000Z');
    expect(startOfJstDay(new Date('2026-11-19T15:00:00Z')).toISOString()).toBe('2026-11-19T15:00:00.000Z');
  });
});

const extract: CandidateExtract = {
  category: 'medical',
  prefecture: 'aichi',
  city: '名古屋市',
  supportedLanguages: ['ja', 'vi'],
  name: { ja: 'テスト病院', en: 'Test Hospital' },
  description: { ja: '収集元の説明文' },
  address: { ja: '中区1-2-3' },
  phone: '052-000-0000',
  websiteUrl: 'https://hospital.example/',
  corporateNumber: '1234567890123',
};

describe('buildOutreachMessage', () => {
  const message = buildOutreachMessage({
    extract,
    sender: { name: 'テスト運営', address: '東京都千代田区1-1-1', contact: 'ops@example.com' },
    inviteUrl: 'https://example.com/ja/apply?invite=abc',
    optOutUrl: 'https://example.com/ja/outreach/opt-out?token=def',
    inviteExpiresAt: new Date('2026-12-19T00:00:00Z'),
  });

  it('includes the listing, the invite link, the sender and how to opt out', () => {
    expect(message.subject).toContain('テスト病院');
    for (const text of [
      'テスト病院',
      '医療',
      '愛知県 名古屋市 中区1-2-3',
      '052-000-0000',
      'https://hospital.example/',
      '日本語、ベトナム語',
      'https://example.com/ja/apply?invite=abc',
      '2026-12-19',
      'https://example.com/ja/outreach/opt-out?token=def',
      'テスト運営',
      '住所: 東京都千代田区1-1-1',
      '連絡先: ops@example.com',
      '受信拒否',
    ]) {
      expect(message.text).toContain(text);
    }
  });

  it('does not include the collected description', () => {
    expect(message.text).not.toContain('収集元の説明文');
  });
});

describe('listingInvitePrefill', () => {
  it('omits the collected description and corporate number', () => {
    const prefill = listingInvitePrefill(extract);
    expect(prefill).not.toHaveProperty('description');
    expect(prefill).not.toHaveProperty('corporateNumber');
    expect(prefill.name).toEqual({ ja: 'テスト病院', en: 'Test Hospital' });
  });
});

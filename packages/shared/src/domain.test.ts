import { describe, it, expect } from 'vitest';
import {
  CrawlBlocklistInputSchema,
  isBlockedEntity,
  parseListingSources,
  PREFECTURES,
  SERVICE_CATEGORIES,
  SUPPORTED_LOCALES,
  AdminServiceInputSchema,
  AdminServiceListQuerySchema,
  IMAGE_KEY_PATTERN,
  InquiryInputSchema,
  UploadRequestSchema,
  SlugSchema,
  ListingRequestInputSchema,
  ServiceSearchQuerySchema,
  isSupportedLocale,
  pickText,
} from './domain';

describe('constants', () => {
  it('defines 4 locales, 8 categories and 47 prefectures', () => {
    expect(SUPPORTED_LOCALES).toEqual(['ja', 'en', 'zh', 'vi']);
    expect(SERVICE_CATEGORIES).toHaveLength(8);
    expect(PREFECTURES).toHaveLength(47);
    expect(new Set(PREFECTURES.map((p) => p.code)).size).toBe(47);
    expect(PREFECTURES.find((p) => p.code === 'tokyo')).toEqual({ code: 'tokyo', ja: '東京都', en: 'Tokyo' });
  });

  it('isSupportedLocale', () => {
    expect(isSupportedLocale('vi')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('pickText', () => {
  it('falls back to en when the locale is missing', () => {
    expect(pickText({ en: 'A' }, 'vi')).toBe('A');
    expect(pickText({ en: 'A', vi: '' }, 'vi')).toBe('A');
  });

  it('returns the requested locale when present', () => {
    expect(pickText({ en: 'A', ja: 'エー' }, 'ja')).toBe('エー');
  });
});

describe('ServiceSearchQuerySchema', () => {
  it('applies defaults', () => {
    expect(ServiceSearchQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query-string values and treats empty strings as unset', () => {
    const parsed = ServiceSearchQuerySchema.parse({
      q: ' clinic ',
      category: 'legal',
      prefecture: '',
      lang: 'vi',
      page: '2',
      limit: '10',
    });
    expect(parsed).toEqual({ q: 'clinic', category: 'legal', lang: 'vi', page: 2, limit: 10 });
  });

  it.each([
    ['invalid category', { category: 'food' }],
    ['limit over 50', { limit: '51' }],
    ['limit 100', { limit: 100 }],
    ['page 0', { page: '0' }],
    ['unknown prefecture', { prefecture: 'paris' }],
    ['unsupported lang', { lang: 'fr' }],
    ['q over 100 chars', { q: 'a'.repeat(101) }],
  ])('rejects %s', (_label, input) => {
    expect(ServiceSearchQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('InquiryInputSchema', () => {
  const valid = { name: 'Nguyen', email: 'a@example.com', message: 'Hello', locale: 'vi' };

  it('accepts a valid inquiry and trims fields', () => {
    expect(InquiryInputSchema.parse({ ...valid, name: '  Nguyen ' }).name).toBe('Nguyen');
  });

  it('rejects an invalid email, unsupported locale and too long message', () => {
    expect(InquiryInputSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(InquiryInputSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false);
    expect(InquiryInputSchema.safeParse({ ...valid, message: 'a'.repeat(2001) }).success).toBe(false);
    expect(InquiryInputSchema.safeParse({ ...valid, message: 'a'.repeat(2000) }).success).toBe(true);
  });
});

describe('ListingRequestInputSchema', () => {
  const valid = {
    category: 'legal',
    prefecture: 'tokyo',
    supportedLanguages: ['ja', 'en', 'en'],
    name: { en: 'Visa Office', ja: '', vi: 'Văn phòng visa' },
    description: { en: 'Visa support' },
    contactName: 'Tanaka',
    contactEmail: 'tanaka@example.com',
  };

  it('accepts a minimal request, de-duplicates languages and drops empty translations', () => {
    const parsed = ListingRequestInputSchema.parse(valid);
    expect(parsed.supportedLanguages).toEqual(['ja', 'en']);
    expect(parsed.name).toEqual({ en: 'Visa Office', vi: 'Văn phòng visa' });
  });

  it('rejects missing required fields', () => {
    expect(ListingRequestInputSchema.safeParse({ ...valid, name: { ja: '名前のみ' } }).success).toBe(false);
    expect(ListingRequestInputSchema.safeParse({ ...valid, supportedLanguages: [] }).success).toBe(false);
    const { contactEmail: _omit, ...withoutEmail } = valid;
    expect(ListingRequestInputSchema.safeParse(withoutEmail).success).toBe(false);
  });

  it('validates website URL and phone format', () => {
    expect(ListingRequestInputSchema.safeParse({ ...valid, websiteUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(ListingRequestInputSchema.safeParse({ ...valid, websiteUrl: 'https://example.com' }).success).toBe(true);
    expect(ListingRequestInputSchema.safeParse({ ...valid, phone: '03-1234-5678' }).success).toBe(true);
    expect(ListingRequestInputSchema.safeParse({ ...valid, phone: 'call me' }).success).toBe(false);
  });
});

describe('admin schemas', () => {
  it('validates slugs', () => {
    expect(SlugSchema.safeParse('tokyo-clinic-1').success).toBe(true);
    expect(SlugSchema.safeParse('Tokyo Clinic').success).toBe(false);
    expect(SlugSchema.safeParse('-bad-').success).toBe(false);
  });

  it('parses the published filter from query strings', () => {
    expect(AdminServiceListQuerySchema.parse({ published: 'false' }).published).toBe(false);
    expect(AdminServiceListQuerySchema.parse({ published: '' }).published).toBeUndefined();
    expect(AdminServiceListQuerySchema.safeParse({ published: 'yes' }).success).toBe(false);
  });

  it('defaults isPublished to false for new services', () => {
    const parsed = AdminServiceInputSchema.parse({
      slug: 'a',
      category: 'daily',
      prefecture: 'tokyo',
      supportedLanguages: ['en'],
      name: { en: 'A' },
      description: { en: 'B' },
    });
    expect(parsed.isPublished).toBe(false);
  });
});

describe('UploadRequestSchema', () => {
  it('accepts jpeg/png/webp up to 5MB only', () => {
    expect(UploadRequestSchema.safeParse({ contentType: 'image/webp', size: 5 * 1024 * 1024 }).success).toBe(true);
    expect(UploadRequestSchema.safeParse({ contentType: 'image/gif', size: 100 }).success).toBe(false);
    expect(UploadRequestSchema.safeParse({ contentType: 'image/png', size: 5 * 1024 * 1024 + 1 }).success).toBe(false);
  });

  it('validates image keys', () => {
    expect(IMAGE_KEY_PATTERN.test('listings/123e4567-e89b-12d3-a456-426614174000.jpg')).toBe(true);
    expect(IMAGE_KEY_PATTERN.test('../etc/passwd')).toBe(false);
  });
});

describe('parseListingSources (F-116)', () => {
  it('keeps valid sources and drops malformed ones', () => {
    expect(
      parseListingSources([
        { attribution: '出典: 医療情報ネット', url: 'https://example.go.jp/' },
        { attribution: 'No URL' },
        { attribution: '', url: null },
        { attribution: 'Bad URL', url: 'javascript:alert(1)' },
        'text',
      ]),
    ).toEqual([
      { attribution: '出典: 医療情報ネット', url: 'https://example.go.jp/' },
      { attribution: 'No URL', url: null },
    ]);
    expect(parseListingSources(null)).toEqual([]);
    expect(parseListingSources({ attribution: 'x' })).toEqual([]);
  });
});

describe('CrawlBlocklistInputSchema / isBlockedEntity (F-116)', () => {
  it('normalizes domains and requires a domain or corporate number', () => {
    expect(CrawlBlocklistInputSchema.parse({ domain: 'https://Example.COM/path', reason: 'optout' }).domain).toBe('example.com');
    expect(CrawlBlocklistInputSchema.parse({ domain: 'xn--eckwd4c7c.xn--zckzah.', reason: 'robots' }).domain).toBe(
      'xn--eckwd4c7c.xn--zckzah',
    );
    expect(CrawlBlocklistInputSchema.parse({ domain: '', corporateNumber: '1234567890123', reason: 'terms' })).toEqual({
      corporateNumber: '1234567890123',
      reason: 'terms',
    });
    expect(CrawlBlocklistInputSchema.safeParse({ domain: '', corporateNumber: ' ', reason: 'terms' }).success).toBe(false);
    expect(CrawlBlocklistInputSchema.safeParse({ domain: '192.168.0.1', reason: 'terms' }).success).toBe(false);
  });

  it('matches the domain and its subdomains, and corporate numbers', () => {
    const entries = [
      { domain: 'example.com', corporateNumber: null },
      { domain: null, corporateNumber: '1234567890123' },
    ];
    expect(isBlockedEntity(entries, { websiteUrl: 'https://example.com/' })).toBe(true);
    expect(isBlockedEntity(entries, { websiteUrl: 'https://WWW.Example.com/a' })).toBe(true);
    expect(isBlockedEntity(entries, { websiteUrl: 'https://notexample.com/' })).toBe(false);
    expect(isBlockedEntity(entries, { websiteUrl: 'https://example.com.evil.test/' })).toBe(false);
    expect(isBlockedEntity(entries, { corporateNumber: '1234567890123' })).toBe(true);
    expect(isBlockedEntity(entries, { websiteUrl: 'not a url' })).toBe(false);
    expect(isBlockedEntity(entries, {})).toBe(false);
  });
});

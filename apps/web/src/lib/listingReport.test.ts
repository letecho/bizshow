import { describe, it, expect } from 'vitest';
import { formatVerifiedDate, listingReportHref, listingReportMessage } from './listingReport';

describe('listingReportHref (F-116)', () => {
  it('links to the contact page with the topic and slug', () => {
    expect(listingReportHref('vi', 'tokyo-legal')).toBe('/vi/contact?topic=listing&slug=tokyo-legal');
  });
});

describe('listingReportMessage (F-116)', () => {
  it('prefills the subject and slug for a listing report', () => {
    expect(listingReportMessage({ topic: 'listing', slug: 'tokyo-legal' }, '【依頼】')).toBe('【依頼】\nslug: tokyo-legal\n\n');
  });

  it('returns an empty message for other topics or invalid slugs', () => {
    expect(listingReportMessage({}, 'x')).toBe('');
    expect(listingReportMessage({ topic: 'other', slug: 'tokyo-legal' }, 'x')).toBe('');
    expect(listingReportMessage({ topic: 'listing', slug: '<script>' }, 'x')).toBe('');
    expect(listingReportMessage({ topic: 'listing', slug: ['a', 'b'] }, 'x')).toBe('');
    expect(listingReportMessage({ topic: 'listing', slug: 'a'.repeat(101) }, 'x')).toBe('');
  });
});

describe('formatVerifiedDate (F-116)', () => {
  it('formats the date in Japan time for each locale', () => {
    // 2026-10-31T16:00Z は日本時間 11 月 1 日
    expect(formatVerifiedDate('2026-10-31T16:00:00.000Z', 'ja')).toBe('2026年11月1日');
    expect(formatVerifiedDate('2026-10-31T16:00:00.000Z', 'en')).toBe('November 1, 2026');
    expect(formatVerifiedDate('2026-10-31T16:00:00.000Z', 'zh')).toBe('2026年11月1日');
    expect(formatVerifiedDate('2026-10-31T16:00:00.000Z', 'vi')).toContain('2026');
  });
});

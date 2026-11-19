import { describe, it, expect } from 'vitest';
import type { ListingRequest, ServiceListing } from '@prisma/client';
import { toServiceDetail } from '../repositories/prismaServiceRepository';
import { toListingRequestRecord } from '../repositories/prismaListingRequestRepository';

// F-120: 中国語を廃止した後も、DB に残る zh のデータでエラーにならず、応答に出さない
const now = new Date('2026-11-19T00:00:00Z');

describe('legacy zh data in the DB (F-120)', () => {
  it('omits zh from listings', () => {
    const row = {
      id: 'l1',
      slug: 'legacy',
      category: 'medical',
      prefecture: 'tokyo',
      city: null,
      supportedLanguages: ['ja', 'en', 'zh', 'vi'],
      name: { en: 'Clinic', ja: 'クリニック', zh: '诊所' },
      description: { en: 'Desc', zh: '说明' },
      address: { en: 'Tokyo', zh: '东京' },
      phone: null,
      websiteUrl: null,
      imageKey: null,
      corporateNumber: null,
      sources: null,
      lastVerifiedAt: null,
      searchText: 'clinic 诊所',
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    } as ServiceListing;
    const detail = toServiceDetail(row);
    expect(detail.supportedLanguages).toEqual(['ja', 'en', 'vi']);
    expect(detail.name).toEqual({ en: 'Clinic', ja: 'クリニック' });
    expect(detail.description).toEqual({ en: 'Desc' });
    expect(detail.address).toEqual({ en: 'Tokyo' });
    expect(JSON.stringify(detail)).not.toContain('zh');
  });

  it('omits zh from listing requests', () => {
    const row = {
      id: 'r1',
      status: 'pending',
      category: 'telecom',
      prefecture: 'osaka',
      city: null,
      supportedLanguages: ['zh', 'en'],
      name: { en: 'Shop', zh: '店' },
      description: { en: 'SIM' },
      address: null,
      phone: null,
      websiteUrl: null,
      contactName: 'Kato',
      contactEmail: 'kato@example.com',
      createdAt: now,
      updatedAt: now,
    } as ListingRequest;
    const record = toListingRequestRecord(row);
    expect(record.supportedLanguages).toEqual(['en']);
    expect(record.name).toEqual({ en: 'Shop' });
    expect(record.address).toBeUndefined();
  });
});

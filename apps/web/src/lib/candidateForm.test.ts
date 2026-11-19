import { describe, it, expect } from 'vitest';
import type { AdminCandidateDetail } from '@fss/shared/collector';
import { candidateFormDefaults, suggestCandidateSlug } from './candidateForm';

const detail = (overrides: Partial<AdminCandidateDetail> = {}) =>
  ({
    sourceRecordId: '13/0001',
    extracted: { category: 'medical', prefecture: 'tokyo', supportedLanguages: ['ja', 'vi'], name: { ja: '医療法人 さくら' }, phone: '03-1111-1111' },
    matchedListing: null,
    ...overrides,
  }) as AdminCandidateDetail;

describe('suggestCandidateSlug (F-113)', () => {
  it('uses the English name, or the source record id when there is none', () => {
    expect(suggestCandidateSlug({ category: 'medical', prefecture: 'tokyo', supportedLanguages: [], name: { en: 'Sakura Clinic!' } }, 'x')).toBe(
      'medical-sakura-clinic-tokyo',
    );
    expect(suggestCandidateSlug(detail().extracted, '13/0001')).toBe('medical-13-0001-tokyo');
  });
});

describe('candidateFormDefaults (F-113)', () => {
  it('builds defaults for a new listing from the extracted values (unpublished)', () => {
    expect(candidateFormDefaults(detail())).toMatchObject({
      slug: 'medical-13-0001-tokyo',
      category: 'medical',
      name: { ja: '医療法人 さくら' },
      description: {},
      address: null,
      phone: '03-1111-1111',
      supportedLanguages: ['ja', 'vi'],
      isPublished: false,
    });
  });

  it('overlays the extracted values on the matched listing for an update candidate', () => {
    const matchedListing = {
      slug: 'sakura-clinic',
      city: '新宿区',
      phone: '03-0000-0000',
      websiteUrl: 'https://sakura.example/',
      supportedLanguages: ['en', 'ja'],
      name: { en: 'Sakura Clinic', ja: 'さくら' },
      description: { en: 'Clinic.' },
      address: { en: 'Shinjuku' },
      imageKey: null,
      imageUrl: null,
      isPublished: true,
    } as unknown as AdminCandidateDetail['matchedListing'];
    expect(candidateFormDefaults(detail({ matchedListing }))).toMatchObject({
      slug: 'sakura-clinic',
      city: '新宿区',
      phone: '03-1111-1111',
      websiteUrl: 'https://sakura.example/',
      supportedLanguages: ['en', 'ja', 'vi'],
      name: { en: 'Sakura Clinic', ja: '医療法人 さくら' },
      description: { en: 'Clinic.' },
      address: { en: 'Shinjuku' },
      isPublished: true,
    });
  });
});

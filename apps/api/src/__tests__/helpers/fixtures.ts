import type { LocalizedText, PrefectureCode, ServiceCategory, SupportedLocale } from '@fss/shared';
import { createApp, type AppOptions } from '../../app';
import { createLogMailer } from '../../mail/mailer';
import { createInMemoryInquiryRepository } from '../../repositories/inquiryRepository';
import { createInMemoryListingRequestRepository } from '../../repositories/listingRequestRepository';
import { createLocalStorage } from '../../storage/storage';
import {
  createInMemoryServiceRepository,
  type InMemoryServiceRecord,
} from '../../repositories/inMemoryServiceRepository';

let seq = 0;

export function makeRecord(
  overrides: Partial<InMemoryServiceRecord> & {
    category?: ServiceCategory;
    prefecture?: PrefectureCode;
    supportedLanguages?: SupportedLocale[];
    name?: LocalizedText;
  } = {},
): InMemoryServiceRecord {
  seq += 1;
  const name = overrides.name ?? { en: `Service ${seq}`, ja: `サービス${seq}` };
  const description = overrides.description ?? { en: `Description ${seq}` };
  return {
    id: `id-${seq}`,
    slug: `service-${seq}`,
    category: 'medical',
    prefecture: 'tokyo',
    city: null,
    supportedLanguages: ['ja', 'en'],
    address: null,
    phone: null,
    websiteUrl: null,
    imageKey: null,
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
    isPublished: true,
    ...overrides,
    name,
    description,
    searchText: [...Object.values(name), ...Object.values(description)].join(' ').toLowerCase(),
  };
}

export function testApp(records: InMemoryServiceRecord[] = [], overrides: Partial<AppOptions> = {}) {
  return createApp({
    serviceRepository: createInMemoryServiceRepository(records),
    inquiryRepository: createInMemoryInquiryRepository(),
    listingRequestRepository: createInMemoryListingRequestRepository(),
    mailer: createLogMailer(() => {}),
    auth: { mode: 'dev' },
    storage: createLocalStorage({ apiBaseUrl: 'http://localhost:4000', secret: 'test-secret' }),
    ...overrides,
  });
}

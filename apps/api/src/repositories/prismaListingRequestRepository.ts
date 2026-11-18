import type { ListingRequest, PrismaClient } from '@prisma/client';
import type { ListingRequestInput, LocalizedText } from '@fss/shared';
import type { ListingRequestRecord, ListingRequestRepository } from './listingRequestRepository';

export function toListingRequestRecord(row: ListingRequest): ListingRequestRecord {
  return {
    ...row,
    category: row.category as ListingRequestInput['category'],
    prefecture: row.prefecture as ListingRequestInput['prefecture'],
    supportedLanguages: row.supportedLanguages as ListingRequestInput['supportedLanguages'],
    city: row.city ?? undefined,
    name: row.name as LocalizedText,
    description: row.description as LocalizedText,
    address: (row.address as LocalizedText | null) ?? undefined,
    phone: row.phone ?? undefined,
    websiteUrl: row.websiteUrl ?? undefined,
  };
}

export function createPrismaListingRequestRepository(prisma: PrismaClient): ListingRequestRepository {
  return {
    async create(input) {
      const row = await prisma.listingRequest.create({ data: { ...input, status: 'pending' } });
      return toListingRequestRecord(row);
    },
  };
}

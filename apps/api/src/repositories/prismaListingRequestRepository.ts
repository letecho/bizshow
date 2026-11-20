import { Prisma, type ListingRequest, type PrismaClient } from '@prisma/client';
import type { ListingRequestInput, LocalizedText } from '@fss/shared';
import type { ListingRequestRecord, ListingRequestRepository } from './listingRequestRepository';

export function toListingRequestRecord(row: ListingRequest): ListingRequestRecord {
  return {
    ...row,
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

    async list({ status, page, limit }) {
      const where = { status };
      const [rows, total] = await prisma.$transaction([
        prisma.listingRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.listingRequest.count({ where }),
      ]);
      return { items: rows.map(toListingRequestRecord), total };
    },

    async findById(id) {
      const row = await prisma.listingRequest.findUnique({ where: { id } });
      return row ? toListingRequestRecord(row) : null;
    },

    async setStatus(id, status) {
      try {
        return toListingRequestRecord(await prisma.listingRequest.update({ where: { id }, data: { status } }));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
        throw err;
      }
    },
  };
}

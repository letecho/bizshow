import type { Prisma, PrismaClient, ServiceListing } from '@prisma/client';
import type { LocalizedText, PrefectureCode, ServiceCategory, ServiceSummary, SupportedLocale } from '@fss/shared';
import type { ServiceRepository } from './serviceRepository';

export function toServiceSummary(row: ServiceListing): ServiceSummary {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category as ServiceCategory,
    prefecture: row.prefecture as PrefectureCode,
    city: row.city,
    supportedLanguages: row.supportedLanguages as SupportedLocale[],
    name: row.name as LocalizedText,
  };
}

export function createPrismaServiceRepository(prisma: PrismaClient): ServiceRepository {
  return {
    async search({ q, category, prefecture, lang, page, limit }) {
      const where: Prisma.ServiceListingWhereInput = {
        isPublished: true,
        category,
        prefecture,
        ...(lang && { supportedLanguages: { has: lang } }),
        ...(q && { searchText: { contains: q.toLowerCase(), mode: 'insensitive' } }),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.serviceListing.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.serviceListing.count({ where }),
      ]);
      return { items: rows.map(toServiceSummary), total };
    },
  };
}

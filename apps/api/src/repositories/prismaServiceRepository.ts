import { Prisma, type PrismaClient, type ServiceListing } from '@prisma/client';
import type {
  AdminService,
  AdminServiceInput,
  LocalizedText,
  PrefectureCode,
  ServiceCategory,
  ServiceDetail,
  ServiceSummary,
  SupportedLocale,
} from '@fss/shared';
import { parseListingSources } from '@fss/shared';
import { buildSearchText } from '../db/searchText';
import { imageUrlFor } from '../storage/storage';
import { SlugConflictError, type ServiceAdminRepository, type ServiceRepository } from './serviceRepository';

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

export function toServiceDetail(row: ServiceListing): ServiceDetail {
  return {
    ...toServiceSummary(row),
    description: row.description as LocalizedText,
    address: row.address as LocalizedText | null,
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    imageUrl: imageUrlFor(row.imageKey),
    sources: parseListingSources(row.sources),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminService(row: ServiceListing): AdminService {
  return {
    ...toServiceDetail(row),
    isPublished: row.isPublished,
    imageKey: row.imageKey,
    createdAt: row.createdAt.toISOString(),
  };
}

/** PUT は全項目置き換えのため、未入力の任意項目は null にする */
function toData(input: AdminServiceInput) {
  return {
    ...input,
    city: input.city ?? null,
    address: input.address ?? Prisma.DbNull,
    phone: input.phone ?? null,
    websiteUrl: input.websiteUrl ?? null,
    imageKey: input.imageKey ?? null,
    searchText: buildSearchText(input.name, input.description),
  };
}

const isPrismaError = (err: unknown, code: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

/** unique 違反 → SlugConflictError、対象なし → null */
async function write(slug: string | undefined, fn: () => Promise<ServiceListing>): Promise<AdminService | null> {
  try {
    return toAdminService(await fn());
  } catch (err) {
    if (slug && isPrismaError(err, 'P2002')) throw new SlugConflictError(slug);
    if (isPrismaError(err, 'P2025')) return null;
    throw err;
  }
}

export function createPrismaServiceRepository(prisma: PrismaClient): ServiceRepository & ServiceAdminRepository {
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

    async findBySlug(slug) {
      const row = await prisma.serviceListing.findFirst({ where: { slug, isPublished: true } });
      return row ? toServiceDetail(row) : null;
    },

    async adminList({ q, published, staleBefore, page, limit }) {
      const where: Prisma.ServiceListingWhereInput = {
        isPublished: published,
        // 収集した掲載（出典あり）のうち、確認日が無いか基準日より前のもの
        ...(staleBefore && {
          sources: { not: Prisma.DbNull },
          AND: [{ OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleBefore } }] }],
        }),
        ...(q && {
          OR: [
            { searchText: { contains: q.toLowerCase(), mode: 'insensitive' } },
            { slug: { contains: q.toLowerCase() } },
          ],
        }),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.serviceListing.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
        prisma.serviceListing.count({ where }),
      ]);
      return { items: rows.map(toAdminService), total };
    },

    async adminFindById(id) {
      const row = await prisma.serviceListing.findUnique({ where: { id } });
      return row ? toAdminService(row) : null;
    },

    async create(input) {
      return (await write(input.slug, () => prisma.serviceListing.create({ data: toData(input) })))!;
    },

    update(id, input) {
      return write(input.slug, () => prisma.serviceListing.update({ where: { id }, data: toData(input) }));
    },

    setPublished(id, isPublished) {
      return write(undefined, () => prisma.serviceListing.update({ where: { id }, data: { isPublished } }));
    },

    delete(id) {
      return write(undefined, () => prisma.serviceListing.delete({ where: { id } }));
    },
  };
}

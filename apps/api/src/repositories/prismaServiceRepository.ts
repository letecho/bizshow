import { Prisma, type PrismaClient, type ServiceListing } from '@prisma/client';
import type {
  AdminService,
  AdminServiceInput,
  LocalizedText,
  PrefectureCode,
  ServiceDetail,
  ServiceSummary,
  SupportedLocale,
} from '@fss/shared';
import { parseListingSources } from '@fss/shared';
import { buildSearchText } from '../db/searchText';
import { imageUrlFor } from '../storage/storage';
import type { ListingProvenance } from './candidateRepository';
import { SlugConflictError, type ServiceAdminRepository, type ServiceRepository } from './serviceRepository';

export function toServiceSummary(row: ServiceListing): ServiceSummary {
  return {
    id: row.id,
    slug: row.slug,
    categories: row.categories,
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

/** 出典・確認日・法人番号（候補の承認時のみ。手入力の保存では既存の値を変えない） */
export function provenanceData(provenance?: ListingProvenance) {
  if (!provenance) return {};
  return {
    sources: provenance.sources as unknown as Prisma.InputJsonValue,
    lastVerifiedAt: new Date(provenance.lastVerifiedAt),
    ...(provenance.corporateNumber && { corporateNumber: provenance.corporateNumber }),
  };
}

/** PUT は全項目置き換えのため、未入力の任意項目は null にする */
export function toData(input: AdminServiceInput) {
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

export const isPrismaError = (err: unknown, code: string) =>
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
        ...(category && { categories: { has: category } }),
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

    async create(input, provenance) {
      const data = { ...toData(input), ...provenanceData(provenance) };
      return (await write(input.slug, () => prisma.serviceListing.create({ data })))!;
    },

    update(id, input, provenance) {
      const data = { ...toData(input), ...provenanceData(provenance) };
      return write(input.slug, () => prisma.serviceListing.update({ where: { id }, data }));
    },

    setPublished(id, isPublished) {
      return write(undefined, () => prisma.serviceListing.update({ where: { id }, data: { isPublished } }));
    },

    delete(id) {
      return write(undefined, () => prisma.serviceListing.delete({ where: { id } }));
    },
  };
}

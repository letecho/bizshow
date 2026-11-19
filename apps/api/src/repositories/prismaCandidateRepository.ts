import { Prisma, type DataSource, type PrismaClient, type ServiceCandidate } from '@prisma/client';
import {
  parseListingSources,
  type AdminCandidate,
  type CandidateExtract,
  type EntityEvidence,
  type LanguageEvidence,
  type ListingSource,
} from '@fss/shared';
import {
  APPROVABLE_STATUSES,
  CandidateConflictError,
  approvalTarget,
  mergeSources,
  type CandidateRepository,
} from './candidateRepository';
import { isPrismaError, provenanceData, toAdminService, toData } from './prismaServiceRepository';
import { SlugConflictError } from './serviceRepository';

type Row = ServiceCandidate & { source: Pick<DataSource, 'name' | 'attribution'> };

const withSource = { source: { select: { name: true, attribution: true } } } as const;

function toAdminCandidate(row: Row): AdminCandidate {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: row.source.name,
    sourceUrl: row.sourceUrl,
    sourceRecordId: row.sourceRecordId,
    fetchedAt: row.fetchedAt.toISOString(),
    extracted: row.extracted as unknown as CandidateExtract,
    languageEvidence: row.languageEvidence as unknown as LanguageEvidence[],
    hasTargetLanguage: row.hasTargetLanguage,
    entityType: row.entityType,
    entityEvidence: row.entityEvidence as unknown as EntityEvidence[],
    corporateNumber: row.corporateNumber,
    matchedListingId: row.matchedListingId,
    matchType: row.matchType,
    score: row.score,
    status: row.status,
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPrismaCandidateRepository(prisma: PrismaClient): CandidateRepository {
  /** 状態が from のときだけ更新する（同時に処理されても二重に承認・却下しない） */
  async function transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: readonly AdminCandidate['status'][],
    data: Prisma.ServiceCandidateUpdateManyMutationInput,
  ): Promise<boolean> {
    const { count } = await tx.serviceCandidate.updateMany({ where: { id, status: { in: [...from] } }, data });
    if (count > 0) return true;
    const current = await tx.serviceCandidate.findUnique({ where: { id }, select: { status: true } });
    if (!current) return false;
    throw new CandidateConflictError(current.status);
  }

  async function review(id: string, from: readonly AdminCandidate['status'][], data: Prisma.ServiceCandidateUpdateManyMutationInput) {
    return prisma.$transaction(async (tx) => {
      if (!(await transition(tx, id, from, data))) return null;
      return toAdminCandidate(await tx.serviceCandidate.findUniqueOrThrow({ where: { id }, include: withSource }));
    });
  }

  return {
    async list({ status, source, category, prefecture, minScore, targetLang, page, limit }) {
      const where: Prisma.ServiceCandidateWhereInput = {
        status,
        sourceId: source,
        ...(minScore !== undefined && { score: { gte: minScore } }),
        ...(targetLang && { hasTargetLanguage: true }),
        AND: [
          ...(category ? [{ extracted: { path: ['category'], equals: category } }] : []),
          ...(prefecture ? [{ extracted: { path: ['prefecture'], equals: prefecture } }] : []),
        ],
      };
      const [rows, total] = await prisma.$transaction([
        prisma.serviceCandidate.findMany({
          where,
          include: withSource,
          orderBy: [{ hasTargetLanguage: 'desc' }, { score: 'desc' }, { createdAt: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.serviceCandidate.count({ where }),
      ]);
      return { items: rows.map(toAdminCandidate), total };
    },

    async findById(id) {
      const row = await prisma.serviceCandidate.findUnique({ where: { id }, include: withSource });
      return row ? toAdminCandidate(row) : null;
    },

    async listSources() {
      return prisma.dataSource.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
    },

    async approve(id, { input, reviewer, entity, now }) {
      try {
        return await prisma.$transaction(async (tx) => {
          const row = await tx.serviceCandidate.findUnique({ where: { id }, include: withSource });
          if (!row) return null;
          const candidate = toAdminCandidate(row);
          const claimed = await transition(tx, id, APPROVABLE_STATUSES, {
            status: 'approved',
            reviewedBy: reviewer,
            reviewedAt: now,
            reviewNote: null,
            ...(entity && { entityType: entity.entityType, entityEvidence: entity.evidence as unknown as Prisma.InputJsonValue }),
          });
          if (!claimed) return null;

          const source: ListingSource = { attribution: row.source.attribution, url: row.sourceUrl };
          const corporateNumber = candidate.corporateNumber ?? candidate.extracted.corporateNumber;
          const targetId = approvalTarget(candidate);
          const existing = targetId ? await tx.serviceListing.findUnique({ where: { id: targetId } }) : null;
          const provenance = (current: ListingSource[]) =>
            provenanceData({ sources: mergeSources(current, source), lastVerifiedAt: now.toISOString(), corporateNumber });
          const listing = existing
            ? await tx.serviceListing.update({
                where: { id: existing.id },
                data: { ...toData(input), ...provenance(parseListingSources(existing.sources)) },
              })
            : await tx.serviceListing.create({ data: { ...toData(input), ...provenance([]) } });

          const updated = await tx.serviceCandidate.update({
            where: { id },
            data: { matchedListingId: listing.id },
            include: withSource,
          });
          return { candidate: toAdminCandidate(updated), listing: toAdminService(listing), previousSlug: existing?.slug };
        });
      } catch (err) {
        if (isPrismaError(err, 'P2002')) throw new SlugConflictError(input.slug);
        throw err;
      }
    },

    reject(id, reviewer, note, now) {
      return review(id, APPROVABLE_STATUSES, { status: 'rejected', reviewedBy: reviewer, reviewedAt: now, reviewNote: note ?? null });
    },

    hold(id, reviewer, note, now) {
      return review(id, ['pending'], { status: 'on_hold', reviewedBy: reviewer, reviewedAt: now, reviewNote: note ?? null });
    },
  };
}

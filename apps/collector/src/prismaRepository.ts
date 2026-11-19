import { Prisma, type PrismaClient } from '@prisma/client';
import type { CandidateExtract, LocalizedText } from '@fss/shared';
import type { CollectorRepository } from './types';

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function createPrismaCollectorRepository(prisma: PrismaClient): CollectorRepository {
  return {
    async findSource(id) {
      return prisma.dataSource.findUnique({
        where: { id },
        select: { id: true, kind: true, name: true, url: true, isEnabled: true },
      });
    },

    async startRun(sourceId, startedAt) {
      const run = await prisma.collectionRun.create({ data: { sourceId, startedAt, status: 'running' } });
      return run.id;
    },

    async finishRun(runId, finishedAt, result) {
      await prisma.collectionRun.update({
        where: { id: runId },
        data: { ...result, errorSample: result.errorSample ?? null, finishedAt },
      });
    },

    async upsertCandidate(input) {
      const data = {
        sourceUrl: input.sourceUrl ?? null,
        fetchedAt: input.fetchedAt,
        rawKey: input.rawKey ?? null,
        extracted: json(input.extracted),
        languageEvidence: json(input.languageEvidence),
        hasTargetLanguage: input.hasTargetLanguage,
        entityType: input.entityType,
        entityEvidence: json(input.entityEvidence),
        corporateNumber: input.corporateNumber ?? null,
        matchType: input.matchType,
        matchedListingId: input.matchedListingId ?? null,
        score: input.score,
      };
      const key = { sourceId: input.sourceId, sourceRecordId: input.sourceRecordId };
      const existing = await prisma.serviceCandidate.findUnique({
        where: { sourceId_sourceRecordId: key },
        select: { id: true, status: true },
      });
      if (!existing) {
        try {
          await prisma.serviceCandidate.create({ data: { ...key, ...data } });
          return 'created';
        } catch (err) {
          // 同時実行で先に作られた場合は既存として扱う
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'kept';
          throw err;
        }
      }
      // レビュー済み（承認・却下・保留）の候補は上書きしない
      if (existing.status !== 'pending') return 'kept';
      await prisma.serviceCandidate.update({ where: { id: existing.id }, data });
      return 'updated';
    },

    async loadBlocklist() {
      return prisma.crawlBlocklist.findMany({ select: { domain: true, corporateNumber: true } });
    },

    async loadMatchTargets() {
      const [listings, candidates] = await Promise.all([
        prisma.serviceListing.findMany({
          select: { id: true, name: true, prefecture: true, address: true, phone: true, corporateNumber: true },
        }),
        prisma.serviceCandidate.findMany({
          where: { status: 'pending' },
          select: { id: true, sourceId: true, sourceRecordId: true, extracted: true, corporateNumber: true },
        }),
      ]);
      const texts = (t: unknown) => Object.values((t ?? {}) as Partial<LocalizedText>).filter((v): v is string => Boolean(v));
      return [
        ...listings.map((l) => ({
          kind: 'listing' as const,
          id: l.id,
          names: texts(l.name),
          prefecture: l.prefecture,
          phone: l.phone,
          address: (l.address as Partial<LocalizedText> | null)?.ja ?? texts(l.address)[0],
          corporateNumber: l.corporateNumber,
        })),
        ...candidates.map((c) => {
          const e = c.extracted as unknown as CandidateExtract;
          return {
            kind: 'candidate' as const,
            id: c.id,
            sourceId: c.sourceId,
            sourceRecordId: c.sourceRecordId,
            names: texts(e.name),
            prefecture: e.prefecture,
            phone: e.phone,
            address: e.address?.ja ?? e.address?.en,
            corporateNumber: c.corporateNumber,
          };
        }),
      ];
    },
  };
}

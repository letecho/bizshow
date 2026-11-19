import type { OutreachMessage, PrismaClient } from '@prisma/client';
import type { OutreachRecord } from '@fss/shared';
import type { OutreachRepository } from './outreachRepository';

function toRecord(row: OutreachMessage): OutreachRecord {
  return {
    id: row.id,
    candidateId: row.candidateId,
    email: row.email,
    publishedUrl: row.publishedUrl,
    status: row.status,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
  };
}

const ACTIVE = { in: ['pending', 'sent'] as ('pending' | 'sent')[] };

export function createPrismaOutreachRepository(prisma: PrismaClient): OutreachRepository {
  return {
    async create(args) {
      return toRecord(await prisma.outreachMessage.create({ data: args }));
    },
    async setStatus(id, status) {
      await prisma.outreachMessage.update({ where: { id }, data: { status } });
    },
    async findById(id) {
      const row = await prisma.outreachMessage.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },
    async listByCandidate(candidateId) {
      const rows = await prisma.outreachMessage.findMany({ where: { candidateId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toRecord);
    },
    async countSentSince(since) {
      return prisma.outreachMessage.count({ where: { status: ACTIVE, createdAt: { gte: since } } });
    },
    async hasSentTo(email) {
      return (await prisma.outreachMessage.count({ where: { email, status: ACTIVE } })) > 0;
    },
    async isOptedOut(email) {
      return (await prisma.outreachOptOut.count({ where: { email } })) > 0;
    },
    async addOptOut(email, source) {
      await prisma.outreachOptOut.upsert({ where: { email }, create: { email, source }, update: {} });
    },
  };
}

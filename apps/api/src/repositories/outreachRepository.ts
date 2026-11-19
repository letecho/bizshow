import type { OutreachRecord, OutreachStatus } from '@fss/shared';

export interface CreateOutreachArgs {
  candidateId: string;
  email: string;
  publishedUrl: string;
  sentBy: string;
}

/** 掲載案内の送信履歴と受信拒否（F-118）。Prisma 実装（本番）と InMemory 実装（テスト）を app に注入する */
export interface OutreachRepository {
  /** status=pending で作成する（送信後に setStatus で sent / failed にする） */
  create(args: CreateOutreachArgs): Promise<OutreachRecord>;
  setStatus(id: string, status: OutreachStatus): Promise<void>;
  findById(id: string): Promise<OutreachRecord | null>;
  /** createdAt 降順 */
  listByCandidate(candidateId: string): Promise<OutreachRecord[]>;
  /** since 以降に作成した pending / sent の件数（1 日の上限） */
  countSentSince(since: Date): Promise<number>;
  /** この宛先に pending / sent の履歴があるか（同じ宛先へは再送しない） */
  hasSentTo(email: string): Promise<boolean>;
  isOptedOut(email: string): Promise<boolean>;
  /** 登録済みなら何もしない */
  addOptOut(email: string, source: 'link' | 'admin'): Promise<void>;
}

export function createInMemoryOutreachRepository(): OutreachRepository & {
  records: OutreachRecord[];
  optOuts: Map<string, 'link' | 'admin'>;
} {
  const records: OutreachRecord[] = [];
  const optOuts = new Map<string, 'link' | 'admin'>();
  let seq = 0;
  const active = (r: OutreachRecord) => r.status !== 'failed';
  return {
    records,
    optOuts,
    async create(args) {
      seq += 1;
      const record: OutreachRecord = { id: `outreach-${seq}`, ...args, status: 'pending', createdAt: new Date().toISOString() };
      records.push(record);
      return { ...record };
    },
    async setStatus(id, status) {
      const record = records.find((r) => r.id === id);
      if (record) record.status = status;
    },
    async findById(id) {
      const record = records.find((r) => r.id === id);
      return record ? { ...record } : null;
    },
    async listByCandidate(candidateId) {
      return records
        .filter((r) => r.candidateId === candidateId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({ ...r }));
    },
    async countSentSince(since) {
      return records.filter((r) => active(r) && new Date(r.createdAt) >= since).length;
    },
    async hasSentTo(email) {
      return records.some((r) => active(r) && r.email === email);
    },
    async isOptedOut(email) {
      return optOuts.has(email);
    },
    async addOptOut(email, source) {
      if (!optOuts.has(email)) optOuts.set(email, source);
    },
  };
}

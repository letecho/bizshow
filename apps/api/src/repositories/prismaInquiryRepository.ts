import type { PrismaClient } from '@prisma/client';
import type { InquiryRepository } from './inquiryRepository';

export function createPrismaInquiryRepository(prisma: PrismaClient): InquiryRepository {
  return {
    create: (input) => prisma.inquiry.create({ data: input }),
  };
}

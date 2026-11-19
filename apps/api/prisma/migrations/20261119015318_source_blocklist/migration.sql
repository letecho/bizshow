-- CreateEnum
CREATE TYPE "CrawlBlockReason" AS ENUM ('optout', 'terms', 'robots');

-- AlterTable
ALTER TABLE "ServiceListing" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "sources" JSONB;

-- CreateTable
CREATE TABLE "CrawlBlocklist" (
    "id" TEXT NOT NULL,
    "domain" TEXT,
    "corporateNumber" TEXT,
    "reason" "CrawlBlockReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlBlocklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlBlocklist_domain_idx" ON "CrawlBlocklist"("domain");

-- CreateIndex
CREATE INDEX "CrawlBlocklist_corporateNumber_idx" ON "CrawlBlocklist"("corporateNumber");

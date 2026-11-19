-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('open_data', 'api', 'crawl', 'partner');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "CandidateEntityType" AS ENUM ('corporation', 'public', 'individual', 'unknown');

-- CreateEnum
CREATE TYPE "CandidateMatchType" AS ENUM ('new', 'update', 'duplicate');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('pending', 'approved', 'rejected', 'on_hold');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "kind" "DataSourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "schedule" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'running',
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "skippedByLimitCount" INTEGER NOT NULL DEFAULT 0,
    "skippedByLanguageCount" INTEGER NOT NULL DEFAULT 0,
    "skippedByEntityCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorSample" TEXT,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCandidate" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRecordId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "rawKey" TEXT,
    "extracted" JSONB NOT NULL,
    "languageEvidence" JSONB NOT NULL,
    "hasTargetLanguage" BOOLEAN NOT NULL DEFAULT false,
    "entityType" "CandidateEntityType" NOT NULL,
    "entityEvidence" JSONB NOT NULL,
    "corporateNumber" TEXT,
    "matchedListingId" TEXT,
    "matchType" "CandidateMatchType" NOT NULL DEFAULT 'new',
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "CandidateStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionRun_sourceId_startedAt_idx" ON "CollectionRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "ServiceCandidate_status_hasTargetLanguage_score_idx" ON "ServiceCandidate"("status", "hasTargetLanguage", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCandidate_sourceId_sourceRecordId_key" ON "ServiceCandidate"("sourceId", "sourceRecordId");

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCandidate" ADD CONSTRAINT "ServiceCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ListingRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "ListingRequest" (
    "id" TEXT NOT NULL,
    "status" "ListingRequestStatus" NOT NULL DEFAULT 'pending',
    "category" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT,
    "supportedLanguages" TEXT[],
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "address" JSONB,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingRequest_status_createdAt_idx" ON "ListingRequest"("status", "createdAt");

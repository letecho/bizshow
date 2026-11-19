-- AlterTable
ALTER TABLE "ServiceListing" ADD COLUMN     "corporateNumber" TEXT;

-- CreateIndex
CREATE INDEX "ServiceListing_corporateNumber_idx" ON "ServiceListing"("corporateNumber");

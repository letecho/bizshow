-- CreateTable
CREATE TABLE "ServiceListing" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prefecture" TEXT NOT NULL,
    "city" TEXT,
    "supportedLanguages" TEXT[],
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "address" JSONB,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "searchText" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceListing_slug_key" ON "ServiceListing"("slug");

-- CreateIndex
CREATE INDEX "ServiceListing_category_prefecture_idx" ON "ServiceListing"("category", "prefecture");

-- CreateIndex
CREATE INDEX "ServiceListing_isPublished_idx" ON "ServiceListing"("isPublished");


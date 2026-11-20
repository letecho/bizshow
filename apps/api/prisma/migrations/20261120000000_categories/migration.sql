-- F-121: カテゴリのテーブル化と掲載の複数カテゴリ

-- CreateTable
CREATE TABLE "Category" (
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("code")
);

-- 初期 8 カテゴリ（packages/shared の INITIAL_CATEGORY_NAMES と同じ名前・並び順）
INSERT INTO "Category" ("code", "name", "sortOrder", "updatedAt") VALUES
    ('medical',   '{"ja":"医療","en":"Medical","vi":"Y tế"}', 0, CURRENT_TIMESTAMP),
    ('legal',     '{"ja":"法律・ビザ","en":"Legal & Visa","vi":"Pháp lý & Visa"}', 1, CURRENT_TIMESTAMP),
    ('housing',   '{"ja":"住まい","en":"Housing","vi":"Nhà ở"}', 2, CURRENT_TIMESTAMP),
    ('telecom',   '{"ja":"通信","en":"Phone & Internet","vi":"Điện thoại & Internet"}', 3, CURRENT_TIMESTAMP),
    ('finance',   '{"ja":"銀行・お金","en":"Banking & Money","vi":"Ngân hàng & Tiền"}', 4, CURRENT_TIMESTAMP),
    ('education', '{"ja":"教育","en":"Education","vi":"Giáo dục"}', 5, CURRENT_TIMESTAMP),
    ('work',      '{"ja":"仕事","en":"Work","vi":"Việc làm"}', 6, CURRENT_TIMESTAMP),
    ('daily',     '{"ja":"生活","en":"Daily Life","vi":"Đời sống"}', 7, CURRENT_TIMESTAMP);

-- ServiceListing: category → categories（既存データは [旧 category] に移す）
ALTER TABLE "ServiceListing" ADD COLUMN "categories" TEXT[];
UPDATE "ServiceListing" SET "categories" = ARRAY["category"];
DROP INDEX "ServiceListing_category_prefecture_idx";
ALTER TABLE "ServiceListing" DROP COLUMN "category";

-- ListingRequest: category → categories
ALTER TABLE "ListingRequest" ADD COLUMN "categories" TEXT[];
UPDATE "ListingRequest" SET "categories" = ARRAY["category"];
ALTER TABLE "ListingRequest" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "ServiceListing_prefecture_idx" ON "ServiceListing"("prefecture");

-- CreateIndex
CREATE INDEX "ServiceListing_categories_idx" ON "ServiceListing" USING GIN ("categories");

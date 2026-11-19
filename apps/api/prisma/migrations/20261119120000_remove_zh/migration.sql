-- 対応言語を ja / en / vi にしたため、既存データから zh を削除する

-- ServiceListing: 対応言語・名称・説明・住所の zh を削除し、検索用テキストを作り直す
UPDATE "ServiceListing"
SET "supportedLanguages" = array_remove("supportedLanguages", 'zh'),
    "name" = "name" - 'zh',
    "description" = "description" - 'zh',
    "address" = CASE WHEN "address" IS NULL THEN NULL ELSE "address" - 'zh' END;

UPDATE "ServiceListing" AS l
SET "searchText" = lower(
  coalesce((SELECT string_agg(value, ' ') FROM jsonb_each_text(l."name")), '') || ' ' ||
  coalesce((SELECT string_agg(value, ' ') FROM jsonb_each_text(l."description")), '')
);

-- ListingRequest: 対応言語・名称・説明・住所の zh を削除
UPDATE "ListingRequest"
SET "supportedLanguages" = array_remove("supportedLanguages", 'zh'),
    "name" = "name" - 'zh',
    "description" = "description" - 'zh',
    "address" = CASE WHEN "address" IS NULL THEN NULL ELSE "address" - 'zh' END;

-- ServiceCandidate: 抽出値の対応言語・名称・説明・住所、対応言語の根拠から zh を削除
UPDATE "ServiceCandidate"
SET "extracted" = jsonb_set(
      "extracted",
      '{supportedLanguages}',
      coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements("extracted"->'supportedLanguages') AS v WHERE v <> '"zh"'::jsonb), '[]'::jsonb)
    )
WHERE jsonb_typeof("extracted"->'supportedLanguages') = 'array';

UPDATE "ServiceCandidate"
SET "extracted" = jsonb_set("extracted", '{name}', ("extracted"->'name') - 'zh')
WHERE jsonb_typeof("extracted"->'name') = 'object';

UPDATE "ServiceCandidate"
SET "extracted" = jsonb_set("extracted", '{description}', ("extracted"->'description') - 'zh')
WHERE jsonb_typeof("extracted"->'description') = 'object';

UPDATE "ServiceCandidate"
SET "extracted" = jsonb_set("extracted", '{address}', ("extracted"->'address') - 'zh')
WHERE jsonb_typeof("extracted"->'address') = 'object';

UPDATE "ServiceCandidate"
SET "languageEvidence" = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements("languageEvidence") AS e WHERE e->>'lang' IS DISTINCT FROM 'zh'), '[]'::jsonb)
WHERE jsonb_typeof("languageEvidence") = 'array';

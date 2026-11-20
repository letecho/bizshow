import type { AdminCandidateDetail, CandidateExtract } from '@fss/shared/collector';
import { LISTING_CATEGORIES_MAX, type AdminService, type LocalizedText } from '@fss/shared/domain';

// F-113: 候補の承認フォームの初期値（既存掲載があればその値に、候補の抽出値を重ねる）

const toSlugPart = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** 新規掲載の slug の候補（英語名、無ければ収集元のレコード ID から。管理者が修正できる） */
export function suggestCandidateSlug(extracted: CandidateExtract, sourceRecordId: string): string {
  const base = toSlugPart(extracted.name.en ?? '').slice(0, 60) || toSlugPart(sourceRecordId).slice(0, 40) || 'service';
  return [extracted.category, base, extracted.prefecture].join('-').slice(0, 100).replace(/-+$/, '');
}

/** 抽出値の部分的な多言語テキストを、既存の値に重ねる（en が無いときは既存の en を残す） */
function mergeText(current: LocalizedText | null | undefined, added: Partial<LocalizedText> | undefined) {
  const merged = { ...(current ?? {}), ...Object.fromEntries(Object.entries(added ?? {}).filter(([, v]) => v)) };
  return merged as LocalizedText;
}

export function candidateFormDefaults(detail: AdminCandidateDetail): Partial<AdminService> {
  const e = detail.extracted;
  const base = detail.matchedListing;
  return {
    slug: base?.slug ?? suggestCandidateSlug(e, detail.sourceRecordId),
    // 既存掲載の更新では、管理者が付けたカテゴリを残し、候補のカテゴリが無ければ末尾に加える（F-121）
    categories: base
      ? base.categories.includes(e.category)
        ? base.categories
        : [...base.categories, e.category].slice(0, LISTING_CATEGORIES_MAX)
      : [e.category],
    prefecture: e.prefecture,
    city: e.city ?? base?.city ?? null,
    phone: e.phone ?? base?.phone ?? null,
    websiteUrl: e.websiteUrl ?? base?.websiteUrl ?? null,
    supportedLanguages: [...new Set([...(base?.supportedLanguages ?? []), ...e.supportedLanguages])],
    name: mergeText(base?.name, e.name),
    description: mergeText(base?.description, e.description),
    address: e.address || base?.address ? mergeText(base?.address, e.address) : null,
    imageKey: base?.imageKey ?? null,
    imageUrl: base?.imageUrl ?? null,
    isPublished: base?.isPublished ?? false,
  };
}

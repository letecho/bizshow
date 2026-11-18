import { SUPPORTED_LOCALES } from '@fss/shared/domain';

/** {field}_{locale} の入力欄を LocalizedText 形の object にまとめる。全言語空欄なら undefined */
function localized(form: FormData, field: string): Record<string, string> | undefined {
  const entries = SUPPORTED_LOCALES.map((l) => [l, String(form.get(`${field}_${l}`) ?? '').trim()] as const);
  if (entries.every(([, v]) => v === '')) return undefined;
  return Object.fromEntries(entries);
}

/**
 * 掲載フォームの FormData を ListingFieldsSchema / ListingRequestInputSchema に渡せる形に変換する。
 * 検証はスキーマ側で行う（ここでは整形のみ）
 */
export function listingFormToInput(form: FormData): Record<string, unknown> {
  const text = (key: string) => String(form.get(key) ?? '');
  return {
    category: text('category'),
    prefecture: text('prefecture'),
    city: text('city'),
    supportedLanguages: form.getAll('supportedLanguages').map(String),
    name: localized(form, 'name') ?? {},
    description: localized(form, 'description') ?? {},
    address: localized(form, 'address'),
    phone: text('phone'),
    websiteUrl: text('websiteUrl'),
    contactName: text('contactName'),
    contactEmail: text('contactEmail'),
  };
}

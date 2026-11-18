import { PREFECTURES, type SupportedLocale } from '@fss/shared/domain';

/** 都道府県名。ja は日本語、それ以外は英語表記 */
export function prefectureName(code: string, locale: SupportedLocale): string {
  const pref = PREFECTURES.find((p) => p.code === code);
  if (!pref) return code;
  return locale === 'ja' ? pref.ja : pref.en;
}

/** "{total} 件" のような辞書テンプレートを埋める */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

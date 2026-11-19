import type { SupportedLocale } from '@fss/shared/domain';
import en from './dictionaries/en.json';
import ja from './dictionaries/ja.json';
import vi from './dictionaries/vi.json';

/** en.json がキーの正。他言語は部分的でもよい（欠損キーは en） */
export type Dictionary = typeof en;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const dictionaries: Record<SupportedLocale, DeepPartial<Dictionary>> = { en, ja, vi };

function mergeWithFallback<T extends object>(base: T, override: DeepPartial<T> | undefined): T {
  const result = { ...base };
  for (const key of Object.keys(base) as (keyof T)[]) {
    const b = base[key];
    const o = override?.[key];
    if (b && typeof b === 'object') {
      result[key] = mergeWithFallback(b as object, o as DeepPartial<object>) as T[keyof T];
    } else if (typeof o === 'string' && o !== '') {
      result[key] = o as T[keyof T];
    }
  }
  return result;
}

export function getDictionary(locale: SupportedLocale): Dictionary {
  return mergeWithFallback(en, dictionaries[locale]);
}

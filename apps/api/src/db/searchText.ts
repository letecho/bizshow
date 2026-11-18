import type { LocalizedText } from '@fss/shared';

/** 全言語の name + description を小文字で連結した検索用テキストを作る（保存・更新時に必ず再生成する） */
export function buildSearchText(name: LocalizedText, description: LocalizedText): string {
  return [...Object.values(name), ...Object.values(description)]
    .filter((v): v is string => Boolean(v))
    .join(' ')
    .toLowerCase();
}

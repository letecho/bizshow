/** zod の issue（path のみ使う） */
type IssueLike = { path: readonly PropertyKey[] };

/**
 * 検証エラーの issue を、誤りのある入力欄の name（重複なし・出現順）に変換する。
 * 多言語の入力欄は `{field}_{locale}`（例: path ['name', 'en'] → 'name_en'）
 */
export function invalidFieldNames(issues: readonly IssueLike[]): string[] {
  const names = issues
    .map((issue) => issue.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('_'))
    .filter((name) => name !== '');
  return [...new Set(names)];
}

/** 誤りのある入力欄に付ける属性（aria-invalid と、エラー文への aria-describedby） */
export function invalidProps(invalid: readonly string[], name: string, errorId: string) {
  return invalid.includes(name) ? { 'aria-invalid': true as const, 'aria-describedby': errorId } : {};
}

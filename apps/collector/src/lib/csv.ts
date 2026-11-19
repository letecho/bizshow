/** RFC 4180 の CSV を行の配列にする（ダブルクォート・"" のエスケープ・改行を含む値・CRLF/LF・BOM に対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 空行は捨てる
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** 1 行目を見出しとして、各行を { 見出し: 値 } にする */
export function csvToRecords(rows: string[][]): { header: string[]; records: Record<string, string>[] } {
  const [header = [], ...body] = rows;
  const names = header.map((h) => h.trim());
  return {
    header: names,
    records: body.map((r) => Object.fromEntries(names.map((h, i) => [h, r[i] ?? '']))),
  };
}

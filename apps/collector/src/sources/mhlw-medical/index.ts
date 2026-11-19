import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { ENTITY_TYPES, PREFECTURES, SUPPORTED_LOCALES, type LanguageEvidence, type SupportedLocale } from '@fss/shared';
import { csvToRecords, parseCsv } from '../../lib/csv';
import { readZipEntries } from '../../lib/zip';
import type { AdapterContext, CollectedRecord, SourceAdapter } from '../../types';
import defaultMapping from './mapping.json';

export const MHLW_MEDICAL_SOURCE_ID = 'mhlw-medical';
/** 入力 ZIP と展開後の CSV の上限（全国分のデータで数百 MB 程度を想定） */
const MAX_ZIP_BYTES = 500 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024 * 1024;

const column = z.string().trim().min(1).nullable();

/** mapping.json の形式 */
export const MhlwMappingSchema = z.object({
  zipUrl: z.url({ protocol: /^https$/ }).nullable(),
  csvFilePattern: z.string().min(1),
  encoding: z.string().min(1),
  columns: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    nameEn: column,
    prefecture: z.string().trim().min(1),
    city: column,
    address: column,
    phone: column,
    websiteUrl: column,
    foreignLanguages: column,
    ownerType: column,
  }),
  languageSeparator: z.string().min(1),
  languageNames: z.record(z.string(), z.enum(SUPPORTED_LOCALES)),
  ownerTypes: z.record(z.string(), z.enum(ENTITY_TYPES)),
});
export type MhlwMapping = z.infer<typeof MhlwMappingSchema>;

/** 都道府県コード（JIS 01〜47）・日本語名・英語名 → PREFECTURES のコード */
export function normalizePrefecture(value: string): string | undefined {
  const v = value.normalize('NFKC').trim();
  if (/^\d{1,2}$/.test(v)) return PREFECTURES[Number(v) - 1]?.code;
  const lower = v.toLowerCase();
  return PREFECTURES.find((p) => p.ja === v || p.en.toLowerCase() === lower || p.code === lower)?.code;
}

/** 電話番号を数字と + だけにする。番号として短すぎる・長すぎるものは捨てる */
export function normalizePhone(value: string): string | undefined {
  const v = value.normalize('NFKC').replace(/[^\d+]/g, '');
  return /^\+?\d{6,20}$/.test(v) ? v : undefined;
}

function normalizeUrl(value: string): string | undefined {
  const v = value.normalize('NFKC').trim();
  return /^https?:\/\//i.test(v) ? v : undefined;
}

/** 外国語対応の列の値から言語の根拠を作る（対応表に無い言語名は無視） */
export function parseLanguages(value: string, mapping: MhlwMapping): LanguageEvidence[] {
  const columnName = mapping.columns.foreignLanguages ?? '';
  const names = Object.fromEntries(Object.entries(mapping.languageNames).map(([k, v]) => [k.normalize('NFKC'), v]));
  const seen = new Set<SupportedLocale>();
  const evidence: LanguageEvidence[] = [];
  for (const raw of value.normalize('NFKC').split(new RegExp(mapping.languageSeparator))) {
    const label = raw.trim();
    const lang = names[label];
    if (!lang || seen.has(lang)) continue;
    seen.add(lang);
    evidence.push({ lang, kind: 'open_data', value: `${columnName}: ${label}` });
  }
  return evidence;
}

/** CSV の 1 行を候補のレコードにする。対応付けた列だけを読む（氏名などの列は読まない） */
export function toRecord(row: Record<string, string>, index: number, mapping: MhlwMapping): CollectedRecord {
  const c = mapping.columns;
  const get = (name: string | null) => (name ? (row[name] ?? '').trim() : '');
  const languageEvidence = c.foreignLanguages ? parseLanguages(get(c.foreignLanguages), mapping) : [];
  const ownerType = get(c.ownerType).normalize('NFKC');
  const ownerTypes = Object.fromEntries(Object.entries(mapping.ownerTypes).map(([k, v]) => [k.normalize('NFKC'), v]));
  const address = get(c.address);
  return {
    sourceRecordId: get(c.id) || `row-${index + 2}`,
    extracted: {
      category: 'medical',
      prefecture: normalizePrefecture(get(c.prefecture)),
      city: get(c.city) || undefined,
      name: { ja: get(c.name) || undefined, en: get(c.nameEn) || undefined },
      address: address ? { ja: address } : undefined,
      phone: normalizePhone(get(c.phone)),
      websiteUrl: normalizeUrl(get(c.websiteUrl)),
      supportedLanguages: languageEvidence.map((e) => e.lang),
    },
    languageEvidence,
    sourceOwnerType: ownerType || null,
    sourceEntityType: ownerType ? (ownerTypes[ownerType] ?? null) : null,
  };
}

/** ZIP の中の CSV（csvFilePattern に一致するもの）を読み、候補のレコードにする */
export function parseZip(zip: Buffer, mapping: MhlwMapping): CollectedRecord[] {
  const pattern = new RegExp(mapping.csvFilePattern, 'i');
  const csvs = readZipEntries(zip, { maxEntryBytes: MAX_ENTRY_BYTES }).filter((e) => pattern.test(e.name));
  if (csvs.length === 0) throw new Error(`No CSV matching ${mapping.csvFilePattern} in the ZIP`);
  const decoder = new TextDecoder(mapping.encoding);
  const required = [mapping.columns.id, mapping.columns.name, mapping.columns.prefecture];
  return csvs.flatMap((entry) => {
    const { header, records } = csvToRecords(parseCsv(decoder.decode(entry.data)));
    const missing = required.filter((name) => !header.includes(name));
    if (missing.length > 0) throw new Error(`${entry.name}: missing column(s) ${missing.join(', ')} (check mapping.json)`);
    return records.map((row, i) => toRecord(row, i, mapping));
  });
}

async function loadZip(ctx: AdapterContext, mapping: MhlwMapping): Promise<Buffer> {
  if (ctx.options.file) {
    const { size } = await stat(ctx.options.file);
    if (size > MAX_ZIP_BYTES) throw new Error(`Input file too large: ${size} bytes`);
    return readFile(ctx.options.file);
  }
  if (!mapping.zipUrl) throw new Error('Specify the downloaded ZIP with --file (mapping.json zipUrl is not set)');
  const res = await fetch(mapping.zipUrl, { headers: { 'User-Agent': ctx.config.crawl.userAgent } });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_ZIP_BYTES) throw new Error('Download too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error('Download too large');
  return buf;
}

/** 医療情報ネット（厚生労働省）のオープンデータ（CC BY 4.0）。カテゴリは常に medical */
export function createMhlwMedicalAdapter(mapping: unknown = defaultMapping): SourceAdapter {
  const parsed = MhlwMappingSchema.parse(mapping);
  return {
    id: MHLW_MEDICAL_SOURCE_ID,
    async collect(ctx) {
      return parseZip(await loadZip(ctx, parsed), parsed);
    },
  };
}

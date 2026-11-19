import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * ZIP（無圧縮・deflate）からファイルを取り出す最小限の実装。ZIP64・暗号化は非対応。
 * 展開後のサイズは maxEntryBytes を超えたらエラー（ZIP 爆弾対策）。ディスクには書き出さない。
 */
export function readZipEntries(zip: Buffer, { maxEntryBytes }: { maxEntryBytes: number }): ZipEntry[] {
  const eocd = findEocd(zip);
  const count = zip.readUInt16LE(eocd + 10);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error('ZIP64 is not supported');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== CENTRAL_SIG) throw new Error('Invalid ZIP central directory');
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString(flags & 0x0800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // ディレクトリ
    if (flags & 0x1) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    if (size > maxEntryBytes) throw new Error(`ZIP entry too large: ${name}`);
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error('Invalid ZIP local header');
    const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(start, start + compressedSize);
    if (raw.length !== compressedSize) throw new Error(`Truncated ZIP entry: ${name}`);

    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, { maxOutputLength: maxEntryBytes });
      } catch (err) {
        throw new Error(`Cannot inflate ZIP entry ${name}: ${(err as Error).message}`);
      }
    } else throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

function findEocd(zip: Buffer): number {
  // EOCD は末尾 22 バイト + コメント（最大 65535）の範囲にある
  const min = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= min; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('Not a ZIP file');
}

import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { csvToRecords, parseCsv } from './csv';
import { readZipEntries } from './zip';

/** テスト用に ZIP を組み立てる（method 0 = 無圧縮, 8 = deflate） */
function buildZip(files: { name: string; content: Buffer; method: 0 | 8 }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const data = f.method === 8 ? deflateRawSync(f.content) : f.content;
    const name = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(f.method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(f.method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('readZipEntries', () => {
  it('reads stored and deflated entries', () => {
    const zip = buildZip([
      { name: 'a.csv', content: Buffer.from('a,b\n1,2\n'), method: 0 },
      { name: 'dir/b.csv', content: Buffer.from('x'.repeat(1000)), method: 8 },
    ]);
    const entries = readZipEntries(zip, { maxEntryBytes: 10_000 });
    expect(entries.map((e) => e.name)).toEqual(['a.csv', 'dir/b.csv']);
    expect(entries[0].data.toString()).toBe('a,b\n1,2\n');
    expect(entries[1].data.toString()).toBe('x'.repeat(1000));
  });

  it('rejects entries larger than the limit and non-ZIP input', () => {
    const zip = buildZip([{ name: 'big.csv', content: Buffer.alloc(5000), method: 8 }]);
    expect(() => readZipEntries(zip, { maxEntryBytes: 1000 })).toThrow('too large');
    expect(() => readZipEntries(Buffer.from('not a zip at all, just text'), { maxEntryBytes: 1000 })).toThrow('Not a ZIP');
  });
});

describe('parseCsv', () => {
  it('handles BOM, quotes, escaped quotes, newlines in values and CRLF', () => {
    const text = '﻿id,name,note\r\n1,"A, Inc.","say ""hi"""\r\n2,B,"line1\nline2"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['id', 'name', 'note'],
      ['1', 'A, Inc.', 'say "hi"'],
      ['2', 'B', 'line1\nline2'],
    ]);
  });

  it('maps rows to records by header', () => {
    expect(csvToRecords(parseCsv('id, name\n1,A\n2'))).toEqual({
      header: ['id', 'name'],
      records: [
        { id: '1', name: 'A' },
        { id: '2', name: '' },
      ],
    });
  });
});

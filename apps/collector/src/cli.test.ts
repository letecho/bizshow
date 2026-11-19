import { describe, it, expect } from 'vitest';
import { CollectorConfigError } from '@fss/shared';
import { main, parseArgs } from './cli';
import { createMemoryRepository } from './testing';
import type { DataSourceRecord, SourceAdapter } from './types';

const enabled: DataSourceRecord = { id: 'enabled', kind: 'open_data', name: 'On', url: 'https://example.com', isEnabled: true };
const disabled: DataSourceRecord = { ...enabled, id: 'disabled', isEnabled: false };
const adapter: SourceAdapter = {
  id: 'enabled',
  collect: async () => [
    {
      sourceRecordId: '1',
      extracted: { category: 'legal', prefecture: 'tokyo', name: { ja: '行政書士法人 さくら' } },
      languageEvidence: [],
    },
  ],
};

function setup() {
  const mem = createMemoryRepository([enabled, disabled]);
  const logs: string[] = [];
  const deps = { env: {}, repo: mem.repo, adapters: { enabled: adapter, disabled: adapter }, log: (m: string) => logs.push(m) };
  return { mem, logs, deps };
}

describe('collector CLI (F-111)', () => {
  it('parses --source', () => {
    expect(parseArgs(['--source', 'mhlw-medical'])).toEqual({ help: false, source: 'mhlw-medical' });
    expect(parseArgs(['--source=mhlw-medical'])).toEqual({ help: false, source: 'mhlw-medical' });
    expect(parseArgs(['--source', 'mhlw-medical', '--file', './data.zip'])).toEqual({
      help: false,
      source: 'mhlw-medical',
      file: './data.zip',
    });
    expect(() => parseArgs(['--source', 'x', '--file'])).toThrow('--file');
    expect(parseArgs(['--help'])).toEqual({ help: true });
    expect(() => parseArgs([])).toThrow('--source');
    expect(() => parseArgs(['--source'])).toThrow('--source');
  });

  it('runs an enabled source and prints the run result', async () => {
    const { mem, logs, deps } = setup();
    expect(await main(['--source', 'enabled'], deps)).toBe(0);
    expect(mem.candidates.size).toBe(1);
    expect(JSON.parse(logs[0])).toMatchObject({ source: 'enabled', status: 'succeeded', candidateCount: 1 });
  });

  it('refuses unknown, disabled or adapter-less sources without collecting', async () => {
    const { mem, deps } = setup();
    expect(await main(['--source', 'nope'], deps)).toBe(1);
    expect(await main(['--source', 'disabled'], deps)).toBe(1);
    expect(await main(['--source', 'enabled'], { ...deps, adapters: {} })).toBe(1);
    expect(mem.runs).toHaveLength(0);
  });

  it('fails before collecting when the config is invalid', async () => {
    const { mem, deps } = setup();
    await expect(main(['--source', 'enabled'], { ...deps, env: { COLLECTOR_CRAWL_INTERVAL_SEC: '1' } })).rejects.toThrow(
      CollectorConfigError,
    );
    expect(mem.runs).toHaveLength(0);
  });

  it('returns usage errors with exit code 2', async () => {
    const { logs, deps } = setup();
    expect(await main([], deps)).toBe(2);
    expect(logs[0]).toContain('Usage:');
  });
});

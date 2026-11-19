import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isPublicAddress } from './ssrf';

/** 本文の上限（2MB） */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** リダイレクトの上限 */
export const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export interface FetchRequest {
  url: URL;
  userAgent: string;
  /** 条件付き取得（再取得のとき） */
  etag?: string;
  lastModified?: string;
  /** text/html 以外も受け取る（robots.txt 用） */
  accept: 'html' | 'text';
}

export type FetchResult =
  | { kind: 'ok'; status: number; url: URL; body: string; etag?: string; lastModified?: string }
  | { kind: 'not_modified'; url: URL }
  | { kind: 'redirect'; status: number; url: URL; location: URL }
  | { kind: 'http_error'; status: number; url: URL }
  | { kind: 'rejected'; reason: string; url: URL }
  | { kind: 'network_error'; message: string; url: URL };

/** HTTP GET 1 回の境界（リダイレクトは追わず返す。テストではローカルサーバーやモックに差し替える） */
export type Fetcher = (req: FetchRequest) => Promise<FetchResult>;

export class BlockedAddressError extends Error {
  constructor(public readonly host: string) {
    super(`blocked address for ${host}`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * 接続直前に名前解決の結果を検査する lookup。
 * 検査と接続で同じアドレスを使うため、DNS の再バインドでも内部アドレスに接続しない。
 */
export function guardedLookup(isAllowedAddress: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as unknown as LookupAddress[];
      if (list.length === 0 || list.some((a) => !isAllowedAddress(a.address))) {
        return callback(new BlockedAddressError(hostname), '', 0);
      }
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      const first = list[0]!;
      callback(null, first.address, first.family);
    });
  };
}

export interface NodeFetcherOptions {
  /** 既定は公開アドレスのみ（SSRF 対策）。テスト用サーバーのときだけ差し替える */
  isAllowedAddress?: (address: string) => boolean;
  /** 本文の上限（既定 2MB） */
  maxBodyBytes?: number;
}

function header(res: http.IncomingMessage, name: string): string | undefined {
  const v = res.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** node:http(s) による GET。http(s) のみ・公開アドレスのみ・本文 2MB まで・text/html のみ（accept=html） */
export function createNodeFetcher(opts: NodeFetcherOptions = {}): Fetcher {
  const isAllowedAddress = opts.isAllowedAddress ?? isPublicAddress;
  const maxBody = opts.maxBodyBytes ?? MAX_BODY_BYTES;
  const lookup = guardedLookup(isAllowedAddress);

  return (req) =>
    new Promise<FetchResult>((resolve) => {
      const url = req.url;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        resolve({ kind: 'rejected', reason: 'unsupported protocol', url });
        return;
      }
      if (url.username || url.password) {
        resolve({ kind: 'rejected', reason: 'credentials in url', url });
        return;
      }
      // IP リテラルは lookup を通らないため、ここで検査する
      const literal = url.hostname.replace(/^\[|\]$/g, '');
      if (/^[\d.]+$/.test(literal) || literal.includes(':')) {
        if (!isAllowedAddress(literal)) {
          resolve({ kind: 'rejected', reason: 'blocked address', url });
          return;
        }
      }
      const headers: Record<string, string> = {
        'user-agent': req.userAgent,
        accept: req.accept === 'html' ? 'text/html,application/xhtml+xml' : 'text/plain,*/*;q=0.1',
        'accept-encoding': 'identity',
      };
      if (req.etag) headers['if-none-match'] = req.etag;
      if (req.lastModified) headers['if-modified-since'] = req.lastModified;
      const mod = url.protocol === 'https:' ? https : http;
      const r = mod.request(url, { method: 'GET', headers, lookup, timeout: TIMEOUT_MS }, (res) => {
        const status = res.statusCode ?? 0;
        const done = (result: FetchResult) => {
          res.destroy();
          resolve(result);
        };
        if (status >= 300 && status < 400 && status !== 304) {
          const loc = header(res, 'location');
          if (!loc) return done({ kind: 'http_error', status, url });
          try {
            return done({ kind: 'redirect', status, url, location: new URL(loc, url) });
          } catch {
            return done({ kind: 'rejected', reason: 'invalid redirect', url });
          }
        }
        if (status === 304) return done({ kind: 'not_modified', url });
        if (status < 200 || status >= 300) return done({ kind: 'http_error', status, url });
        const type = (header(res, 'content-type') ?? '').toLowerCase();
        if (req.accept === 'html' && !/^(text\/html|application\/xhtml\+xml)\b/.test(type)) {
          return done({ kind: 'rejected', reason: 'not text/html', url });
        }
        const declared = Number(header(res, 'content-length'));
        if (Number.isFinite(declared) && declared > maxBody) return done({ kind: 'rejected', reason: 'body too large', url });
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBody) {
            done({ kind: 'rejected', reason: 'body too large', url });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (size > maxBody) return;
          resolve({
            kind: 'ok',
            status,
            url,
            body: Buffer.concat(chunks).toString('utf8'),
            etag: header(res, 'etag'),
            lastModified: header(res, 'last-modified'),
          });
        });
        res.on('error', (err) => resolve({ kind: 'network_error', message: err.message, url }));
      });
      r.on('timeout', () => r.destroy(new Error('timeout')));
      r.on('error', (err) => {
        if (err instanceof BlockedAddressError) resolve({ kind: 'rejected', reason: 'blocked address', url });
        else resolve({ kind: 'network_error', message: err.message, url });
      });
      r.end();
    });
}

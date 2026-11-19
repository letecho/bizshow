import { isIP } from 'node:net';

/**
 * SSRF 対策: クロールで接続してよいアドレスか。
 * プライベート・ループバック・リンクローカル（169.254.0.0/16 = クラウドのメタデータを含む）・CGNAT・
 * マルチキャスト・未指定・IPv6 ULA（fc00::/7）・IPv6 リンクローカル（fe80::/10）などは拒否する。
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicV4(address);
  if (family === 6) return isPublicV6(address);
  return false;
}

function v4Octets(address: string): number[] {
  return address.split('.').map((p) => Number(p));
}

function isPublicV4(address: string): boolean {
  const [a, b, c] = v4Octets(address) as [number, number, number, number];
  if (a === 0) return false; // 0.0.0.0/8
  if (a === 10) return false; // 10.0.0.0/8
  if (a === 127) return false; // loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return false; // link-local・メタデータ
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
  if (a === 192 && b === 168) return false; // 192.168.0.0/16
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // 192.0.0.0/24, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast・予約・broadcast
  return true;
}

/** IPv6 を 8 つの 16 ビット値に展開する */
function v6Groups(address: string): number[] | null {
  let addr = address.toLowerCase().split('%')[0] ?? '';
  // 末尾が IPv4 表記（::ffff:1.2.3.4 など）
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4Octets(v4[1]!) as [number, number, number, number];
    addr = addr.slice(0, -v4[1]!.length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = addr.split('::') as [string, string | undefined];
  const parse = (s: string) => (s ? s.split(':').map((g) => parseInt(g, 16)) : []);
  const h = parse(head);
  if (tail === undefined) return h.length === 8 ? h : null;
  const t = parse(tail);
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  return [...h, ...new Array<number>(fill).fill(0), ...t];
}

function isPublicV6(address: string): boolean {
  const g = v6Groups(address);
  if (!g || g.some((x) => Number.isNaN(x))) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4 射影（::ffff:a.b.c.d）・IPv4 互換（::a.b.c.d）は IPv4 として判定
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
    return isPublicV4(v4);
  }
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local（廃止）
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (first === 0x0064 && g[1] === 0xff9b) return false; // NAT64（内部 IPv4 に届きうる）
  if (first === 0x2002) return false; // 6to4（内部 IPv4 を埋め込める）
  return true;
}

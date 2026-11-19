/** robots.txt の解釈（RFC 9309 の Allow / Disallow と、慣習の Crawl-delay） */
export interface RobotsRules {
  isAllowed(pathWithQuery: string): boolean;
  /** 秒。指定が無ければ undefined */
  crawlDelaySec?: number;
}

interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelaySec?: number;
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true };
export const DISALLOW_ALL: RobotsRules = { isAllowed: () => false };

/** UA 文字列からプロダクトトークン（例: "bizshow-collector/0.1 (+...)" → "bizshow-collector"）を取り出す */
export function productToken(userAgent: string): string {
  return (userAgent.trim().split(/[\s/]/)[0] ?? '').toLowerCase();
}

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      // 空の Disallow は「すべて許可」なので規則にしない
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
    }
  }
  return groups;
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** robots.txt を解釈し、userAgent に当てはまるグループ（無ければ *）の規則を返す */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const token = productToken(userAgent);
  const groups = parseGroups(text);
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token && (token === a || token.startsWith(a))));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules).map((r) => ({ ...r, re: patternToRegExp(r.pattern) }));
  const delays = chosen.map((g) => g.crawlDelaySec).filter((d): d is number => d !== undefined);
  return {
    crawlDelaySec: delays.length > 0 ? Math.max(...delays) : undefined,
    isAllowed(pathWithQuery) {
      let path = pathWithQuery || '/';
      try {
        path = decodeURI(path);
      } catch {
        // そのまま比較する
      }
      // 最も長く一致した規則に従い、同じ長さなら Allow を優先
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules) {
        if (!r.re.test(path)) continue;
        const len = r.pattern.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
      return best ? best.allow : true;
    },
  };
}

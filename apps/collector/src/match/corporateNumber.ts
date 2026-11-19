import { PREFECTURES, nameSimilarity, normalizeAddressForMatch, type CollectorConfig, type PrefectureCode } from '@fss/shared';

export interface CorporateNumberQuery {
  name: string;
  prefecture: PrefectureCode;
  address?: string;
}

export interface CorporateNumberHit {
  corporateNumber: string;
  /** 閉鎖法人（closeDate あり） */
  closed: boolean;
}

/** 法人番号の照会。テストではモックに差し替える */
export interface CorporateNumberClient {
  lookup(query: CorporateNumberQuery): Promise<CorporateNumberHit | null>;
}

interface NtaCorporation {
  corporateNumber: string;
  name: string;
  closeDate: string;
  address: string;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? '';

/** 国税庁 法人番号システム Web-API（Ver.4、XML）の応答から法人を取り出す */
export function parseNtaResponse(xml: string): NtaCorporation[] {
  return [...xml.matchAll(/<corporation>([\s\S]*?)<\/corporation>/g)].map(([, body]) => ({
    corporateNumber: tag(body, 'corporateNumber'),
    name: tag(body, 'name'),
    closeDate: tag(body, 'closeDate'),
    address: `${tag(body, 'prefectureName')}${tag(body, 'cityName')}${tag(body, 'streetNumber')}`,
  }));
}

/**
 * 応答から照会した事業者を 1 件に絞る。名称が（法人格表記を除いて）一致するものに限り、
 * 複数あれば住所が前方一致するものを選ぶ。絞れなければ null（誤った法人番号を付けない）
 */
export function pickCorporation(hits: NtaCorporation[], query: CorporateNumberQuery): CorporateNumberHit | null {
  const sameName = hits.filter((h) => /^\d{13}$/.test(h.corporateNumber) && nameSimilarity(h.name, query.name) === 1);
  let chosen = sameName.length === 1 ? sameName[0] : undefined;
  if (sameName.length > 1 && query.address) {
    const key = normalizeAddressForMatch(query.address) ?? '';
    const byAddress = sameName.filter((h) => {
      const hk = normalizeAddressForMatch(h.address);
      return Boolean(hk && (key.startsWith(hk) || hk.startsWith(key)));
    });
    chosen = byAddress.length === 1 ? byAddress[0] : undefined;
  }
  return chosen ? { corporateNumber: chosen.corporateNumber, closed: chosen.closeDate !== '' } : null;
}

/** 国税庁 法人番号システム Web-API のクライアント（CORPORATE_NUMBER_API_ID 設定時のみ使う） */
export function createNtaCorporateNumberClient(
  appId: string,
  { userAgent, fetchImpl = fetch }: { userAgent: string; fetchImpl?: typeof fetch },
): CorporateNumberClient {
  return {
    async lookup(query) {
      const jis = String(PREFECTURES.findIndex((p) => p.code === query.prefecture) + 1).padStart(2, '0');
      const params = new URLSearchParams({ id: appId, name: query.name, type: '12', mode: '1', target: '1', address: jis, close: '1' });
      const res = await fetchImpl(`https://api.houjin-bangou.nta.go.jp/4/name?${params}`, { headers: { 'User-Agent': userAgent } });
      // アプリケーション ID を含む URL はエラーに出さない
      if (!res.ok) throw new Error(`corporate number lookup failed: HTTP ${res.status}`);
      return pickCorporation(parseNtaResponse(await res.text()), query);
    },
  };
}

/** CORPORATE_NUMBER_API_ID が設定されているときだけクライアントを作る（未設定なら照会しない） */
export function corporateNumberClientFromConfig(
  config: CollectorConfig,
  fetchImpl: typeof fetch = fetch,
): CorporateNumberClient | undefined {
  return config.corporateNumberApiId
    ? createNtaCorporateNumberClient(config.corporateNumberApiId, { userAgent: config.crawl.userAgent, fetchImpl })
    : undefined;
}

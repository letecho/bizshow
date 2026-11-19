import { nameSimilarity, normalizeAddressForMatch, normalizePhoneForMatch, type CandidateExtract, type CandidateMatchType } from '@fss/shared';

/** 照合の相手（既存の掲載または pending の候補） */
export interface MatchTarget {
  kind: 'listing' | 'candidate';
  id: string;
  /** candidate のみ */
  sourceId?: string;
  sourceRecordId?: string;
  names: string[];
  prefecture: string;
  phone?: string | null;
  address?: string | null;
  corporateNumber?: string | null;
}

export interface MatchSubject {
  sourceId: string;
  sourceRecordId: string;
  extracted: CandidateExtract;
  corporateNumber?: string;
}

export interface MatchResult {
  matchType: CandidateMatchType;
  matchedListingId?: string;
  /** 別の情報源の候補と一致した（スコアの加点） */
  matchedOtherSource: boolean;
}

interface Indexed extends MatchTarget {
  phoneKey?: string;
  addressKey?: string;
}

/**
 * 候補を既存の掲載・pending の候補と照合する。
 * 照合順: 法人番号の一致 → 正規化電話番号の一致 → 都道府県と正規化住所が一致し名称の類似度 ≥ threshold
 */
export class Matcher {
  private readonly targets: Indexed[] = [];

  constructor(
    targets: MatchTarget[],
    private readonly threshold: number,
  ) {
    targets.forEach((t) => this.add(t));
  }

  add(target: MatchTarget): void {
    this.targets.push({
      ...target,
      phoneKey: normalizePhoneForMatch(target.phone),
      addressKey: normalizeAddressForMatch(target.address),
    });
  }

  match(subject: MatchSubject): MatchResult {
    const e = subject.extracted;
    const phoneKey = normalizePhoneForMatch(e.phone);
    const addressKey = normalizeAddressForMatch(e.address?.ja ?? e.address?.en);
    const names = [e.name.ja, e.name.en].filter((n): n is string => Boolean(n));
    const others = this.targets.filter(
      (t) => !(t.kind === 'candidate' && t.sourceId === subject.sourceId && t.sourceRecordId === subject.sourceRecordId),
    );

    const rules: ((t: Indexed) => boolean)[] = [
      (t) => Boolean(subject.corporateNumber && t.corporateNumber === subject.corporateNumber),
      (t) => Boolean(phoneKey && t.phoneKey === phoneKey),
      (t) =>
        Boolean(addressKey && t.addressKey === addressKey && t.prefecture === e.prefecture) &&
        Math.max(0, ...names.flatMap((a) => t.names.map((b) => nameSimilarity(a, b)))) >= this.threshold,
    ];
    const matched = others.filter((t) => rules.some((rule) => rule(t)));
    // 一致の強い順（法人番号 → 電話 → 住所＋名称）で既存掲載を選ぶ
    const listing = rules.map((rule) => matched.find((t) => t.kind === 'listing' && rule(t))).find(Boolean);
    const matchedOtherSource = matched.some((t) => t.kind === 'candidate' && t.sourceId !== subject.sourceId);

    if (listing) return { matchType: 'update', matchedListingId: listing.id, matchedOtherSource };
    if (matched.some((t) => t.kind === 'candidate')) return { matchType: 'duplicate', matchedOtherSource };
    return { matchType: 'new', matchedOtherSource };
  }
}

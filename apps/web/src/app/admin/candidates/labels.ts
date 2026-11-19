import type { CandidateMatchType, CandidateStatus, EntityType } from '@fss/shared/collector';

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  pending: 'レビュー待ち',
  on_hold: '保留',
  approved: '承認済み',
  rejected: '却下',
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  corporation: '法人',
  public: '公的機関',
  individual: '個人',
  unknown: '不明',
};

export const MATCH_TYPE_LABELS: Record<CandidateMatchType, string> = {
  new: '新規',
  update: '既存の更新',
  duplicate: '他の候補と重複',
};

import { notFound, redirect } from "next/navigation";
import {
  websiteOnlyLanguages,
  type AdminCandidateDetail,
  type CandidateDiffField,
} from "@fss/shared/collector";
import { AdminHeader } from "../../../../components/admin/AdminHeader";
import { CandidateReviewForm } from "../../../../components/admin/CandidateReviewForm";
import { DescriptionDraftButton } from "../../../../components/admin/DescriptionDraftButton";
import { ServiceForm } from "../../../../components/admin/ServiceForm";
import formStyles from "../../../../components/Form.module.css";
import { adminFetch } from "../../../../lib/adminApi";
import { candidateFormDefaults } from "../../../../lib/candidateForm";
import {
  approveCandidate,
  draftCandidateDescription,
  reviewCandidate,
} from "../../actions";
import styles from "../../admin.module.css";
import {
  CANDIDATE_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  MATCH_TYPE_LABELS,
} from "../labels";

export const dynamic = "force-dynamic";

/** LLM で補完した項目（F-117）の表示名 */
const LLM_FIELD_LABELS: Record<string, string> = {
  phone: "電話",
  address: "住所",
  city: "市区町村",
  "name.en": "名称（英語）",
};

const FIELD_LABELS: Record<CandidateDiffField, string> = {
  category: "カテゴリ",
  prefecture: "都道府県",
  city: "市区町村",
  supportedLanguages: "対応言語",
  name: "名称",
  description: "説明",
  address: "住所",
  phone: "電話",
  websiteUrl: "Web サイト",
};

/** 収集した値はすべてテキストとして表示する（HTML として描画しない） */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v,
    );
    return entries.length
      ? entries.map(([k, v]) => `${k}: ${String(v)}`).join(" / ")
      : "—";
  }
  return String(value);
}

type Props = { params: Promise<{ id: string }> };

/** 掲載候補の詳細（F-113）: 抽出値・対応言語の根拠・事業者の種類・既存掲載との差分、承認・却下・保留 */
export default async function CandidateDetailPage({ params }: Props) {
  const { id } = await params;
  const res = await adminFetch(`/candidates/${encodeURIComponent(id)}`);
  if (res.status === 401 || res.status === 403) redirect("/admin/login");
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load candidate: ${res.status}`);
  const { data: c } = (await res.json()) as { data: AdminCandidateDetail };
  const reviewable = c.status === "pending" || c.status === "on_hold";
  const title = c.extracted.name.ja ?? c.extracted.name.en ?? c.sourceRecordId;

  return (
    <main className={styles.main}>
      <AdminHeader title={`掲載候補: ${title}`} />
      <p>
        <a href="/admin/candidates">← 候補一覧に戻る</a>
      </p>

      <section className={styles.card} aria-labelledby="candidate-summary">
        <h2 id="candidate-summary">候補</h2>
        <dl className={styles.detailList}>
            <dt>状態</dt>
            <dd>
              {CANDIDATE_STATUS_LABELS[c.status]}
              {c.reviewNote ? `（${c.reviewNote}）` : ""}
            </dd>
            <dt>収集元</dt>
            <dd>
              {c.sourceName}（{c.sourceRecordId}）
              {c.sourceUrl && (
                <>
                  {" "}
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    収集元を開く
                  </a>
                </>
              )}
            </dd>
            <dt>取得日時</dt>
            <dd>{c.fetchedAt.slice(0, 16).replace("T", " ")} UTC</dd>
            <dt>スコア</dt>
            <dd>{c.score}</dd>
            <dt>名寄せ</dt>
            <dd>
              {MATCH_TYPE_LABELS[c.matchType]}
              {c.matchedListing && (
                <>
                  {" "}
                  <a
                    href={`/admin/services/${encodeURIComponent(c.matchedListing.id)}/edit`}
                  >
                    {c.matchedListing.slug}
                  </a>
                </>
              )}
            </dd>
            <dt>事業者の種類</dt>
            <dd>
              {ENTITY_TYPE_LABELS[c.entityType]}
              {c.entityEvidence.length > 0 &&
                `（根拠: ${c.entityEvidence.map((e) => `${e.kind}=${e.value}`).join(", ")}）`}
              {c.corporateNumber && ` 法人番号 ${c.corporateNumber}`}
            </dd>
            {(Object.keys(FIELD_LABELS) as CandidateDiffField[]).map(
              (field) => (
                <div key={field} style={{ display: "contents" }}>
                  <dt>{FIELD_LABELS[field]}</dt>
                  <dd>{formatValue(c.extracted[field])}</dd>
                </div>
              ),
            )}
            {c.llmFilledFields && c.llmFilledFields.length > 0 && (
              <>
                <dt>LLM で補完した項目</dt>
                <dd>
                  要確認:{" "}
                  {c.llmFilledFields
                    .map((f) => LLM_FIELD_LABELS[f] ?? f)
                    .join(", ")}
                  （公式サイトから LLM で抽出した値です。サイトで事実を確認してから承認してください）
                </dd>
              </>
            )}
            <dt>対応言語の根拠</dt>
            <dd>
              {c.languageEvidence.length === 0 ? (
                "—"
              ) : (
                <>
                  <ul>
                    {c.languageEvidence.map((e, i) => (
                      <li key={i}>
                        {e.lang}: {e.kind}
                        {e.signal ? ` (${e.signal})` : ""} = {e.value}
                        {e.checkedAt ? `（確認日 ${e.checkedAt.slice(0, 10)}）` : ""}
                      </li>
                    ))}
                  </ul>
                  {websiteOnlyLanguages(c.languageEvidence).length > 0 && (
                    <p>
                      要確認: 公式サイトだけが根拠の言語{" "}
                      {websiteOnlyLanguages(c.languageEvidence).join(", ")}
                      （収集元のデータに根拠が無いため、サイトで対応を確認してから対応言語に設定してください）
                    </p>
                  )}
                </>
              )}
            </dd>
          </dl>
      </section>

      {c.matchedListing && (
        <section className={styles.card} aria-labelledby="candidate-diff">
          <h2 id="candidate-diff">既存掲載との差分</h2>
          {c.diff.length === 0 ? (
            <p>候補の値は既存の掲載と同じです。</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>既存</th>
                    <th>候補</th>
                  </tr>
                </thead>
                <tbody>
                  {c.diff.map((d) => (
                    <tr key={d.field}>
                      <td>{FIELD_LABELS[d.field]}</td>
                      <td>{formatValue(d.current)}</td>
                      <td>{formatValue(d.candidate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reviewable && (
        <>
          <section className={styles.card} aria-labelledby="candidate-approve">
            <h2 id="candidate-approve">
              {c.matchedListing && c.matchType === "update"
                ? "確認して既存の掲載を更新"
                : "確認して掲載を作成"}
            </h2>
            <p>
              収集元の文章はそのまま使わず、事実を確認して英語の名称・説明を入力してください（en
              は必須）。
            </p>
            <ServiceForm
              action={approveCandidate.bind(null, c.id)}
              service={candidateFormDefaults(c)}
              submitLabel={
                c.matchedListing && c.matchType === "update"
                  ? "承認して更新"
                  : "承認して作成"
              }
            >
              {c.descriptionDraftAvailable && (
                <DescriptionDraftButton
                  action={draftCandidateDescription.bind(null, c.id)}
                />
              )}
              {c.consentRequired && (
                <fieldset className={formStyles.fieldset}>
                  <legend>本人の同意の記録（必須）</legend>
                  <p role="note">
                    この候補は「{ENTITY_TYPE_LABELS[c.entityType]}
                    」と判定されたため、個人事業主の可能性があります。個人に関する情報は本人の同意を得た場合に限り掲載します（プライバシーポリシー
                    3 条）。同意を確認できた記録（掲載申請・掲載案内への承諾の日付や番号など）を入力してください。
                  </p>
                  <label className={formStyles.field}>
                    <span>同意の記録</span>
                    <input
                      name="consentEvidence"
                      required
                      maxLength={200}
                      autoComplete="off"
                    />
                  </label>
                </fieldset>
              )}
              {!c.entityApprovable && (
                <fieldset className={formStyles.fieldset}>
                  <legend>事業者の種類の確認（必須）</legend>
                  <p role="note">
                    この候補は「{ENTITY_TYPE_LABELS[c.entityType]}
                    」と判定されたため、このままでは承認できません。法人・公的機関であることを確認できた場合だけ、種類と根拠を入力してください。
                  </p>
                  <label className={formStyles.field}>
                    <span>種類</span>
                    <select name="entityType" required defaultValue="">
                      <option value="" disabled>
                        —
                      </option>
                      <option value="corporation">法人</option>
                      <option value="public">公的機関</option>
                    </select>
                  </label>
                  <label className={formStyles.field}>
                    <span>根拠（法人番号・公的機関の一覧など）</span>
                    <input
                      name="entityEvidence"
                      required
                      maxLength={200}
                      autoComplete="off"
                    />
                  </label>
                </fieldset>
              )}
            </ServiceForm>
          </section>
          <section className={styles.card} aria-labelledby="candidate-reject">
            <h2 id="candidate-reject">却下・保留</h2>
            <CandidateReviewForm
              action={reviewCandidate.bind(null, c.id, "reject")}
              label="却下の理由（任意）"
              submitLabel="却下する"
            />
            {c.status === "pending" && (
              <CandidateReviewForm
                action={reviewCandidate.bind(null, c.id, "hold")}
                label="保留のメモ（任意）"
                submitLabel="保留にする"
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}

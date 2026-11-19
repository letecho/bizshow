# apps/collector — データ収集ワーカー（F-111）

公開データ（オープンデータ・API・公式サイト）から**掲載候補**（`ServiceCandidate`）を集めます。
候補は管理画面で管理者がレビューし、承認したものだけが掲載（`ServiceListing`）になります。収集が掲載を直接作ることはありません。

## 実行方法

```bash
pnpm db:migrate                                   # DataSource / CollectionRun / ServiceCandidate を作成
pnpm --filter collector collect --help
pnpm --filter collector collect --source <DataSource.id>
```

- 1 回の実行で 1 ソースを収集し、結果（取得件数・保存件数・対象外で保存しなかった件数・エラー数・状態）を `CollectionRun` に記録します
- 収集元は `DataSource` テーブルの行です。`isEnabled=false` のソースは実行できません
- 収集元ごとの処理は `SourceAdapter`（`src/types.ts`）として実装し、`src/sources/index.ts` に `DataSource.id` と同じキーで登録します
- 同じ `sourceRecordId` の再実行では候補を増やさず更新します。レビュー済み（承認・却下・保留）の候補は上書きしません

## 何を保存しないか

| 対象外 | 設定 | 記録 |
|---|---|---|
| 対象外のカテゴリ・都道府県 | `COLLECTOR_CATEGORIES` / `COLLECTOR_PREFECTURES` | 保存しない |
| 個人事業主・種類を判定できない事業者 | `COLLECTOR_ENTITY_SCOPE=corporate_public`（既定） | `skippedByEntityCount` に件数のみ（名称などは残さない） |
| 対象言語の根拠が無い候補 | `COLLECTOR_TARGET_LANGUAGE_MODE=require` のとき | `skippedByLanguageCount` |
| 上限を超えた候補 | `COLLECTOR_MAX_CANDIDATES_PER_RUN` | `skippedByLimitCount`（次回の実行で保存） |
| 検証に通らないレコード | `CandidateExtractSchema` | `errorCount`、`errorSample` にはレコード ID と項目名のみ |

- 人名（代表者・院長・担当者など）と個人のメールアドレスは**集めません**。`CandidateExtractSchema` にその項目が無く、ソースにある列は捨てられます
- 事業者の種類は `classifyEntity()`（`packages/shared/src/collector.ts`）が、ソースの開設者種別 → 法人番号 → 公的機関の一覧 → 名称の法人格表記の順に判定します

## 設定と上限の上げ方

設定はすべて環境変数（`.env.example` の「データ収集」）。不正な値（未知のカテゴリ・言語、`ja` を対象言語に指定、間隔 5 秒未満、負の予算、0 以下の上限など）は**収集を始める前に**エラーで止まります。

既定値は POC として最小限です。運用しながら次の順で上げてください。

1. 件数: `COLLECTOR_MAX_CANDIDATES_PER_RUN`（例: 100 → 500 → 2000）。レビューが追いつく量に合わせる
2. 範囲: `COLLECTOR_TARGET_LANGUAGES`（例: `vi` → `vi,zh,en`）、`COLLECTOR_TARGET_LANGUAGE_MODE`
3. クロール（F-115）: `COLLECTOR_CRAWL_ENABLED=true` にしてから `COLLECTOR_CRAWL_MAX_SITES_PER_RUN`・`COLLECTOR_CRAWL_MAX_PAGES` を上げる。`COLLECTOR_CRAWL_INTERVAL_SEC` は 5 秒未満にできません（サイトへの負荷のため固定）
4. LLM（F-117）: `COLLECTOR_LLM_ENABLED=true`・`COLLECTOR_LLM_MODEL` を設定し、`COLLECTOR_LLM_MONTHLY_BUDGET_JPY` を 0 より大きくする
5. 生データの保存: `COLLECTOR_RAW_RETENTION_DAYS`

## テスト

```bash
pnpm --filter collector test
```

DB を使わず、メモリ上のリポジトリ（`src/testing.ts`）とテスト用アダプターで収集の規則を検証します。

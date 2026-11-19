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

## 収集元

### mhlw-medical — 医療情報ネット（厚生労働省）オープンデータ（F-112）

- ライセンス: CC BY 4.0。出典表示「出典: 医療情報ネット（厚生労働省）のデータを加工して作成」（`DataSource.attribution`）
- `pnpm db:seed` で `DataSource`（id: `mhlw-medical`）を **無効**で登録します。管理者が `isEnabled=true` にしてから実行します
- 入力: 公開ページから ZIP をダウンロードし `--file` で指定（パスは `apps/collector` からの相対、または絶対パス）。`mapping.json` の `zipUrl`（https のみ）を設定すると直接ダウンロードします

```bash
pnpm --filter collector collect --source mhlw-medical --file /path/to/download.zip
```

- 列の対応は `src/sources/mhlw-medical/mapping.json`（列名・文字コード・外国語名 → 言語コード・開設者種別 → 事業者の種類）。データ形式が変わったら**このファイルだけ**を直します。`null` の列は読みません
- 院長・管理者・開設者の氏名の列は対応付けていないため読み込みません
- カテゴリは常に `medical`。都道府県はコード（01〜47）・名称から変換、電話は数字と `+` だけに正規化、http(s) で始まらない URL は採用しません
- 外国語対応の列の値は `languageEvidence`（kind=`open_data`）と `supportedLanguages` に入ります。列が無い・空・対応表に無い言語だけのときは空で、score が下がります（承認時に人が設定）

## 名寄せとスコア（F-114）

- 保存する候補ごとに、既存の掲載（全件）と pending の候補（同じ実行で保存した分を含む）と照合します（`src/match/matcher.ts`）
  - 照合順: 法人番号の一致 → 正規化した電話番号の一致（`03-1234-5678` / `0312345678` / `+81 3 1234 5678` は同じ）→ 都道府県と正規化した住所（全角半角・空白・ハイフン・「丁目/番地/号」を統一）が一致し、名称の類似度が `COLLECTOR_MATCH_NAME_THRESHOLD`（既定 0.8）以上
  - 既存の掲載と一致 → `matchType=update`・`matchedListingId`、pending の候補と一致 → `duplicate`、それ以外 → `new`
- 法人番号（国税庁 法人番号システム Web-API）は `CORPORATE_NUMBER_API_ID` を設定したときだけ名称＋都道府県（＋住所）で照会します。未設定なら照会しません
  - 名称が一致する法人を 1 件に絞れたときだけ採用し、`corporateNumber` を記録。法人格表記の無い名称でも法人番号が見つかれば `corporation`（根拠 `corporate_number`）。閉鎖法人は score 0
  - 照会に失敗しても収集は続けます（`errorSample` に記録）。アプリケーション ID はエラーに出しません
- `score`（0〜100、重みは `packages/shared` の `CANDIDATE_SCORE_WEIGHTS`）: 情報源の信頼度（open_data・partner 40 / api 30 / crawl 20）＋必須項目（名称・住所・電話・都道府県）の充足 最大 30 ＋対応言語の根拠（対象言語 20 / それ以外の外国語のみ 10）＋別の情報源の候補と一致 10

## 公式サイトのクロールと対応言語の根拠（F-115）

```bash
pnpm --filter collector crawl          # COLLECTOR_CRAWL_ENABLED=true のときだけ動く（既定 false では何も取得しない）
```

- 対象: `pending` の候補のうち `websiteUrl` があるもの。対象言語（`COLLECTOR_TARGET_LANGUAGES`）の根拠が無い → サイト未確認 → 古い順に、1 回の実行で `COLLECTOR_CRAWL_MAX_SITES_PER_RUN` サイトまで（超過分は次回）。前回の確認から `COLLECTOR_RECRAWL_DAYS` 以内の候補は対象外
- 1 サイトの取得: `robots.txt` → トップ → 言語切替・会社概要・アクセス・お問い合わせのリンク（同一サイト・クエリなし・ログイン/フォーム/検索/ファイル以外）で合計 `COLLECTOR_CRAWL_MAX_PAGES` ページまで
- 守ること（`src/crawl/`）
  - `robots.txt` の Disallow / Allow と Crawl-delay（取得失敗: 4xx=許可、5xx・通信エラー=そのサイトを中止）
  - 同一ホストは逐次（同時 1）、間隔は max(`COLLECTOR_CRAWL_INTERVAL_SEC`, Crawl-delay)。UA は `COLLECTOR_USER_AGENT`
  - 429 / 503 でそのホストを 24 時間停止（`COLLECTOR_RAW_DIR/crawl/state.json` に記録）
  - 同じ URL は `COLLECTOR_RECRAWL_DAYS` 以内に再取得しない。過ぎたら ETag / Last-Modified で条件付き取得
  - http(s) のみ、リダイレクトは同一サイト内で 3 回まで（各ホップで robots.txt を確認）、本文 2MB まで、text/html のみ
  - SSRF 対策: プライベート・ループバック・リンクローカル（169.254.0.0/16）・CGNAT・IPv6 ULA / リンクローカル等に解決されるホストは**接続時に**拒否（DNS の再バインド対策）
  - ブロックリスト（F-116）のドメインは取得しない
- 判定: `<html lang>`・`hreflang`・`/en/` `/zh/` `/vi/` 等のパス・言語切替のリンク（「Tiếng Việt」「Vietnamese」「ベトナム語」等）・本文（ベトナム語・日本語の簡易判定）から、`languageEvidence` に `kind=website`（`value`=URL、`signal`=手がかり、`checkedAt`=確認日）を記録し、`hasTargetLanguage` と score の言語の点を更新します
- サイトだけが根拠の言語は、管理画面の候補詳細に「要確認」と表示します。候補の掲載内容（`supportedLanguages` など）は変えません
- 生 HTML は `COLLECTOR_RAW_DIR/crawl/html/<日付>/` に保存し、`COLLECTOR_RAW_RETENTION_DAYS` を過ぎたら実行時に削除します。文章は掲載に使いません

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

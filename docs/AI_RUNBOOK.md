# AI 実行手順書（定期実行・自立 CI/CD）

定期実行のプロンプトから参照される**実行手順の正本**。プロンプト側には「変えてはいけない約束（ガードレール）」だけを置き、手順はここで管理する。

- 手順と約束が食い違う場合は**プロンプトの約束が優先**。この手順書で約束を緩めることはできない
- 改訂方法は末尾の「8. この手順書の改訂ルール」

---

## 1. 対象リソース

| 種別 | 場所 |
|---|---|
| リポジトリ | `letecho/bizshow`（main） |
| 機能一覧・バグ一覧（スプレッドシート） | `1-0S4YMQ7psfioahJVqs4hACCHWYDGN-SmK5Lxerr-1A`（タブ「機能一覧」「バグ一覧」「品質管理票」「共通規約」） |
| 実行状態メモ（Google ドキュメント） | `1Ho2c50JLl9VwEZ_1OP8DERBZFW5g5RqjIzF0Pmud5tA` |
| 設計資料の保存先（Drive フォルダ） | `1bb7FTVrbjn3p6qwVWlUAGr4Z0lsxoVH8` |
| 開発フロー（人向け） | `docs/DEVELOPMENT.md`、規約 `CLAUDE.md` |

### シートの列
- **機能一覧**: A=ID, B=フェーズ, C=区分, D=機能名, E=目的, F=仕様, G=受入条件, H=対象パス, I=依存, **J=ステータス**, **K=Issue**（ヘッダーは 2 行目、データは 3 行目から）
- **バグ一覧**: A=ID(B-xxx), B=重要度(S1〜S3), C=領域, D=件名, E=事象, F=再現手順, G=期待する動作, H=原因・修正方針, I=対象パス, J=関連機能, K=環境, **L=ステータス**, **M=Issue**, N=発見日（ヘッダーは 2 行目）
- **品質管理票**: 列定義は 2.8 を参照
- ステータスの値: 未着手/未対応 → ai-ready → PRレビュー待ち → 完了（バグは「対応不要」もあり）

---

## 2. 毎回の手順

### 2.1 準備
1. 状態メモを読む（前回のブロッカー・要対応を把握）
2. `gh api repos/letecho/bizshow --jq .permissions` で push 権限を確認。無ければ状態メモに記録して終了
3. `git fetch origin main`。open PR（`list_pull_requests`）と open Issue（`list_issues`）を取得

### 2.2 前回からの持ち越し
- 自分（Claude）が作った open PR で CI が緑・Draft でない・mergeable なものは 2.6 に従いマージ
- CI が赤ならログ（`get_job_logs`）を見て修正
- 人やほかのセッションが作った PR（Draft 含む）は触らない。状態だけ状態メモに記録

### 2.3 機能一覧 → Issue
1. 機能一覧で **K 列が空の行**を Issue 化する
   - タイトル `[ID] 機能名`、本文は目的・仕様・受入条件・対象パス・依存
   - ラベル: `phase:poc|mvp|later`、`type:feature|infra`、`area:web|api|shared|infra`、`needs-spec`
2. Issue 番号を K 列に `#番号` で書き戻す
3. **J 列が「ai-ready」なのに Issue に `ai-ready` が無い**行は、Issue に `ai-ready` を付け `needs-spec` を外す（シートの J 列は人が付ける判断とみなす）

### 2.4 バグ一覧 ⇄ Issue（双方向同期）
1. バグ一覧で **M 列が空の行**を Issue 化する
   - タイトル `[B-xxx] 件名`、本文は `.github/ISSUE_TEMPLATE/bug.yml` の見出し（事象 / 再現手順 / 期待する動作 / 原因・修正方針 / 重要度 / 環境）
   - ラベル: `type:bug`、`area:*`、`phase:poc`（関連機能のフェーズに合わせる）、`needs-spec`
   - Issue 番号を M 列に書き戻す
2. シートに無い open の `type:bug` Issue は、次の B 番号で行を追加（ステータス「未対応」、Issue 列に番号、発見日 = 起票日）。タイトルを `[B-xxx] ...` に揃える
3. **L 列が「ai-ready」なのに Issue に `ai-ready` が無い**行は付与し `needs-spec` を外す
4. 作業中に AI が見つけたバグは、行を追加して `needs-spec` で起票（ユーザーが明示的に修正を指示した場合のみ `ai-ready`）

### 2.5 実装（ai-ready の Issue を 1 件ずつ）
**着手順**: `type:bug` の S1・S2 → 機能（依存順: D-001 → D-002 → F-001 …、同順位は Issue 番号の昇順）→ `type:bug` の S3

**スキップ条件**: `ai-in-progress` が付いている / 該当ブランチの open PR がある / 依存 Issue が未完了でコード上の依存がある（依存ブランチの上に積むか、`blocked` を付けて状態メモに記録）。依存が未マージでもコード上の依存が無ければ着手してよい

**手順**
1. 着手した Issue に `ai-in-progress` を付け、シートのステータスを「PRレビュー待ち」に
2. ブランチ `claude/<issue番号>-<短い説明>`（依存 PR が未マージなら、その上に積む）
3. シートの仕様・「共通規約」タブ・`CLAUDE.md`・`docs/DEVELOPMENT.md` に従って実装。最小限かつ拡張可能に。仕様にないことは足さず、不明点は PR 本文の「確認事項」へ
4. API 変更・バグ修正にはテストを付ける（バグは可能な限り再現テストを先に書く）
5. ローカルで `pnpm verify`（lint / typecheck / test / build）を通す。可能なら実 DB・ブラウザで動作確認（3 章）
6. コミット: Conventional Commits、末尾に `Co-Authored-By` のみ（セッション情報は書かない）
7. push（1 ブランチずつ）→ PR 作成。本文は `.github/PULL_REQUEST_TEMPLATE.md` の見出しに従い、`Closes #<番号>`、受入条件のチェック、動作確認の内容、確認事項を書く
8. CI（`verify` / `secret-scan` / `e2e`）を待つ。赤なら修正して push

### 2.6 マージ
- 条件: 自分が作った PR、CI 全緑、Draft でない、mergeable
- `merge_pull_request`（squash）。`expectedHeadSha` には `git rev-parse` で得た**完全な SHA** を使う
- マージ前に lockfile-sync が追加コミットしていないか（`git fetch` してローカルとリモートの SHA が一致するか）確認
- squash のコミット本文にセッション情報を入れない
- マージ後: Issue のクローズを確認し `ai-in-progress` を外す、シートのステータスを「完了」に、積んでいた子ブランチを `git rebase --onto origin/main <親ブランチ> <子ブランチ>` で付け替えて push

### 2.7 記録
1. 追加・更新した設計資料は Drive フォルダに保存
2. 状態メモの「最終実行」を更新し、実行ログに 1 行追記（日時、作成・マージした PR / Issue、ブロッカー、人への依頼）
3. 状態が変わったときだけ通知（5 章）

### 2.8 品質管理（着手できる Issue が無いとき）
2.5 で着手できる `ai-ready` の Issue（機能・バグ）が 0 件になったら、残りの時間で品質管理を行う。目標は「利用者に選ばれる、UI・UX に優れたプロダクトへ進化させ続けること」。

#### 品質管理票（シート「品質管理票」タブ）
1 行 = 1 チェック項目。タブが無ければ作成する（ヘッダー 2 行目、書式は機能一覧に合わせる）。

| 列 | 内容 |
|---|---|
| A: ID | `Q-001` から連番 |
| B: 観点 | 機能 / UI・UX / アクセシビリティ / 多言語 / 性能 / セキュリティ / SEO / 運用 |
| C: 対象 | 画面パス（`/[locale]/...`、`/admin/...`）または API |
| D: チェック項目 | 何を確かめるか（1 項目 1 観点） |
| E: 合格基準 | 判定できる具体的な基準（例: 「375px 幅で横スクロールが出ない」「Lighthouse アクセシビリティ 90 以上」「4 言語で文言の欠落がない」） |
| F: 検証方法 | 自動テスト / E2E / ブラウザ手動（Playwright スクリプト）/ 計測（Lighthouse 等）/ コードレビュー |
| G: 関連機能 | 機能一覧の ID |
| H: 根拠 | 仕様・受入条件・共通規約・外部基準（WCAG 2.2 AA、Core Web Vitals 等）のどれに基づくか |
| I: 最終検証日 | YYYY-MM-DD |
| J: 結果 | 未検証 / OK / NG |
| K: バグ | NG のときのバグ一覧 ID（`B-xxx`） |
| L: 備考 | 計測値・スクリーンショットの保存先など |

**保守（毎回、検証の前に行う）**
- 機能一覧で「完了」になった機能に、受入条件・仕様から項目を追加する（まだ項目が無い機能を優先）
- 現在の設計水準に照らして項目を見直す。モバイルファースト、アクセシビリティ（WCAG 2.2 AA）、Core Web Vitals、多言語（4 言語・フォールバック・`lang` 属性）、フォームの入力保持とエラー表示、空・エラー・読み込み中の状態、セキュリティ（共通規約・SEC-xx）
- 不要になった項目は削除せず備考に理由を書いて結果を「対象外」にする

**検証（1 回の実行で最大 10 項目）**
1. 優先順: 未検証 → NG（修正がマージ済みのもの）→ 最終検証日が古い順
2. ローカルで実 DB + シードを起動し（3 章）、検証方法に従って確認する。画面は Playwright で 375px（スマホ）と 1280px の両方を見る
3. 結果・最終検証日・計測値を記入する。自動化できた検証は E2E / 単体テストとして追加する（テスト追加は通常の PR として 2.5〜2.6 に従う）

**NG のとき（バグ対応フローへ）**
- バグ一覧に行を追加して Issue 化する（2.4）。品質管理票の K 列に B 番号を書く
- **既存の仕様・受入条件・共通規約・品質管理票の合格基準から外れていて、再現手順がある**もの → AI が L 列（ステータス）を「ai-ready」にしてよい（プロンプトの品質管理の指示に基づく）。次の実行（時間があれば同じ実行）で 2.5 の着手順に従って修正する
- 仕様が決まっていない・見た目や体験の好みが分かれる・仕様変更を伴うもの → `needs-spec` のまま人の判断を待つ

**UI・UX の改善提案**
- 新しい機能・画面・導線の追加になる改善は、実装せず機能一覧に提案行を追加する（ID は次の F 番号、ステータス「仕様確認中」、目的・仕様案・受入条件案を書く）→ 2.3 で `needs-spec` の Issue になり、人が ai-ready にしたら実装する
- 提案は 1 回の実行で最大 3 件。根拠（どの検証結果・どの基準から）を書く

**記録**
- 状態メモの実行ログに、保守した項目数・検証した項目（OK / NG）・追加したバグ・提案を 1 行で書く
- NG や提案を追加したら通知する

---

## 3. ローカル検証のやり方

- 依存: `corepack pnpm install`（pnpm 9.12.0）
- Prisma: `corepack pnpm --filter api db:generate`（2026-11 時点で sandbox から生成可能）
- DB:
  - Docker: `dockerd` が止まっていれば `(dockerd > /tmp/dockerd.log 2>&1 &)` で起動 → `docker compose up -d postgres`
  - Docker が使えない場合: ローカルの PostgreSQL 16（`service postgresql start`、ユーザー `app` / DB `foreign_service_dev`）
- アプリ: リポジトリ直下に `.env`（`cp .env.example .env`）→ `pnpm db:migrate && pnpm db:seed && pnpm dev`
- ブラウザ確認: プリインストールの Playwright（`require('playwright')`、`chromium.launch()`）
- `pnpm verify` を再実行して `web#typecheck` が TS6053 で落ちたら `rm -rf apps/web/.next` してから `pnpm verify --concurrency=1`（B-004）
- Docker イメージのビルド: Alpine のパッケージ CDN は sandbox から 403。検証が必要なときだけ、**一時コピー**の Dockerfile でプロキシ CA・プロキシ設定を追加し `apk add openssl` を `ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3` に置き換え、`build: { network: host }` の override でビルドする（コミットはしない）

---

## 4. ツールの使い方メモ

- GitHub GraphQL は使えない。`gh` は REST（`gh api repos/letecho/bizshow/...`）のみ。`gh pr list` / `gh label list` は不可
- PR 作成・Issue 一覧・マージ・PR 情報は GitHub MCP ツール。ラベルの付け外しは `gh api -X POST .../issues/<n>/labels -f "labels[]=..."` / `gh api -X DELETE .../issues/<n>/labels/<name>`
- CI 結果: `gh api repos/letecho/bizshow/commits/<sha>/check-runs --jq '.check_runs[]|"\(.name) \(.status) \(.conclusion)"'`。待つときは `until` ループを background 実行
- 4 ブランチ以上を同時に push すると GitHub Actions が起動しないことがある → 1 ブランチずつ push
- package.json を変えたら lockfile も `pnpm install` で更新してコミット（lockfile-sync は保険）
- Drive の `download_file_content` は大きいファイルをローカルに保存して返す。シートは `get_values` で読む
- Google ドキュメントの状態メモへの追記は `insertText` の `endOfSegmentLocation`（位置計算が不要）
- シートの構造変更（タブ追加・書式）の前に `google-workspace` スキルを読む

### 実装上の注意（過去の不具合から）
- React 19 はフォームの `action` 実行後に非制御入力をリセットする。エラー時に入力を残すフォームは `onSubmit` + `startTransition` で action を呼ぶ
- Web のサーバー側から API を呼ぶときは `serverApiUrl()`（`API_INTERNAL_URL` 優先）、ブラウザからは `API_URL`
- `AUTH_MODE=dev` は `NODE_ENV=production` では起動拒否される（API の runner イメージは production）
- Web の CSP（`apps/web/src/lib/securityHeaders.ts`）を変える機能では、画像の配信元・ブラウザからの送信先を許可し忘れない

---

## 5. 通知（PushNotification）

- 送る: 新しい PR / Issue を作成・マージした、CI 失敗やアクセス不可で止まった、人の判断が必要なブロッカーが出た、手順書を改訂した、品質管理で NG・提案を追加した
- 送らない: 前回から変化が無い（最終返答も短く）
- 本文は `<routine_summary>` で囲み、1 文目に一番重要なこと、続けて PR / Issue 番号と人への依頼

---

## 6. やらないこと（プロンプトの約束の再掲。ここで緩めることはできない）

- force push、他人のブランチの履歴書き換え、本番デプロイ
- Dependabot の PR、人やほかのセッションが作った PR（Draft 含む）の操作
- テストのスキップ・無効化で CI を通すこと
- 秘密情報のコミット

---

## 7. 既知のブロッカー・人の判断待ち（状態メモが正。ここは恒常的なものだけ）

- AWS 環境（Cognito・S3・CloudFront・RDS）は未構築。実環境での検証が必要な項目は「未検証」として PR に書く
- Later フェーズの機能は受入条件が「-」の行が多い。受入条件が無い行は ai-ready でも着手せず、状態メモで人に依頼する

---

## 8. この手順書の改訂ルール

AI は実行中に手順の改善点（新しい知見、手順の抜け、より安全・確実なやり方）を見つけたら、この手順書を更新してよい。

1. Issue `[chore] AI_RUNBOOK: <変更の要約>`（`type:chore` + `area:infra` + `ai-ready`）を起票
2. ブランチ `claude/<issue番号>-runbook-<短い説明>` で **この手順書だけ**を変更（コード変更と混ぜない）。必要なら `docs/DEVELOPMENT.md` の対応箇所も
3. PR 本文に「変更前 → 変更後」と理由を書く。CI 緑ならマージしてよい
4. 状態メモの実行ログに記録し、通知で人に知らせる（何がどう変わったか 1〜2 文）
5. **してはいけない改訂**: 6 章（やらないこと）・プロンプトの約束を緩める、対象リソースを別のリポジトリ・ファイルに向ける、人の判断（ai-ready の付与・Dependabot 等）を AI に移す。これらが必要だと考えたら、改訂せず状態メモと通知で人に提案する
6. 次回の実行から改訂後の手順に従う（実行中に改訂した場合も、その回は改訂前の手順で最後まで進めてよい）

### 改訂履歴
| 日付 | PR | 内容 |
|---|---|---|
| 2026-11-18 | #69 | 2.8 品質管理（品質管理票の保守・検証・バグ化・UI/UX 提案）を追加 |
| 2026-11-18 | #67 | 初版。プロンプトの「毎回の手順」「技術メモ」を移管し、バグ一覧の同期・着手順・ローカル検証・改訂ルールを追加 |

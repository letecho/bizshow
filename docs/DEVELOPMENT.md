# 開発フロー（AI協調・GitHub Flow）

2名体制 + AI実装を前提に「仕様をIssueで確定 → AIがPR → CIが品質担保 → 人がマージ判断」に一本化する。

## 1. 全体の流れ

```
機能一覧シート(Drive) ──1行=1Issue──▶ GitHub Issue [needs-spec]   ※不具合は「バグ一覧」タブ（5章）
                                        │ 人が仕様・受入条件を確認
                                        ▼
                                   [ai-ready] ラベル付与
                                        │ 定期実行のAIが拾う（依存Issueが完了しているものから）
                                        ▼
                         feat/<issue番号>-<slug> ブランチ → Draft PR [ai-in-progress]
                                        │ CI: verify(lint/typecheck/test/build) + secret-scan
                                        ▼
                         人がレビュー（受入条件チェック）→ Squash merge
                                        │
                                        ▼
                    main push → (DEPLOY_ENABLED=true時) stg自動デプロイ → 本番は手動承認
```

## 2. ラベル（`.github/labels.json` が正。`Label Sync` ワークフローで同期）

| ラベル | 意味 | 付ける人 |
|---|---|---|
| `needs-spec` | 仕様不足。AIは着手しない | 起票時に自動 |
| `ai-ready` | 仕様確定。AIが着手してよい | **人** |
| `ai-in-progress` | AIが実装中/PR作成済み | AI |
| `blocked` | 依存未完了 | AI/人 |
| `phase:poc` / `phase:mvp` / `phase:later` | リリース段階 | 起票時 |
| `type:*` / `area:*` | 種別・領域 | 起票時 |

AIの着手順: `ai-ready` かつ `phase:poc` → `phase:mvp` の順、同フェーズ内は Issue 番号の昇順。依存Issueが未クローズなら `blocked` を付けてスキップ。

## 3. ブランチ・コミット・PR

- ブランチ: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<slug>`（main 直push禁止）
- コミット: Conventional Commits（`feat(api): add service search endpoint (#12)`）
- PR: テンプレートに従い `Closes #<issue>` を必ず記載。1 PR = 1 Issue、差分は目安 400 行以内
- マージ: **Squash merge のみ**。マージ後ブランチ自動削除

## 4. CI/CD

| ワークフロー | 契機 | 内容 |
|---|---|---|
| `ci.yml` | PR / main push / 手動 | `verify`: install → prisma generate → turbo lint/typecheck/test/build、`secret-scan`: gitleaks、`e2e`: postgres → migrate+seed → Playwright（トップ→絞込→詳細） |
| `lockfile-sync.yml` | main以外への package.json 変更push | `pnpm-lock.yaml` を再生成・コミットし CI を再起動（AI/MCP経由のコミット対策） |
| `deploy.yml` | main push / 手動 | `vars.DEPLOY_ENABLED == 'true'` の時のみ。ECR push → stg → 本番（Environment承認） |
| `labels.yml` | labels.json 変更 / 手動 | ラベル同期 |
| Dependabot | 毎週月曜 | minor/patch をグループ化。メジャー更新は自動PRしない（計画的にIssue化） |

ローカルでCI相当: `pnpm verify`

ローカル動作確認:
- 一括起動: `docker compose --profile app up --build` → http://localhost:3000（postgres → migrate + seed → api:4000 → web:3000）
- E2E: `docker compose up -d postgres` → `pnpm db:migrate && pnpm db:seed` → `pnpm --filter web test:e2e`（api / web は自動起動。初回は `pnpm --filter web exec playwright install chromium`）

## 5. 不具合（バグ）の扱い

機能と同じく「台帳（シート）→ Issue → `ai-ready` → AI が修正 PR → CI → Squash merge」で回す。台帳は機能一覧と同じスプレッドシートの **「バグ一覧」タブ**（1 行 = 1 Issue、ID は `B-001` から連番）。

```
発見（人 / AI の検証 / 利用者の報告）
  ├─ シート「バグ一覧」に 1 行追加（ステータス: 未対応）
  └─ または GitHub の「不具合」テンプレートで起票（type:bug）
        │ 定期実行の AI が双方向に同期: シートの Issue 列が空の行 → Issue 化 / シートに無い type:bug Issue → 行を追加
        ▼
  GitHub Issue [type:bug + needs-spec]  タイトル: [B-xxx] 件名
        │ 人が 再現手順・期待する動作・修正方針 を確認し、ステータスを「ai-ready」に
        ▼
  [ai-ready] → AI が fix ブランチ → PR（Closes #）→ CI → Squash merge → シートを「完了」に
```

| 列 | 内容 |
|---|---|
| 重要度 | `S1` 致命（起動不可・データ破損・セキュリティ）/ `S2` 重大（主要機能が使えない、回避策あり）/ `S3` 軽微（体裁・開発体験） |
| 領域 | web / api / shared / infra（Issue の `area:*` ラベルに対応） |
| 事象・再現手順・期待する動作 | Issue テンプレートと同じ項目。再現手順はコマンドや URL まで具体的に |
| 原因・修正方針 | 分かる範囲で。空でもよいが、`ai-ready` にする前に人が確認する |
| 関連機能 | 機能一覧の ID（原因となった機能・影響する機能） |
| ステータス | 未対応 / ai-ready / PRレビュー待ち / 完了 / 対応不要 |

- **着手条件**: 機能と同じく `ai-ready` のみ。AI が見つけたバグは `needs-spec` で起票し、人の判断を待つ（ユーザーが明示的に修正を指示した場合を除く）
- **AI の着手順**: 重要度（S1 → S3）→ Issue 番号の昇順。機能 Issue より S1・S2 のバグを優先する
- **修正 PR**: 1 PR = 1 バグ。可能な限り**先に再現テストを書いて失敗を確認してから**修正する（テストで再現できない環境起因のバグは、PR の動作確認に修正前後の手順と結果を書く）
- **修正中に別のバグを見つけたら**: 同じ PR で直すのが最小なら直して PR 本文に明記し、そうでなければ新しい行・Issue を起票する
- **セキュリティ上の不具合（脆弱性）**: リポジトリは公開のため、Issue・PR・コミットに再現手順や攻撃方法を書かない。詳細はバグ一覧（非公開シート）にだけ書き、Issue は概要と修正方針のみ。重要度は認可の欠落・個人情報や秘密情報の漏洩・認証回避が S1、その他の悪用可能なものは S2 以上（詳細は `docs/AI_RUNBOOK.md` 2.8「セキュリティ品質管理」）

## 6. Definition of Done

- 受入条件をすべて満たし、対応するテスト（API: vitest+supertest、shared: vitest）がある。バグ修正は再現テストを含める
- `pnpm verify` 通過、secret-scan 通過
- 新しい環境変数は `.env.example` に追記、DB変更は Prisma マイグレーション同梱（Expand/Contract）
- ユーザー向け文言は3言語（ja/en/vi）キーを用意（未翻訳は en をフォールバック）

## 7. GitHub設定（管理者が一度だけ実施）

1. **Settings > General > Pull Requests**: 「Allow squash merging」のみON、「Automatically delete head branches」ON、「Allow auto-merge」ON
2. **Settings > Rules > Rulesets > New ruleset > Import a ruleset**: `.github/rulesets/main-protection.json` をインポート
   - main への直push禁止 / force push禁止 / `verify`・`secret-scan` 必須 / Squashのみ
   - 承認数は 0（AIのPRは同一アカウント作成のため自己承認不可。**人がマージボタンを押す行為をレビューとみなす**。メンバー増員時に1へ）
3. **Settings > Environments**: `staging`（保護なし）、`production`（Required reviewers に担当者）を作成
4. **Actions > Label Sync** を手動実行（Run workflow）してラベル作成
5. AWS構築後: Variables `DEPLOY_ENABLED=true`、Secrets `AWS_OIDC_ROLE_ARN`

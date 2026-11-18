# 開発フロー（AI協調・GitHub Flow）

2名体制 + AI実装を前提に「仕様をIssueで確定 → AIがPR → CIが品質担保 → 人がマージ判断」に一本化する。

## 1. 全体の流れ

```
機能一覧シート(Drive) ──1行=1Issue──▶ GitHub Issue [needs-spec]
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
- E2E: `docker compose up -d postgres` → `pnpm --filter api exec prisma migrate deploy && pnpm --filter api db:seed` → `pnpm --filter web test:e2e`（api / web は自動起動。初回は `pnpm --filter web exec playwright install chromium`）

## 5. Definition of Done

- 受入条件をすべて満たし、対応するテスト（API: vitest+supertest、shared: vitest）がある
- `pnpm verify` 通過、secret-scan 通過
- 新しい環境変数は `.env.example` に追記、DB変更は Prisma マイグレーション同梱（Expand/Contract）
- ユーザー向け文言は4言語（ja/en/zh/vi）キーを用意（未翻訳は en をフォールバック）

## 6. GitHub設定（管理者が一度だけ実施）

1. **Settings > General > Pull Requests**: 「Allow squash merging」のみON、「Automatically delete head branches」ON、「Allow auto-merge」ON
2. **Settings > Rules > Rulesets > New ruleset > Import a ruleset**: `.github/rulesets/main-protection.json` をインポート
   - main への直push禁止 / force push禁止 / `verify`・`secret-scan` 必須 / Squashのみ
   - 承認数は 0（AIのPRは同一アカウント作成のため自己承認不可。**人がマージボタンを押す行為をレビューとみなす**。メンバー増員時に1へ）
3. **Settings > Environments**: `staging`（保護なし）、`production`（Required reviewers に担当者）を作成
4. **Actions > Label Sync** を手動実行（Run workflow）してラベル作成
5. AWS構築後: Variables `DEPLOY_ENABLED=true`、Secrets `AWS_OIDC_ROLE_ARN`

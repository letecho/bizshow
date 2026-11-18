# 在日外国人向けサービス検索サイト (Starter Repository)

代替案B（AWS維持＋徹底コスト削減・将来拡張スイッチ付き）構成の初期モノレポリポジトリです。

## アーキテクチャ概要
- **フロントエンド (`apps/web`)**: Next.js (App Router / TypeScript)
- **バックエンド (`apps/api`)**: Node.js + Express / Prisma ORM (PostgreSQL)
- **共通パッケージ (`packages/shared`)**: バリデーションスキーマ・将来拡張スイッチ対応キャッシュ層 (`LRU` <-> `Valkey`)
- **インフラ (`infra/terraform`)**: AWS (ECS Fargate Spot併用 / RDS PostgreSQL PITR / S3 / Cognito / SSM) + 将来拡張フラグ (`variables.tf`)
- **CI/CD (`.github/workflows`)**: GitHub Actions (Lint / Typecheck / Test / E2E / OIDC ECR・ECSデプロイ)

## ローカル開発クイックスタート
前提: Node.js 22 以上、pnpm 9（`corepack enable` で `packageManager` のバージョンが使われます）、Docker

```bash
# 1. 依存パッケージインストール
pnpm install

# 2. 環境変数（リポジトリ直下の .env 1 つを API・Prisma・Web が読みます）
cp .env.example .env

# 3. ローカル DB (PostgreSQL) 起動
docker compose up -d postgres

# 4. マイグレーション適用 & シードデータ投入（24 件。何度実行しても同じ結果）
pnpm db:migrate
pnpm db:seed

# 5. Web & API 同時起動
pnpm dev
```

| URL | 内容 |
|---|---|
| http://localhost:3000 | 検索画面（ブラウザの言語で /ja・/en・/zh・/vi に移動） |
| http://localhost:3000/admin | 管理画面。`.env` の `AUTH_MODE=dev` により「開発用ログイン」で入れます |
| http://localhost:4000/health | API ヘルスチェック |

- キャッシュは既定でプロセス内メモリです。Valkey を試す場合は `docker compose up -d valkey` して `.env` に `REDIS_URL=redis://localhost:6379` を設定します
- 画像アップロードは既定で `apps/api/uploads/` に保存されます（`STORAGE_DRIVER=local`）
- お問い合わせの通知メールは既定で API のログに出力されます（`MAIL_DRIVER=log`）
- スキーマを変更したら `pnpm --filter api db:migrate --name <変更内容>` でマイグレーションを作成します

### Docker だけで一括起動する場合
```bash
docker compose --profile app up --build   # → http://localhost:3000
```
postgres → マイグレーション＋シード → API → Web の順に起動します。

## 将来拡張スイッチの使い方 (`infra/terraform/envs/prod/terraform.tfvars`)
初期は月額約8,745円（税込）の最小構成でスタートし、サービス成長時に `terraform.tfvars` のフラグを `true` に切り替えて `terraform apply` するだけで無停止スケールアップが可能です。

## 開発フロー
- CI相当のローカル検証: `pnpm verify`
- Issue → `ai-ready` → AI実装PR → CI → Squash merge の流れは [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- AIエージェント向け規約は [CLAUDE.md](CLAUDE.md)

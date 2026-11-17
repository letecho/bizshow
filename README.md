# 在日外国人向けサービス検索サイト (Starter Repository)

代替案B（AWS維持＋徹底コスト削減・将来拡張スイッチ付き）構成の初期モノレポリポジトリです。

## アーキテクチャ概要
- **フロントエンド (`apps/web`)**: Next.js (App Router / TypeScript)
- **バックエンド (`apps/api`)**: Node.js + Express / Prisma ORM (PostgreSQL)
- **共通パッケージ (`packages/shared`)**: バリデーションスキーマ・将来拡張スイッチ対応キャッシュ層 (`LRU` <-> `Valkey`)
- **インフラ (`infra/terraform`)**: AWS (ECS Fargate Spot併用 / RDS PostgreSQL PITR / S3 / Cognito / SSM) + 将来拡張フラグ (`variables.tf`)
- **CI/CD (`.github/workflows`)**: GitHub Actions (Lint / Typecheck / Test / E2E / OIDC ECR・ECSデプロイ)

## ローカル開発クイックスタート
```bash
# 1. 依存パッケージインストール
pnpm install

# 2. ローカルDB (PostgreSQL) & Valkey 起動
docker compose up -d

# 3. 環境変数サンプルのコピー
cp .env.example .env

# 4. Prisma クライアント生成 & マイグレーション
pnpm --filter api exec prisma migrate dev --name init

# 5. Web & API 同時起動
pnpm dev
```

## 将来拡張スイッチの使い方 (`infra/terraform/envs/prod/terraform.tfvars`)
初期は月額約8,745円（税込）の最小構成でスタートし、サービス成長時に `terraform.tfvars` のフラグを `true` に切り替えて `terraform apply` するだけで無停止スケールアップが可能です。

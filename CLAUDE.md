# AI実装ガイド（Claude / その他エージェント共通）

在日外国人向け多言語サービス検索サイト。POC最優先・最小かつ拡張可能に作る。

## 構成
- `apps/web` Next.js 15 App Router（TypeScript, standalone出力）
- `apps/api` Express + Prisma(PostgreSQL)。`app` を export し `supertest` でテスト
- `packages/shared` 型・Zodスキーマ・キャッシュ層（`appCache`: REDIS_URL 未設定=LRU）
- `infra/terraform` AWS。拡張は `terraform.tfvars` のフラグで行う

## ルール
1. 作業単位は GitHub Issue（`ai-ready` のみ着手）。仕様にない機能を足さない。不明点は推測で埋めず PR 本文の「確認事項」に書く。不具合はシート「バグ一覧」と `type:bug` Issue で管理し、修正 PR には再現テストを付ける（`docs/DEVELOPMENT.md` 5章）
2. API と Web で共有する型・入力検証は `packages/shared` に置く（Web から API の型を直接 import しない）
3. 対応言語は `SupportedLocale = 'ja' | 'en' | 'vi'`。翻訳テキストは `Record<Locale, string>` 形式、欠損時は `en` フォールバック
4. API: `GET /api/v1/...`、レスポンスは `{ data, meta? }`、エラーは `{ error: { code, message } }`
5. 新しい依存追加は最小限。lockfile は `lockfile-sync` が自動更新するので package.json だけ変更すればよい
6. 完了前に `pnpm verify` 相当（lint / typecheck / test / build）が通ること。API変更にはテストを付ける
7. 秘密情報をコミットしない。環境変数は `.env.example` に追記
8. 詳細フローは `docs/DEVELOPMENT.md`、定期実行（自立 CI/CD）の手順は `docs/AI_RUNBOOK.md`

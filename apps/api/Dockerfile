FROM node:22-alpine AS base
# Prisma のクエリエンジンは libssl が必要（alpine には標準で入っていない）
RUN apk add --no-cache openssl && corepack enable

# builder: ワークスペース全体 + prisma generate 済み。docker compose の migrate/seed でも使う
FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api exec prisma generate
RUN pnpm turbo run build --filter=api
# 本番依存だけを /prod/api に展開し、その node_modules 向けに Prisma Client を生成する
# （@fss/shared は dist にバンドル済みのため devDependencies 扱いで含まれない）
RUN pnpm --filter api deploy --prod /prod/api \
 && cd /prod/api \
 && /app/apps/api/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser
COPY --from=builder --chown=apiuser:nodejs /prod/api/package.json ./package.json
COPY --from=builder --chown=apiuser:nodejs /prod/api/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /prod/api/dist ./dist
COPY --from=builder --chown=apiuser:nodejs /prod/api/prisma ./prisma
USER apiuser
EXPOSE 4000
CMD ["node", "dist/main.js"]

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {
  appCache,
  loadEntityScope,
  loadOutreachConfig,
  loadStaleDays,
  type BudgetedLlm,
  type EntityScope,
  type OutreachConfig,
} from '@fss/shared';
import { accessLog } from './middleware/accessLog';
import { requireAdmin, type AuthOptions } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { globalRateLimit, parseTrustProxy, type RateLimitOptions } from './middleware/rateLimit';
import type { Mailer } from './mail/mailer';
import type { BlocklistRepository } from './repositories/blocklistRepository';
import type { CandidateRepository } from './repositories/candidateRepository';
import type { InquiryRepository } from './repositories/inquiryRepository';
import type { ListingRequestRepository } from './repositories/listingRequestRepository';
import type { OutreachRepository } from './repositories/outreachRepository';
import type { ServiceAdminRepository, ServiceRepository } from './repositories/serviceRepository';
import { adminRouter } from './routes/admin';
import { inquiriesRouter } from './routes/inquiries';
import { listingRequestsRouter } from './routes/listingRequests';
import { localUploadsRouter } from './routes/localUploads';
import { outreachRouter } from './routes/outreach';
import { servicesRouter } from './routes/services';
import type { LocalStorage, Storage } from './storage/storage';

export interface AppOptions {
  serviceRepository: ServiceRepository & ServiceAdminRepository;
  inquiryRepository: InquiryRepository;
  listingRequestRepository: ListingRequestRepository;
  /** 収集・クロールのブロックリスト（F-116） */
  blocklistRepository: BlocklistRepository;
  /** 掲載候補のレビュー（F-113） */
  candidateRepository: CandidateRepository;
  /** 候補の承認で認める事業者の種類（既定: env COLLECTOR_ENTITY_SCOPE、未設定 corporate_public） */
  entityScope?: EntityScope;
  /** 管理画面の「未確認の掲載」の基準日数（既定: env COLLECTOR_STALE_DAYS、未設定 180） */
  staleDays?: number;
  /** 候補の説明文の下書きに使う LLM（F-117）。未指定なら下書きは使えない（main.ts が env から作る） */
  llm?: BudgetedLlm;
  /** 掲載案内の送信履歴・受信拒否（F-118） */
  outreachRepository: OutreachRepository;
  /** 掲載案内の設定（既定: env OUTREACH_*。有効なのに送信者情報などが欠けていれば起動エラー） */
  outreachConfig?: OutreachConfig;
  mailer: Mailer;
  /** 管理 API の認証（AUTH_MODE=dev | cognito） */
  auth: AuthOptions;
  /** 画像アップロード先の発行（STORAGE_DRIVER=local | s3） */
  storage: Storage;
  /** STORAGE_DRIVER=local のときのアップロード受付・配信 */
  localUploads?: { storage: LocalStorage; dir: string };
  /** お問い合わせの運営通知先（既定: env MAIL_OPERATOR_TO） */
  operatorEmail?: string;
  /** 全体レート制限（既定 120 req/分/IP） */
  rateLimit?: RateLimitOptions;
  /** Express の trust proxy 設定（既定: env TRUST_PROXY） */
  trustProxy?: boolean | number | string;
  /** アクセスログの出力先（既定: console.log、テスト時は出力しない） */
  log?: (line: string) => void;
}

export function createApp(options: AppOptions) {
  const app = express();
  const outreachConfig = options.outreachConfig ?? loadOutreachConfig(process.env);
  const log = options.log ?? (process.env.NODE_ENV === 'test' ? () => {} : console.log);

  // Cloudflare → ALB 経由でもクライアント IP（X-Forwarded-For）でレート制限できるようにする
  app.set('trust proxy', options.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY));
  app.disable('x-powered-by');

  // JSON のみ返す API なので CSP は最も厳しく（何も読み込ませない・埋め込ませない）
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
    }),
  );
  app.use(cors({ origin: process.env.WEB_ORIGIN || '*' }));
  app.use(express.json());
  app.use(accessLog(log));
  app.use(globalRateLimit(options.rateLimit));

  // ALB / UptimeRobot ヘルスチェック用エンドポイント
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      cacheMode: appCache.isDistributed() ? 'valkey' : 'memory',
      timestamp: new Date().toISOString(),
    });
  });

  if (options.localUploads) {
    app.use(localUploadsRouter(options.localUploads.storage, options.localUploads.dir));
  }

  app.use('/api/v1/services', servicesRouter(options.serviceRepository));
  app.use(
    '/api/v1/inquiries',
    inquiriesRouter({
      repo: options.inquiryRepository,
      mailer: options.mailer,
      operatorEmail: options.operatorEmail ?? process.env.MAIL_OPERATOR_TO,
    }),
  );

  app.use('/api/v1/listing-requests', listingRequestsRouter(options.listingRequestRepository));
  app.use(
    '/api/v1/outreach',
    outreachRouter({ config: outreachConfig, outreach: options.outreachRepository, candidates: options.candidateRepository }),
  );

  app.use(
    '/api/v1/admin',
    adminRouter({
      requireAdmin: requireAdmin(options.auth),
      services: options.serviceRepository,
      listingRequests: options.listingRequestRepository,
      storage: options.storage,
      blocklist: options.blocklistRepository,
      staleDays: options.staleDays ?? loadStaleDays(process.env),
      candidates: options.candidateRepository,
      entityScope: options.entityScope ?? loadEntityScope(process.env),
      llm: options.llm,
      outreach: options.outreachRepository,
      outreachConfig,
      mailer: options.mailer,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

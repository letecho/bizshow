import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appCache } from '@fss/shared';
import { accessLog } from './middleware/accessLog';
import { requireAdmin, type AuthOptions } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { globalRateLimit, parseTrustProxy, type RateLimitOptions } from './middleware/rateLimit';
import type { Mailer } from './mail/mailer';
import type { InquiryRepository } from './repositories/inquiryRepository';
import type { ListingRequestRepository } from './repositories/listingRequestRepository';
import type { ServiceAdminRepository, ServiceRepository } from './repositories/serviceRepository';
import { adminRouter } from './routes/admin';
import { inquiriesRouter } from './routes/inquiries';
import { listingRequestsRouter } from './routes/listingRequests';
import { servicesRouter } from './routes/services';

export interface AppOptions {
  serviceRepository: ServiceRepository & ServiceAdminRepository;
  inquiryRepository: InquiryRepository;
  listingRequestRepository: ListingRequestRepository;
  mailer: Mailer;
  /** 管理 API の認証（AUTH_MODE=dev | cognito） */
  auth: AuthOptions;
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
    '/api/v1/admin',
    adminRouter({
      requireAdmin: requireAdmin(options.auth),
      services: options.serviceRepository,
      listingRequests: options.listingRequestRepository,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

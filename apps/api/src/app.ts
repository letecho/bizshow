import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appCache } from '@fss/shared';
import { accessLog } from './middleware/accessLog';
import { errorHandler, notFoundHandler } from './middleware/errors';
import type { ServiceRepository } from './repositories/serviceRepository';
import { servicesRouter } from './routes/services';

export interface AppOptions {
  serviceRepository: ServiceRepository;
  /** アクセスログの出力先（既定: console.log、テスト時は出力しない） */
  log?: (line: string) => void;
}

export function createApp(options: AppOptions) {
  const app = express();
  const log = options.log ?? (process.env.NODE_ENV === 'test' ? () => {} : console.log);

  app.use(helmet());
  app.use(cors({ origin: process.env.WEB_ORIGIN || '*' }));
  app.use(express.json());
  app.use(accessLog(log));

  // ALB / UptimeRobot ヘルスチェック用エンドポイント
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      cacheMode: appCache.isDistributed() ? 'valkey' : 'memory',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/services', servicesRouter(options.serviceRepository));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

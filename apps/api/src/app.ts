import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appCache } from '@fss/shared';
import { accessLog } from './middleware/accessLog';
import { errorHandler, notFoundHandler } from './middleware/errors';

export interface AppOptions {
  /** アクセスログの出力先（既定: console.log、テスト時は出力しない） */
  log?: (line: string) => void;
}

export function createApp(options: AppOptions = {}) {
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

  // サービス検索API (サンプル + キャッシュ統合) ※F-003 で /api/v1/services に置き換え予定
  app.get('/api/services', async (req, res) => {
    const lang = String(req.query.lang || 'en');
    const category = String(req.query.category || 'all');
    const cacheKey = `services:${lang}:${category}`;

    const cached = await appCache.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', items: JSON.parse(cached) });
    }

    const sampleItems = [
      {
        id: 'srv-001',
        category: 'medical',
        prefecture: 'Tokyo',
        supportedLanguages: ['ja', 'en', 'zh', 'vi'],
        title: lang === 'ja' ? '多言語対応クリニック新宿' : 'Shinjuku Multilingual Clinic',
      },
      {
        id: 'srv-002',
        category: 'legal',
        prefecture: 'Saitama',
        supportedLanguages: ['ja', 'en', 'vi'],
        title: lang === 'ja' ? '在留資格・ビザ相談センター' : 'Visa & Immigration Support Office',
      },
    ];

    const filtered = category === 'all'
      ? sampleItems
      : sampleItems.filter((item) => item.category === category);

    await appCache.set(cacheKey, JSON.stringify(filtered), 120);
    res.json({ source: 'origin', items: filtered });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

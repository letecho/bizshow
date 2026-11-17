import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appCache } from '@fss/shared';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(helmet());
app.use(cors());
app.use(express.json());

// ALB / UptimeRobot ヘルスチェック用エンドポイント
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    cacheMode: appCache.isDistributed() ? 'valkey' : 'memory',
    timestamp: new Date().toISOString(),
  });
});

// サービス検索API (サンプル + キャッシュ統合)
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
}

export { app };

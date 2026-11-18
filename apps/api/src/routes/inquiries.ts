import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { InquiryInputSchema } from '@fss/shared';
import { HttpError } from '../middleware/errors';
import type { Mailer } from '../mail/mailer';
import type { InquiryRepository } from '../repositories/inquiryRepository';
import { asyncHandler } from './asyncHandler';

export interface InquiriesRouterOptions {
  repo: InquiryRepository;
  mailer: Mailer;
  /** 運営の通知先。未設定なら通知しない */
  operatorEmail?: string;
}

export function inquiriesRouter({ repo, mailer, operatorEmail }: InquiriesRouterOptions): Router {
  const router = Router();

  // IP 毎 5 回 / 10 分。app インスタンス毎のメモリストア
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Too many inquiries. Please try again later.')),
  });

  router.post(
    '/',
    limiter,
    asyncHandler(async (req, res) => {
      const input = InquiryInputSchema.parse(req.body);

      // ハニーポットに入力があればボットとみなし、保存せず成功を装う
      if (input.website) {
        res.status(201).json({ data: { received: true } });
        return;
      }

      const { name, email, message, locale } = input;
      const record = await repo.create({ name, email, message, locale });

      if (operatorEmail) {
        // 通知失敗で利用者の送信を失敗扱いにしない（保存済みのため）
        await mailer
          .send({
            to: operatorEmail,
            subject: `[bizshow] New inquiry from ${name}`,
            text: `ID: ${record.id}\nName: ${name}\nEmail: ${email}\nLocale: ${locale}\n\n${message}`,
          })
          .catch((err: unknown) => console.error('Failed to send inquiry notification', err));
      }

      res.status(201).json({ data: { received: true } });
    }),
  );

  return router;
}

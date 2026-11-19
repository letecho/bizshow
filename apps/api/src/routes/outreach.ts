import { Router } from 'express';
import { OutreachOptOutTokenSchema, listingInvitePrefill, type OutreachConfig } from '@fss/shared';
import { HttpError } from '../middleware/errors';
import type { CandidateRepository } from '../repositories/candidateRepository';
import type { OutreachRepository } from '../repositories/outreachRepository';
import { verifyOutreachToken } from '../outreach/token';
import { asyncHandler } from './asyncHandler';

const invalidToken = () => new HttpError(404, 'INVALID_TOKEN', 'The link is invalid or has expired');

/**
 * /api/v1/outreach: 掲載案内のリンク（F-118）。署名付きトークンでのみ使える。
 * - GET /invites/:token → 掲載申請フォームの事前入力（候補の事実のみ。収集元の説明文・宛先は返さない）
 * - POST /opt-out {token} → 受信拒否の登録
 */
export function outreachRouter({
  config,
  outreach,
  candidates,
  now = () => new Date(),
}: {
  config: OutreachConfig;
  outreach: OutreachRepository;
  candidates: CandidateRepository;
  now?: () => Date;
}): Router {
  const router = Router();

  router.get(
    '/invites/:token',
    asyncHandler(async (req, res) => {
      const secret = config.linkSecret;
      const id = secret ? verifyOutreachToken(secret, 'invite', String(req.params.token), now()) : null;
      const record = id ? await outreach.findById(id) : null;
      if (!record || record.status !== 'sent') throw invalidToken();
      const candidate = await candidates.findById(record.candidateId);
      if (!candidate) throw invalidToken();
      res.json({ data: listingInvitePrefill(candidate.extracted) });
    }),
  );

  router.post(
    '/opt-out',
    asyncHandler(async (req, res) => {
      const { token } = OutreachOptOutTokenSchema.parse(req.body ?? {});
      const secret = config.linkSecret;
      const id = secret ? verifyOutreachToken(secret, 'optout', token, now()) : null;
      const record = id ? await outreach.findById(id) : null;
      if (!record) throw invalidToken();
      await outreach.addOptOut(record.email, 'link');
      // 宛先は返さない
      res.json({ data: { optedOut: true } });
    }),
  );

  return router;
}

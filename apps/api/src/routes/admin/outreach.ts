import { Router } from 'express';
import {
  OutreachOptOutInputSchema,
  SendOutreachSchema,
  buildOutreachMessage,
  isBlockedEntity,
  isDomainBlocked,
  startOfJstDay,
  type AdminOutreachStatus,
  type OutreachConfig,
} from '@fss/shared';
import type { Mailer } from '../../mail/mailer';
import { getAdmin } from '../../middleware/auth';
import { HttpError } from '../../middleware/errors';
import type { BlocklistRepository } from '../../repositories/blocklistRepository';
import type { CandidateRepository } from '../../repositories/candidateRepository';
import type { OutreachRepository } from '../../repositories/outreachRepository';
import { signOutreachToken } from '../../outreach/token';
import { asyncHandler } from '../asyncHandler';

export interface AdminOutreachRouterOptions {
  config: OutreachConfig;
  outreach: OutreachRepository;
  candidates: CandidateRepository;
  blocklist: BlocklistRepository;
  mailer: Mailer;
  now?: () => Date;
}

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

/**
 * /api/v1/admin/candidates/:id/outreach: 掲載案内の状態と送信（F-118）。
 * 管理者が 1 件ずつ送る。無効・ブロックリスト・受信拒否・送信済み・1 日の上限のときは送らない
 */
export function adminCandidateOutreachRouter({
  config,
  outreach,
  candidates,
  blocklist,
  mailer,
  now = () => new Date(),
}: AdminOutreachRouterOptions): Router {
  const router = Router({ mergeParams: true });

  const status = async (candidateId: string): Promise<AdminOutreachStatus> => ({
    enabled: config.enabled,
    dailyLimit: config.dailyLimit,
    sentToday: await outreach.countSentSince(startOfJstDay(now())),
    history: await outreach.listByCandidate(candidateId),
  });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      if (!(await candidates.findById(id))) throw new HttpError(404, 'NOT_FOUND', `Candidate not found: ${id}`);
      res.json({ data: await status(id) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const c = config;
      if (!c.enabled || !c.sender || !c.linkSecret || !c.webOrigin) {
        throw new HttpError(409, 'OUTREACH_DISABLED', 'Outreach is not enabled (OUTREACH_ENABLED)');
      }
      const id = String(req.params.id);
      const input = SendOutreachSchema.parse(req.body);
      const candidate = await candidates.findById(id);
      if (!candidate) throw new HttpError(404, 'NOT_FOUND', `Candidate not found: ${id}`);
      if (candidate.status !== 'pending' && candidate.status !== 'on_hold') {
        throw new HttpError(409, 'CONFLICT', `Candidate is already ${candidate.status}`);
      }

      // ブロックリスト（F-116）: 掲載の Web サイト・法人番号・宛先のドメイン・公表ページのドメイン
      const entries = await blocklist.list();
      const blockedDomains = entries.map((e) => e.domain).filter((d): d is string => Boolean(d));
      const hosts = [input.to.split('@')[1], hostOf(input.publishedUrl)].filter((h): h is string => Boolean(h));
      if (
        isBlockedEntity(entries, { websiteUrl: candidate.extracted.websiteUrl, corporateNumber: candidate.corporateNumber }) ||
        hosts.some((h) => isDomainBlocked(h, blockedDomains))
      ) {
        throw new HttpError(409, 'OUTREACH_BLOCKED', 'The business is on the blocklist');
      }
      if (await outreach.isOptedOut(input.to)) {
        throw new HttpError(409, 'OUTREACH_OPTED_OUT', 'The address has opted out');
      }
      if (await outreach.hasSentTo(input.to)) {
        throw new HttpError(409, 'OUTREACH_ALREADY_SENT', 'Outreach has already been sent to the address');
      }
      const current = now();
      if ((await outreach.countSentSince(startOfJstDay(current))) >= c.dailyLimit) {
        throw new HttpError(429, 'OUTREACH_DAILY_LIMIT', `The daily outreach limit (${c.dailyLimit}) has been reached`);
      }

      const record = await outreach.create({
        candidateId: id,
        email: input.to,
        publishedUrl: input.publishedUrl,
        sentBy: getAdmin(res).sub,
      });
      const inviteExpiresAt = new Date(current.getTime() + c.linkTtlDays * 24 * 60 * 60 * 1000);
      const invite = signOutreachToken(c.linkSecret, 'invite', record.id, inviteExpiresAt);
      const optOut = signOutreachToken(c.linkSecret, 'optout', record.id);
      const message = buildOutreachMessage({
        extract: candidate.extracted,
        sender: c.sender,
        inviteUrl: `${c.webOrigin}/ja/apply?invite=${encodeURIComponent(invite)}`,
        optOutUrl: `${c.webOrigin}/ja/outreach/opt-out?token=${encodeURIComponent(optOut)}`,
        inviteExpiresAt,
      });
      try {
        await mailer.send({ to: input.to, ...message });
      } catch {
        await outreach.setStatus(record.id, 'failed');
        // 送信サービスのエラー内容は返さない
        throw new HttpError(502, 'MAIL_FAILED', 'Failed to send the outreach email');
      }
      await outreach.setStatus(record.id, 'sent');
      res.status(201).json({ data: await status(id) });
    }),
  );

  return router;
}

/** /api/v1/admin/outreach/opt-outs: 返信・電話などで受けた受信拒否の登録（F-118） */
export function adminOutreachOptOutRouter(outreach: OutreachRepository): Router {
  const router = Router();
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { email } = OutreachOptOutInputSchema.parse(req.body);
      await outreach.addOptOut(email, 'admin');
      res.status(201).json({ data: { email } });
    }),
  );
  return router;
}

import { createHmac, timingSafeEqual } from 'node:crypto';

/** 掲載案内のリンクの種類: invite = 掲載申請フォームの事前入力、optout = 受信拒否 */
export type OutreachTokenKind = 'invite' | 'optout';

interface Payload {
  k: OutreachTokenKind;
  /** OutreachMessage.id（URL に宛先などの個人情報を入れない） */
  id: string;
  /** 有効期限（UNIX 秒）。0 = 無期限（受信拒否は期限を設けない） */
  exp: number;
}

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function signOutreachToken(secret: string, kind: OutreachTokenKind, id: string, expiresAt?: Date): string {
  const payload: Payload = { k: kind, id, exp: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

/** 署名・種類・期限を検証し OutreachMessage.id を返す。不正・期限切れは null */
export function verifyOutreachToken(secret: string, kind: OutreachTokenKind, token: string, now: Date): string | null {
  const [body, signature, ...rest] = token.split('.');
  if (!body || !signature || rest.length) return null;
  const expected = Buffer.from(sign(secret, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let payload: Partial<Payload>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>;
  } catch {
    return null;
  }
  if (payload.k !== kind || typeof payload.id !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp !== 0 && payload.exp * 1000 <= now.getTime()) return null;
  return payload.id;
}

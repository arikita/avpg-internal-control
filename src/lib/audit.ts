// Audit log bất biến cho hành động phê duyệt (non-repudiation Tầng 1).
// Ghi vào bảng append-only audit_events (xem db/postgres/0002_audit_events.sql).
// Dùng chung cho web (Hono context) và Telegram (chỉ truyền field).

import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, Bindings } from '../types';
import { sessionCookieName } from './session';

export type AuditEvent = {
  eventType: string; // 'approve' | 'reject' | ...
  actorEmail: string;
  actorName: string;
  actorUserId?: string | null;
  proposalId?: number | null;
  step?: string | null; // manager/engineering/ic/bod
  action?: string | null; // approve/reject
  channel: 'web' | 'telegram';
  ip?: string | null;
  userAgent?: string | null;
  sessionRef?: string | null;
  telegramChatId?: string | null;
  detail?: string | null; // JSON tự do
};

// Hash 1 phần cookie phiên -> định danh phiên (KHÔNG lộ secret/cookie gốc).
async function sessionRefFromToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

// Ngữ cảnh request web: IP thật (qua Cloudflare Tunnel forward CF-Connecting-IP), UA, session ref.
export async function webAuditContext(
  c: Context<AppEnv>,
): Promise<{ ip: string | null; userAgent: string | null; sessionRef: string | null }> {
  const ip =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    null;
  const userAgent = c.req.header('user-agent') ?? null;
  const sessionRef = await sessionRefFromToken(getCookie(c, sessionCookieName()));
  return { ip, userAgent, sessionRef };
}

export type AutoSkipItem = { step: string; email: string; name: string; reason: string };

// Ghi các bước "tự duyệt" (proposer trùng vai trò cấp sau) — đi kèm hành động chính.
// ctx = ngữ cảnh request (web: từ webAuditContext; telegram: để null + truyền telegramChatId).
export async function logAutoSkips(
  env: Bindings,
  ctx: { ip: string | null; userAgent: string | null; sessionRef: string | null },
  base: {
    proposalId: number;
    actorUserId: string | null;
    channel: 'web' | 'telegram';
    telegramChatId?: string | null;
  },
  items: AutoSkipItem[],
): Promise<void> {
  for (const a of items) {
    await logAudit(env, {
      eventType: 'auto_approve',
      actorEmail: a.email,
      actorName: a.name,
      actorUserId: base.actorUserId,
      proposalId: base.proposalId,
      step: a.step,
      action: 'approve',
      channel: base.channel,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      sessionRef: ctx.sessionRef,
      telegramChatId: base.telegramChatId ?? null,
      detail: JSON.stringify({ reason: a.reason, autoSkip: true }),
    });
  }
}

// Ghi 1 bản ghi audit. Best-effort: lỗi ghi KHÔNG chặn workflow nhưng log ra console
// (đầy đủ event) để còn truy lại được từ log app nếu DB chặn/ lỗi.
export async function logAudit(env: Bindings, e: AuditEvent): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_events
         (event_type, actor_email, actor_name, actor_user_id, proposal_id, step, action,
          channel, ip, user_agent, session_ref, telegram_chat_id, detail)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    )
      .bind(
        e.eventType,
        e.actorEmail,
        e.actorName,
        e.actorUserId ?? null,
        e.proposalId ?? null,
        e.step ?? null,
        e.action ?? null,
        e.channel,
        e.ip ?? null,
        e.userAgent ?? null,
        e.sessionRef ?? null,
        e.telegramChatId ?? null,
        e.detail ?? null,
      )
      .run();
  } catch (err) {
    console.error('[audit] FAILED to log event', JSON.stringify(e), err);
  }
}

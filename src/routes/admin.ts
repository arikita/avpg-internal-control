// Admin routes — Phase 1 đơn giản: chỉ user có email trong KSNB_TELEGRAM_CHAT_ID
// KHÔNG hợp lý làm role gate. Tạm dùng env ADMIN_EMAILS (csv) — để khi cần.
// Hiện tại: cho mọi user đã login chạy /admin/notify/run để tiện debug.

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../types';
import { requireAdmin } from '../middleware/auth';
import { runNotificationQueue } from '../lib/notifications';
import { renderEmail } from '../lib/email-templates';
import { notFound } from '../lib/errors';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAdmin);

// Trigger queue ngay lập tức.
adminRoutes.post('/notify/run', async (c) => {
  const result = await runNotificationQueue(c.env);
  return c.json({ ok: true, result });
});

// Preview template — render html cho 1 event + proposal_id, không gửi.
// /admin/notify/preview?event=submitted&id=1
adminRoutes.get('/notify/preview', async (c) => {
  const event = c.req.query('event') as
    | 'submitted'
    | 'manager_approved'
    | 'engineering_approved'
    | 'ic_approved'
    | 'bod_approved'
    | 'completed'
    | 'rejected'
    | undefined;
  const id = Number(c.req.query('id'));
  if (!event || !id) throw notFound('Thiếu event hoặc id');
  const { subject, html } = await renderEmail(c.env, event, id);
  return c.html(`<!-- subject: ${subject} -->\n${html}`);
});

// Liệt kê notifications gần nhất (debug).
adminRoutes.get('/notify/list', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, proposal_id, channel, event, recipient, status, attempts, error,
            provider_msg_id, created_at, sent_at
       FROM notifications ORDER BY id DESC LIMIT 50`,
  ).all();
  return c.json({ notifications: res.results ?? [] });
});

// ---------- Audit log (non-repudiation Tầng 1) ----------
type AuditRow = {
  id: number;
  event_time: string;
  event_type: string;
  actor_email: string;
  actor_name: string;
  actor_user_id: string | null;
  proposal_id: number | null;
  step: string | null;
  action: string | null;
  channel: string;
  ip: string | null;
  user_agent: string | null;
  session_ref: string | null;
  telegram_chat_id: string | null;
  detail: string | null;
};

async function queryAudit(
  env: AppEnv['Bindings'],
  opts: { proposal?: number; actor?: string; limit: number },
): Promise<AuditRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  if (opts.proposal != null && !Number.isNaN(opts.proposal)) {
    conds.push(`proposal_id = ?${++n}`);
    params.push(opts.proposal);
  }
  if (opts.actor) {
    conds.push(`LOWER(actor_email) LIKE ?${++n}`);
    params.push(`%${opts.actor.toLowerCase()}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(opts.limit);
  const sql =
    `SELECT id, event_time, event_type, actor_email, actor_name, actor_user_id, proposal_id,
            step, action, channel, ip, user_agent, session_ref, telegram_chat_id, detail
       FROM audit_events ${where} ORDER BY id DESC LIMIT ?${++n}`;
  const res = await env.DB.prepare(sql)
    .bind(...params)
    .all<AuditRow>();
  return res.results ?? [];
}

function parseAuditQuery(c: { req: { query: (k: string) => string | undefined } }) {
  const proposalRaw = c.req.query('proposal') ?? '';
  const actor = c.req.query('actor') ?? '';
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 100));
  return {
    proposalRaw,
    actor,
    limit,
    proposal: proposalRaw ? Number(proposalRaw) : undefined,
  };
}

// JSON — /admin/audit/list?proposal=42&actor=abc&limit=100
adminRoutes.get('/audit/list', async (c) => {
  const q = parseAuditQuery(c);
  const events = await queryAudit(c.env, {
    proposal: q.proposal,
    actor: q.actor || undefined,
    limit: q.limit,
  });
  return c.json({ events });
});

// HTML viewer — /admin/audit?proposal=42&actor=abc
adminRoutes.get('/audit', async (c) => {
  const q = parseAuditQuery(c);
  const rows = await queryAudit(c.env, {
    proposal: q.proposal,
    actor: q.actor || undefined,
    limit: q.limit,
  });
  return c.html(auditPage(rows, { proposal: q.proposalRaw, actor: q.actor, limit: q.limit }));
});

function auditPage(rows: AuditRow[], f: { proposal: string; actor: string; limit: number }) {
  const fmtDetail = (d: string | null): string => {
    if (!d) return '';
    try {
      return JSON.stringify(JSON.parse(d));
    } catch {
      return d;
    }
  };
  return html`<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Audit log phê duyệt — AVPG</title>
<style>
  body{font:13px/1.5 system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#0f172a;background:#f8fafc}
  h1{font-size:18px;margin:0 0 12px}
  form{margin:0 0 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  label{display:flex;flex-direction:column;font-size:11px;color:#64748b;gap:2px}
  input{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}
  button{padding:7px 14px;border:0;border-radius:6px;background:#1e3a8a;color:#fff;font:inherit;cursor:pointer}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
  th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
  td.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;color:#334155}
  .a-approve{color:#047857;font-weight:600}
  .a-reject{color:#be123c;font-weight:600}
  .ch{font-size:11px;padding:1px 6px;border-radius:999px;background:#e0e7ff;color:#3730a3}
  .empty{padding:30px;text-align:center;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
  a{color:#1d4ed8;text-decoration:none}
</style></head>
<body>
  <h1>📜 Audit log phê duyệt</h1>
  <form method="get" action="/admin/audit">
    <label>Mã phiếu (id)<input type="number" name="proposal" value="${f.proposal}" placeholder="vd 42" /></label>
    <label>Email người duyệt<input type="text" name="actor" value="${f.actor}" placeholder="một phần email" /></label>
    <label>Số dòng<input type="number" name="limit" value="${String(f.limit)}" min="1" max="500" /></label>
    <button type="submit">Lọc</button>
  </form>
  ${rows.length === 0
    ? html`<div class="empty">Không có bản ghi.</div>`
    : html`<table>
    <thead><tr>
      <th>#</th><th>Thời điểm (UTC)</th><th>Hành động</th><th>Người duyệt</th><th>Bước</th>
      <th>Phiếu</th><th>Kênh</th><th>IP</th><th>Phiên</th><th>User-Agent</th><th>Chi tiết</th>
    </tr></thead>
    <tbody>
      ${rows.map(
        (r) => html`<tr>
        <td class="mono">${r.id}</td>
        <td class="mono">${r.event_time}</td>
        <td class="${r.action === 'reject' ? 'a-reject' : 'a-approve'}">${r.action ?? r.event_type}</td>
        <td>${r.actor_name}<br /><span class="mono">${r.actor_email}</span></td>
        <td>${r.step ?? ''}</td>
        <td>${r.proposal_id != null ? html`<a href="/p/${r.proposal_id}">#${r.proposal_id}</a>` : ''}</td>
        <td><span class="ch">${r.channel}</span></td>
        <td class="mono">${r.ip ?? ''}${r.telegram_chat_id ? html` · tg:${r.telegram_chat_id}` : ''}</td>
        <td class="mono">${r.session_ref ?? ''}</td>
        <td class="mono" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.user_agent ?? ''}">${r.user_agent ?? ''}</td>
        <td class="mono">${fmtDetail(r.detail)}</td>
      </tr>`,
      )}
    </tbody>
  </table>`}
  <p style="color:#94a3b8;margin-top:10px">${String(rows.length)} bản ghi · giờ UTC · IP lấy từ CF-Connecting-IP</p>
</body></html>`;
}

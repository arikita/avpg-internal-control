// Admin routes — Phase 1 đơn giản: chỉ user có email trong KSNB_TELEGRAM_CHAT_ID
// KHÔNG hợp lý làm role gate. Tạm dùng env ADMIN_EMAILS (csv) — để khi cần.
// Hiện tại: cho mọi user đã login chạy /admin/notify/run để tiện debug.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { runNotificationQueue } from '../lib/notifications';
import { renderEmail } from '../lib/email-templates';
import { notFound } from '../lib/errors';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth);

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

// Thông báo in-app cho chuông header. Trang poll GET /notifications/inbox để lấy
// số chưa đọc + danh sách mới nhất; POST .../read để đánh dấu đã đọc.
// Nguồn dữ liệu: bảng inbox_notification (vd webhook Documenso đẩy 'pr_signed').

import { Hono } from 'hono';
import type { AppEnv } from '../types';

export const inboxRoutes = new Hono<AppEnv>();

type InboxRow = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// Tất cả endpoint dưới đây cần đăng nhập; là XHR nên trả 401 JSON (không redirect).
inboxRoutes.use('*', async (c, next) => {
  if (!c.get('user')) return c.json({ ok: false, error: 'unauthorized' }, 401);
  await next();
});

// Poll: số chưa đọc + 20 thông báo mới nhất của người đang đăng nhập.
inboxRoutes.get('/inbox', async (c) => {
  const email = c.get('user')!.email.toLowerCase();
  const rows =
    (
      await c.env.DB.prepare(
        `SELECT id, kind, title, body, link, read_at, created_at
           FROM inbox_notification WHERE recipient = ?1
          ORDER BY id DESC LIMIT 20`,
      )
        .bind(email)
        .all<InboxRow>()
    ).results ?? [];
  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM inbox_notification WHERE recipient = ?1 AND read_at IS NULL`,
  )
    .bind(email)
    .first<{ n: number }>();
  return c.json({ ok: true, unread: Number(unreadRow?.n ?? 0), items: rows });
});

// Đánh dấu đã đọc tất cả.
inboxRoutes.post('/inbox/read-all', async (c) => {
  const email = c.get('user')!.email.toLowerCase();
  await c.env.DB.prepare(
    `UPDATE inbox_notification SET read_at = iso_now() WHERE recipient = ?1 AND read_at IS NULL`,
  )
    .bind(email)
    .run();
  return c.json({ ok: true });
});

// Đánh dấu đã đọc 1 thông báo (chỉ của chính mình).
inboxRoutes.post('/inbox/:id{[0-9]+}/read', async (c) => {
  const email = c.get('user')!.email.toLowerCase();
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(
    `UPDATE inbox_notification SET read_at = iso_now() WHERE id = ?1 AND recipient = ?2 AND read_at IS NULL`,
  )
    .bind(id, email)
    .run();
  return c.json({ ok: true });
});

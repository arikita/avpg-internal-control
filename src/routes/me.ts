// /api/me/* — self-service cho user đang login.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('*', requireAuth);

const LINK_TOKEN_TTL_SEC = 10 * 60;

// POST /api/me/link-token → sinh token để dùng với /link <token> trên bot.
meRoutes.post('/link-token', async (c) => {
  const user = c.get('user');
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12); // ngắn để gõ
  await c.env.KV.put(`tg:link:${token}`, user.id, { expirationTtl: LINK_TOKEN_TTL_SEC });
  return c.json({ token, expires_in_seconds: LINK_TOKEN_TTL_SEC });
});

// GET /api/me/telegram-status → đã link chưa.
meRoutes.get('/telegram-status', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT telegram_chat_id FROM users WHERE id = ?1`,
  )
    .bind(user.id)
    .first<{ telegram_chat_id: string | null }>();
  return c.json({ linked: !!row?.telegram_chat_id });
});

// POST /api/me/unlink-telegram
meRoutes.post('/unlink-telegram', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE users SET telegram_chat_id = NULL WHERE id = ?1`)
    .bind(user.id)
    .run();
  return c.json({ ok: true });
});

// Telegram webhook. Phase 1 stub: verify secret, log update, ack.
// Action approve/reject + /link <token> + /mypending sẽ làm ở commit kế tiếp.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { badRequest } from '../lib/errors';

export const telegramRoutes = new Hono<AppEnv>();

telegramRoutes.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (!secret || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    throw badRequest('Invalid webhook secret');
  }
  const update = await c.req.json<Record<string, unknown>>();
  console.log('[telegram] update', JSON.stringify(update).slice(0, 500));
  // TODO: route /start, /link <token>, /mypending, callback_query
  return c.json({ ok: true });
});

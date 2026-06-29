// Hono app dùng chung cho cả 2 runtime:
//   - src/index.ts   → Cloudflare Workers (đang chạy prod, giữ tới cutover)
//   - src/server.ts  → Node.js self-hosted (@hono/node-server) — migration đích
// Chỉ chứa wiring routes/middleware; phần cron + bootstrap để mỗi entrypoint tự lo.

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import type { AppEnv } from './types';
import { sessionMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth';
import { proposalRoutes } from './routes/proposals';
import { directoryRoutes } from './routes/directory';
import { telegramRoutes } from './routes/telegram';
import { webRoutes } from './routes/web';
import { adminRoutes } from './routes/admin';
import { invoiceRoutes } from './routes/invoices';
import { paymentRoutes } from './routes/payments';
import { documensoRoutes } from './routes/integrations-documenso';
import { inboxRoutes } from './routes/notifications-inbox';
import { meRoutes } from './routes/me';
import { staticRoutes } from './routes/static';

export const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', sessionMiddleware);
app.onError(errorHandler);

app.get('/health', (c) =>
  c.json({ ok: true, env: c.env.APP_ENV, time: new Date().toISOString() }),
);

app.get('/me', (c) => {
  const user = c.get('user');
  return c.json({ user: user ?? null });
});

app.route('/auth', authRoutes);
app.route('/api/proposals', proposalRoutes);
app.route('/api/directory', directoryRoutes);
app.route('/api/me', meRoutes);
app.route('/admin', adminRoutes);
app.route('/invoices', invoiceRoutes);
app.route('/payments', paymentRoutes);
app.route('/integrations/documenso', documensoRoutes);
app.route('/notifications', inboxRoutes);
app.route('/telegram', telegramRoutes);
app.route('/static', staticRoutes);
app.route('/', webRoutes);

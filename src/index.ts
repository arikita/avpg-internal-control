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
import { runNotificationQueue } from './lib/notifications';

const app = new Hono<AppEnv>();

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
app.route('/admin', adminRoutes);
app.route('/telegram', telegramRoutes);
app.route('/', webRoutes);

// Cron — retry pending notifications (xem wrangler.toml triggers).
export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runNotificationQueue(env));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;

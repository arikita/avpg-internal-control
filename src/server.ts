// Node.js entrypoint (self-hosted on-prem). Chạy bằng: tsx src/server.ts
// Phục vụ HTTP nội bộ cổng PORT (mặc định 8787). cloudflared forward public
// hostname → http://app:8787; TLS terminate ở Cloudflare edge (ingress phương án A).

import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { app } from './app';
import { buildNodeEnv } from './lib/node-env';
import { runNotificationQueue } from './lib/notifications';
import { runAccountSync } from './lib/account-sync';

const env = buildNodeEnv();
const port = Number(process.env.PORT ?? 8787);

// Inject env vào Hono context (c.env) — Workers tự làm, Node truyền tay.
serve({ fetch: (request: Request) => app.fetch(request, env), port }, (info) => {
  console.log(`[server] listening on http://0.0.0.0:${info.port} (APP_ENV=${env.APP_ENV})`);
});

// Cron — thay cho Cloudflare [triggers]. (Hoạt động đầy đủ sau Phase 2 khi DB được wiring.)
//   */5  → retry notifications pending
//   */15 → account-sync (Phase 4: đổi nguồn Graph → LDAP)
cron.schedule('*/5 * * * *', () => {
  runNotificationQueue(env).catch((e) => console.error('[cron] notifications', e));
});
cron.schedule('*/15 * * * *', () => {
  runAccountSync(env).catch((e) => console.error('[cron] account-sync', e));
});

const shutdown = (sig: string) => {
  console.log(`[server] ${sig} → shutting down`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Node.js entrypoint (self-hosted on-prem). Chạy bằng: tsx src/server.ts
// Phục vụ HTTP nội bộ cổng PORT (mặc định 8787). cloudflared forward public
// hostname → http://app:8787; TLS terminate ở Cloudflare edge (ingress phương án A).

import { serve } from '@hono/node-server';
import cron from 'node-cron';

import { app } from './app';
import { buildNodeEnv, getPool } from './lib/node-env';
import { PgKv } from './lib/pg';
import { runMigrations } from './lib/migrate-pg';
import { runNotificationQueue } from './lib/notifications';
import { runAccountSync } from './lib/account-sync';
import { runInvoiceIngest } from './lib/invoice-ingest';

async function main(): Promise<void> {
  const env = buildNodeEnv();
  const port = Number(process.env.PORT ?? 8787);

  // Áp schema/migration Postgres trước khi phục vụ.
  await runMigrations(getPool());
  console.log('[server] migrations OK');

  // Inject env vào Hono context (c.env) — Workers tự làm, Node truyền tay.
  serve({ fetch: (request: Request) => app.fetch(request, env), port }, (info) => {
    console.log(`[server] listening on http://0.0.0.0:${info.port} (APP_ENV=${env.APP_ENV})`);
  });

  // Cron — thay cho Cloudflare [triggers].
  //   */5  → retry notifications pending
  //   */15 → account-sync (Phase 4: đổi nguồn Graph → LDAP)
  //   */10 → dọn ephemeral_kv hết hạn
  cron.schedule('*/5 * * * *', () => {
    runNotificationQueue(env).catch((e) => console.error('[cron] notifications', e));
  });
  cron.schedule('*/15 * * * *', () => {
    runAccountSync(env).catch((e) => console.error('[cron] account-sync', e));
  });
  cron.schedule('*/10 * * * *', () => {
    new PgKv(getPool())
      .cleanup()
      .then((n) => n && console.log(`[cron] ephemeral_kv cleanup ${n}`))
      .catch((e) => console.error('[cron] kv cleanup', e));
  });
  // */10 → ingest hóa đơn NCC từ shared mailbox (tắt nếu INVOICE_MAILBOX trống).
  cron.schedule('*/10 * * * *', () => {
    runInvoiceIngest(env).catch((e) => console.error('[cron] invoice-ingest', e));
  });
}

main().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

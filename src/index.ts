// Cloudflare Workers entrypoint. Wiring routes ở src/app.ts (dùng chung với src/server.ts).
import type { AppEnv } from './types';
import { app } from './app';
import { runNotificationQueue } from './lib/notifications';
import { runAccountSync } from './lib/account-sync';

// Cron (xem wrangler.toml [triggers]):
//   */5  → retry notifications pending
//   */15 → account-sync: poll Graph phát hiện account bị disable trên Entra
// Hai cron là 2 invocation riêng; phân biệt qua controller.cron.
export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(runAccountSync(env));
    } else {
      ctx.waitUntil(runNotificationQueue(env));
    }
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;

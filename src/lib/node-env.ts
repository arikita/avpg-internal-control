// Dựng Bindings (c.env) cho runtime Node từ process.env.
// Workers tự inject env; Node phải build tay rồi truyền vào app.fetch(req, env).
//
// PHASE 1: DB/KV còn là placeholder — mọi truy cập sẽ throw rõ ràng. Các route đụng
// DB/KV sẽ lỗi có chủ đích cho tới khi Phase 2 thay bằng Postgres adapter + ephemeral_kv.
// /health, /me (không cookie) chạy được ngay để verify runtime + ingress.

import type { Bindings } from '../types';

function reqEnv(key: string): string {
  const v = process.env[key];
  if (v == null || v === '') throw new Error(`[node-env] thiếu biến môi trường bắt buộc: ${key}`);
  return v;
}

function notYet(name: string): never {
  throw new Error(
    `[node-env] ${name} chưa wiring cho runtime Node (sẽ có ở Phase 2: Postgres/ephemeral_kv adapter).`,
  );
}

// Placeholder tới Phase 2: truy cập bất kỳ property nào cũng throw.
const dbPlaceholder = new Proxy({} as Bindings['DB'], { get: () => notYet('DB (Postgres adapter)') });
const kvPlaceholder = new Proxy({} as Bindings['KV'], { get: () => notYet('KV (ephemeral_kv)') });

export function buildNodeEnv(): Bindings {
  return {
    DB: dbPlaceholder,
    KV: kvPlaceholder,

    APP_ENV: (process.env.APP_ENV as Bindings['APP_ENV']) ?? 'production',
    APP_BASE_URL: reqEnv('APP_BASE_URL'),
    ENTRA_REDIRECT_PATH: process.env.ENTRA_REDIRECT_PATH ?? '/auth/callback',
    NO_REPLY_MAILBOX: process.env.NO_REPLY_MAILBOX ?? '',
    VN_TZ_OFFSET_MINUTES: process.env.VN_TZ_OFFSET_MINUTES ?? '420',
    ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? '',

    TENANT_ID: process.env.TENANT_ID ?? '',
    CLIENT_ID: process.env.CLIENT_ID ?? '',
    CLIENT_SECRET: process.env.CLIENT_SECRET ?? '',
    SESSION_SECRET: reqEnv('SESSION_SECRET'),
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
    KSNB_TELEGRAM_CHAT_ID: process.env.KSNB_TELEGRAM_CHAT_ID ?? '',
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',

    DEV_MOCK_USER: process.env.DEV_MOCK_USER,
    DEV_MOCK_USER_EMAIL: process.env.DEV_MOCK_USER_EMAIL,
    DEV_MOCK_USER_NAME: process.env.DEV_MOCK_USER_NAME,
    DEV_MOCK_USER_DEPT: process.env.DEV_MOCK_USER_DEPT,
  };
}

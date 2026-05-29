// Dựng Bindings (c.env) cho runtime Node từ process.env.
// Workers tự inject env; Node phải build tay rồi truyền vào app.fetch(req, env).
// DB/KV = adapter Postgres (src/lib/pg.ts) cast về type D1 — routes dùng chung không sửa.

import type { Pool } from 'pg';
import type { Bindings } from '../types';
import { PgDb, PgKv, createPool } from './pg';
import { createFileStore } from './filestore';

function reqEnv(key: string): string {
  const v = process.env[key];
  if (v == null || v === '') throw new Error(`[node-env] thiếu biến môi trường bắt buộc: ${key}`);
  return v;
}

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) pool = createPool(reqEnv('DATABASE_URL'));
  return pool;
}

export function buildNodeEnv(): Bindings {
  const p = getPool();
  const db = new PgDb(p) as unknown as Bindings['DB'];
  const kv = new PgKv(p) as unknown as Bindings['KV'];

  return {
    DB: db,
    KV: kv,
    FILES: createFileStore(process.env.UPLOAD_DIR ?? '/data/uploads'),

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

// Object storage cho file đính kèm. Node inject filesystem-backed (src/lib/filestore.ts);
// chỉ dùng ở runtime Node. Interface thuần type → không kéo node:fs vào bundle Workers.
export interface FileStore {
  put(bytes: Uint8Array): Promise<{ key: string; sha256: string; size: number }>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

// Cloudflare bindings + env vars. Phải khớp wrangler.toml + .dev.vars.
export type Bindings = {
  // D1 / KV
  DB: D1Database;
  KV: KVNamespace;
  FILES: FileStore;

  // Vars (public)
  APP_ENV: 'development' | 'production';
  APP_BASE_URL: string;
  ENTRA_REDIRECT_PATH: string;
  NO_REPLY_MAILBOX: string;
  // Shared mailbox nhận hóa đơn NCC (ingest đọc qua Graph Mail.Read). Trống = tắt ingest.
  INVOICE_MAILBOX: string;
  VN_TZ_OFFSET_MINUTES: string;
  // CSV email — chỉ những user trong list mới gọi được /admin/* + /api/proposals?scope=ksnb_inbox
  // + ksnb-complete. Để trống = chặn tất cả.
  ADMIN_EMAILS: string;

  // Secrets
  TENANT_ID: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  SESSION_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  KSNB_TELEGRAM_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  // Dev-only
  DEV_MOCK_USER?: string;
  DEV_MOCK_USER_EMAIL?: string;
  DEV_MOCK_USER_NAME?: string;
  DEV_MOCK_USER_DEPT?: string;
};

// Session user — snapshot lấy từ Entra ID token + cache vào users table.
export type SessionUser = {
  id: string;            // Entra GUID
  email: string;         // UPN
  name: string;
  jobTitle?: string | null;
  deptCode: string | null;
  isAdmin?: boolean;     // gán ở sessionMiddleware (tươi mỗi request từ ADMIN_EMAILS) — KHÔNG lưu cookie
};

export type Variables = {
  user: SessionUser;
};

// Hono app context type
export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

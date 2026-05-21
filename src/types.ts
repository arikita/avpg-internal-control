// Cloudflare bindings + env vars. Phải khớp wrangler.toml + .dev.vars.
export type Bindings = {
  // D1 / KV
  DB: D1Database;
  KV: KVNamespace;

  // Vars (public)
  APP_ENV: 'development' | 'production';
  APP_BASE_URL: string;
  ENTRA_REDIRECT_PATH: string;
  NO_REPLY_MAILBOX: string;
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
};

export type Variables = {
  user: SessionUser;
};

// Hono app context type
export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

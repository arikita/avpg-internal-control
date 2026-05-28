import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, SessionUser } from '../types';
import { clearSessionCookie, sessionCookieName, verifySession } from '../lib/session';
import { unauthorized } from '../lib/errors';

// Bypass: khi DEV_MOCK_USER=1 → inject mock user (chỉ chạy local).
function devMockUser(c: { env: AppEnv['Bindings'] }): SessionUser | null {
  if (c.env.APP_ENV !== 'development') return null;
  if (c.env.DEV_MOCK_USER !== '1') return null;
  return {
    id: 'dev-mock-user-id',
    email: c.env.DEV_MOCK_USER_EMAIL ?? 'dev.user@anvietenergy.com',
    name: c.env.DEV_MOCK_USER_NAME ?? 'Dev User',
    jobTitle: null,
    deptCode: c.env.DEV_MOCK_USER_DEPT ?? null,
  };
}

// Đặt user lên ctx nếu có session hợp lệ. KHÔNG throw — route quyết định có require hay không.
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const mock = devMockUser(c);
  if (mock) {
    mock.isAdmin = isAdmin(c.env, mock.email);
    c.set('user', mock);
    await next();
    return;
  }

  const token = getCookie(c, sessionCookieName());
  if (token) {
    const user = await verifySession(token, c.env.SESSION_SECRET);
    if (user) {
      // Chặn account đã bị disable trên Entra (sync xuống qua cron account-sync).
      // Cookie có hạn 7 ngày nên phải re-check DB mỗi request, không tin snapshot.
      const row = await c.env.DB.prepare(
        `SELECT account_enabled FROM users WHERE id = ?1`,
      )
        .bind(user.id)
        .first<{ account_enabled: number }>();
      if (row && row.account_enabled === 0) {
        // Disabled → xoá cookie, coi như chưa đăng nhập (requireAuth sẽ 401).
        c.header('Set-Cookie', clearSessionCookie(c.env.APP_ENV === 'production'));
      } else {
        user.isAdmin = isAdmin(c.env, user.email);
        c.set('user', user);
      }
    }
  }
  await next();
};

// Áp cho route cần đăng nhập.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized();
  await next();
};

// Áp cho route admin (sysadmin/IT qua ADMIN_EMAILS, KHÔNG phải KSNB). Đọc CSV, lowercased.
export function isAdmin(env: AppEnv['Bindings'], email: string): boolean {
  const raw = env.ADMIN_EMAILS ?? '';
  const list = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized();
  if (!isAdmin(c.env, user.email)) {
    const { forbidden } = await import('../lib/errors');
    throw forbidden('Endpoint admin — chỉ quản trị hệ thống sử dụng');
  }
  await next();
};

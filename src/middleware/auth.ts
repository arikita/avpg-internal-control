import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, SessionUser } from '../types';
import { sessionCookieName, verifySession } from '../lib/session';
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
    c.set('user', mock);
    await next();
    return;
  }

  const token = getCookie(c, sessionCookieName());
  if (token) {
    const user = await verifySession(token, c.env.SESSION_SECRET);
    if (user) c.set('user', user);
  }
  await next();
};

// Áp cho route cần đăng nhập.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized();
  await next();
};

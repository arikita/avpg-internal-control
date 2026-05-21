import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';

import type { AppEnv, SessionUser } from '../types';
import { authorizeUrl, exchangeCode, graphMe } from '../lib/entra';
import {
  buildSessionCookie,
  clearSessionCookie,
  sessionCookieName,
  signSession,
} from '../lib/session';
import { badRequest } from '../lib/errors';
import { upsertUserFromGraph } from '../lib/users';

export const authRoutes = new Hono<AppEnv>();

const OIDC_STATE_TTL_SEC = 600; // 10 phút

// GET /auth/login → redirect Entra. Lưu state+nonce vào KV để verify ở callback.
authRoutes.get('/login', async (c) => {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const returnTo = c.req.query('return_to') ?? '/';
  await c.env.KV.put(`oidc:state:${state}`, JSON.stringify({ nonce, returnTo }), {
    expirationTtl: OIDC_STATE_TTL_SEC,
  });
  return c.redirect(authorizeUrl(c.env, state, nonce));
});

// GET /auth/callback?code=&state= → exchange + set cookie + redirect.
authRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) throw badRequest('Missing code/state');

  const stateRaw = await c.env.KV.get(`oidc:state:${state}`);
  if (!stateRaw) throw badRequest('State expired or invalid');
  await c.env.KV.delete(`oidc:state:${state}`);
  const { returnTo } = JSON.parse(stateRaw) as { nonce: string; returnTo: string };

  const tokens = await exchangeCode(c.env, code);
  const me = await graphMe(tokens.access_token);

  const cached = await upsertUserFromGraph(c.env, me);

  const sessionUser: SessionUser = {
    id: cached.id,
    email: cached.email,
    name: cached.display_name,
    jobTitle: cached.job_title ?? null,
    deptCode: cached.dept_code ?? null,
  };
  const token = await signSession(sessionUser, c.env.SESSION_SECRET);
  const isProd = c.env.APP_ENV === 'production';
  setCookie(c, sessionCookieName(), '', { path: '/' }); // wipe old via raw cookie below
  c.header('Set-Cookie', buildSessionCookie(token, isProd));
  return c.redirect(returnTo || '/');
});

// POST /auth/logout
authRoutes.post('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie(c.env.APP_ENV === 'production'));
  return c.json({ ok: true });
});

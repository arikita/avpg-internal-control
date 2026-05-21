// Web routes — render HTML page. Tách khỏi /api/* để client tự fetch.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { notFound, unprocessable } from '../lib/errors';
import { landingPage, appPage, newProposalPage, proposalDetailPage } from '../web/pages';

export const webRoutes = new Hono<AppEnv>();

webRoutes.get('/', (c) => c.html(landingPage(c.get('user') ?? null)));

webRoutes.get('/app', (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login?return_to=/app');
  return c.html(appPage(user));
});

webRoutes.get('/p/new', (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login?return_to=/p/new');
  if (!user.deptCode) {
    throw unprocessable('Tài khoản chưa được gán phòng ban. Liên hệ KSNB.', 'no_department');
  }
  return c.html(newProposalPage(user));
});

webRoutes.get('/p/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect(`/auth/login?return_to=/p/${c.req.param('id')}`);
  const id = Number(c.req.param('id'));
  const proposal = await c.env.DB.prepare(`SELECT * FROM proposals WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!proposal) throw notFound('Phiếu không tồn tại');
  const items = await c.env.DB.prepare(
    `SELECT id, seq, content, note FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const approvals = await c.env.DB.prepare(
    `SELECT step, actor_email, actor_name, action, comment, source, acted_at
       FROM approvals WHERE proposal_id = ?1 ORDER BY acted_at ASC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();
  return c.html(proposalDetailPage(user, proposal, items.results ?? [], approvals.results ?? []));
});

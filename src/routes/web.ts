// Web routes — render HTML page. Tách khỏi /api/* để client tự fetch.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { forbidden, notFound, unprocessable } from '../lib/errors';
import {
  landingPage,
  appPage,
  newProposalPage,
  editProposalPage,
  proposalDetailPage,
} from '../web/pages';
import { printPage } from '../web/print';

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

webRoutes.get('/p/:id{[0-9]+}/edit', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect(`/auth/login?return_to=/p/${c.req.param('id')}/edit`);
  const id = Number(c.req.param('id'));
  const proposal = await c.env.DB.prepare(
    `SELECT id, status, proposer_user_id, title, reason, explanation, required_time
       FROM proposals WHERE id = ?1`,
  )
    .bind(id)
    .first<{
      id: number;
      status: string;
      proposer_user_id: string;
      title: string;
      reason: string;
      explanation: string | null;
      required_time: string;
    }>();
  if (!proposal) throw notFound('Phiếu không tồn tại');
  if (proposal.proposer_user_id !== user.id) throw forbidden('Bạn không phải người tạo phiếu này');
  if (!['draft', 'submitted', 'rejected'].includes(proposal.status)) {
    throw unprocessable('Phiếu không thể sửa ở trạng thái hiện tại');
  }
  const items = await c.env.DB.prepare(
    `SELECT content, note FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
  )
    .bind(id)
    .all<{ content: string; note: string | null }>();
  return c.html(
    editProposalPage(user, {
      id: proposal.id,
      title: proposal.title,
      reason: proposal.reason,
      explanation: proposal.explanation,
      required_time: proposal.required_time,
      items: items.results ?? [],
    }),
  );
});

webRoutes.get('/p/:id{[0-9]+}/print', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect(`/auth/login?return_to=/p/${c.req.param('id')}/print`);
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
  // Approvals JOIN users để lấy signature_data_url của TP/BGĐ tại thời điểm duyệt.
  const approvals = await c.env.DB.prepare(
    `SELECT a.step, a.actor_email, a.actor_name, a.action, a.acted_at,
            u.signature_data_url
       FROM approvals a
       LEFT JOIN users u ON u.email = a.actor_email
      WHERE a.proposal_id = ?1
      ORDER BY a.acted_at ASC`,
  )
    .bind(id)
    .all<{
      step: string;
      actor_email: string;
      actor_name: string;
      action: string;
      acted_at: string;
      signature_data_url: string | null;
    }>();

  // Signature của proposer
  const proposer = await c.env.DB.prepare(
    `SELECT signature_data_url FROM users WHERE id = ?1`,
  )
    .bind(proposal.proposer_user_id as string)
    .first<{ signature_data_url: string | null }>();

  return c.html(
    printPage(proposal, items.results ?? [], approvals.results ?? [], proposer?.signature_data_url ?? null),
  );
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

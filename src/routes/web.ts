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

webRoutes.get('/app', async (c) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login?return_to=/app');
  const email = user.email.toLowerCase();
  const [mgrRow, bodRow, enRow, icRow, pendMgr, pendBod, pendEn, pendIc] = await Promise.all([
    c.env.DB.prepare(
      `SELECT 1 FROM department_managers WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`,
    )
      .bind(email)
      .first(),
    c.env.DB.prepare(`SELECT 1 FROM bod_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`)
      .bind(email)
      .first(),
    c.env.DB.prepare(
      `SELECT 1 FROM engineering_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`,
    )
      .bind(email)
      .first(),
    c.env.DB.prepare(`SELECT 1 FROM ic_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`)
      .bind(email)
      .first(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals WHERE LOWER(manager_email) = ?1 AND status = 'submitted'`,
    )
      .bind(email)
      .first<{ n: number }>(),
    // BOD inbox count: general (manager_approved) + PR (ic_approved).
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(bod_email) = ?1
          AND (
            (proposal_type = 'general' AND status = 'manager_approved')
            OR (proposal_type = 'purchase' AND status = 'ic_approved')
          )`,
    )
      .bind(email)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(engineering_email) = ?1
          AND proposal_type = 'purchase'
          AND engineering_required = 1
          AND status = 'manager_approved'`,
    )
      .bind(email)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(ic_email) = ?1
          AND proposal_type = 'purchase'
          AND (
            (engineering_required = 0 AND status = 'manager_approved')
            OR (engineering_required = 1 AND status = 'en_approved')
          )`,
    )
      .bind(email)
      .first<{ n: number }>(),
  ]);
  const pendingManager = pendMgr?.n ?? 0;
  const pendingBod = pendBod?.n ?? 0;
  const pendingEngineering = pendEn?.n ?? 0;
  const pendingIc = pendIc?.n ?? 0;
  return c.html(
    appPage(user, {
      isManager: !!mgrRow || pendingManager > 0,
      isBod: !!bodRow || pendingBod > 0,
      isEngineering: !!enRow || pendingEngineering > 0,
      isIc: !!icRow || pendingIc > 0,
      pendingManager,
      pendingBod,
      pendingEngineering,
      pendingIc,
    }),
  );
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
    `SELECT id, status, proposal_type, proposer_user_id, title, reason, explanation, required_time,
            engineering_required, delivery_date, suggested_vendor_1, suggested_vendor_2, suggested_vendor_3
       FROM proposals WHERE id = ?1`,
  )
    .bind(id)
    .first<{
      id: number;
      status: string;
      proposal_type: 'general' | 'purchase';
      proposer_user_id: string;
      title: string;
      reason: string;
      explanation: string | null;
      required_time: string;
      engineering_required: number;
      delivery_date: string | null;
      suggested_vendor_1: string | null;
      suggested_vendor_2: string | null;
      suggested_vendor_3: string | null;
    }>();
  if (!proposal) throw notFound('Phiếu không tồn tại');
  if (proposal.proposer_user_id !== user.id) throw forbidden('Bạn không phải người tạo phiếu này');
  if (!['draft', 'submitted', 'rejected'].includes(proposal.status)) {
    throw unprocessable('Phiếu không thể sửa ở trạng thái hiện tại');
  }
  if (proposal.proposal_type === 'purchase') {
    const items = await c.env.DB.prepare(
      `SELECT item_name, spec, unit, qty_stock, qty_buy, unit_price, purpose
         FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
    )
      .bind(id)
      .all<{
        item_name: string | null;
        spec: string | null;
        unit: string | null;
        qty_stock: number | null;
        qty_buy: number | null;
        unit_price: number | null;
        purpose: string | null;
      }>();
    return c.html(
      editProposalPage(user, {
        id: proposal.id,
        proposal_type: 'purchase',
        title: proposal.title,
        reason: proposal.reason,
        explanation: proposal.explanation,
        engineering_required: proposal.engineering_required,
        delivery_date: proposal.delivery_date,
        suggested_vendor_1: proposal.suggested_vendor_1,
        suggested_vendor_2: proposal.suggested_vendor_2,
        suggested_vendor_3: proposal.suggested_vendor_3,
        items: items.results ?? [],
      }),
    );
  }
  const items = await c.env.DB.prepare(
    `SELECT content, note FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
  )
    .bind(id)
    .all<{ content: string; note: string | null }>();
  return c.html(
    editProposalPage(user, {
      id: proposal.id,
      proposal_type: 'general',
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
    `SELECT id, seq, content, note,
            item_name, spec, unit, qty_stock, qty_buy, unit_price, line_total, purpose
       FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
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
    `SELECT id, seq, content, note,
            item_name, spec, unit, qty_stock, qty_buy, unit_price, line_total, purpose
       FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
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

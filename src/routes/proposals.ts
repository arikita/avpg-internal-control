// Proposal routes — Phase 1 core.
// State machine: draft → submitted → manager_approved → bod_approved → completed
//                 \-----------------> rejected (terminal)

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors';
import { nextProposalCode } from '../lib/codes';
import { getActiveBod, getDeptManager } from '../lib/routing';
import { enqueueNotification } from '../lib/notifications';
import { nowIso } from '../lib/time';

export const proposalRoutes = new Hono<AppEnv>();
proposalRoutes.use('*', requireAuth);

// ---- types ----
type ProposalRow = {
  id: number;
  code: string | null;
  status: string;
  proposer_user_id: string;
  proposer_name: string;
  proposer_title: string | null;
  proposer_dept: string;
  title: string;
  reason: string;
  explanation: string | null;
  required_time: string;
  manager_email: string | null;
  manager_name: string | null;
  bod_email: string | null;
  bod_name: string | null;
  rejected_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  manager_acted_at: string | null;
  bod_acted_at: string | null;
  completed_at: string | null;
};

type ItemInput = { seq: number; content: string; note?: string | null };

// ---- helpers ----
async function loadProposal(c: { env: AppEnv['Bindings'] }, id: number): Promise<ProposalRow> {
  const row = await c.env.DB.prepare(`SELECT * FROM proposals WHERE id = ?1`)
    .bind(id)
    .first<ProposalRow>();
  if (!row) throw notFound('Phiếu không tồn tại');
  return row;
}

async function loadItems(env: AppEnv['Bindings'], proposalId: number) {
  const res = await env.DB.prepare(
    `SELECT id, seq, content, note FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
  )
    .bind(proposalId)
    .all<{ id: number; seq: number; content: string; note: string | null }>();
  return res.results ?? [];
}

async function replaceItems(env: AppEnv['Bindings'], proposalId: number, items: ItemInput[]) {
  const stmts = [
    env.DB.prepare(`DELETE FROM proposal_items WHERE proposal_id = ?1`).bind(proposalId),
    ...items.map((it) =>
      env.DB.prepare(
        `INSERT INTO proposal_items (proposal_id, seq, content, note) VALUES (?1, ?2, ?3, ?4)`,
      ).bind(proposalId, it.seq, it.content, it.note ?? null),
    ),
  ];
  await env.DB.batch(stmts);
}

function assertOwner(row: ProposalRow, userId: string) {
  if (row.proposer_user_id !== userId) throw forbidden('Bạn không phải người tạo phiếu này');
}

// ---- POST /api/proposals → create draft ----
proposalRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (!user.deptCode) {
    throw unprocessable(
      'Tài khoản của bạn chưa được gán phòng ban. Liên hệ KSNB.',
      'no_department',
    );
  }
  const body = await c.req.json<{
    title?: string;
    reason?: string;
    explanation?: string | null;
    required_time?: string;
    items?: ItemInput[];
  }>();

  const title = (body.title ?? '').trim();
  const reason = (body.reason ?? '').trim();
  const required_time = (body.required_time ?? '').trim();
  if (!title) throw badRequest('Thiếu Nội dung đề xuất');
  if (!reason) throw badRequest('Thiếu Lý do đề nghị');
  if (!required_time) throw badRequest('Thiếu Thời gian cần thực hiện');

  const res = await c.env.DB.prepare(
    `INSERT INTO proposals
       (status, proposer_user_id, proposer_name, proposer_title, proposer_dept,
        title, reason, explanation, required_time)
     VALUES ('draft', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      user.id,
      user.name,
      user.jobTitle ?? null,
      user.deptCode,
      title,
      reason,
      body.explanation ?? null,
      required_time,
    )
    .run();
  const proposalId = Number(res.meta.last_row_id);
  if (body.items?.length) await replaceItems(c.env, proposalId, body.items);

  const row = await loadProposal(c, proposalId);
  return c.json({ proposal: row, items: await loadItems(c.env, proposalId) }, 201);
});

// ---- GET /api/proposals → list (mine + inbox) ----
proposalRoutes.get('/', async (c) => {
  const user = c.get('user');
  const scope = c.req.query('scope') ?? 'mine'; // mine | manager_inbox | bod_inbox | ksnb_inbox
  let sql = '';
  let bind: unknown[] = [];
  switch (scope) {
    case 'mine':
      sql = `SELECT * FROM proposals WHERE proposer_user_id = ?1 ORDER BY created_at DESC LIMIT 100`;
      bind = [user.id];
      break;
    case 'manager_inbox':
      sql = `SELECT * FROM proposals WHERE manager_email = ?1 AND status = 'submitted' ORDER BY submitted_at ASC`;
      bind = [user.email];
      break;
    case 'bod_inbox':
      sql = `SELECT * FROM proposals WHERE bod_email = ?1 AND status = 'manager_approved' ORDER BY manager_acted_at ASC`;
      bind = [user.email];
      break;
    case 'ksnb_inbox':
      sql = `SELECT * FROM proposals WHERE status = 'bod_approved' ORDER BY bod_acted_at ASC`;
      break;
    default:
      throw badRequest('scope không hợp lệ');
  }
  const res = await c.env.DB.prepare(sql)
    .bind(...bind)
    .all<ProposalRow>();
  return c.json({ proposals: res.results ?? [] });
});

// ---- GET /api/proposals/:id ----
proposalRoutes.get('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await loadProposal(c, id);
  const items = await loadItems(c.env, id);
  const approvals = await c.env.DB.prepare(
    `SELECT step, actor_email, actor_name, action, comment, source, acted_at
       FROM approvals WHERE proposal_id = ?1 ORDER BY acted_at ASC`,
  )
    .bind(id)
    .all();
  return c.json({ proposal: row, items, approvals: approvals.results ?? [] });
});

// ---- PATCH /api/proposals/:id → edit draft ----
proposalRoutes.patch('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = await loadProposal(c, id);
  assertOwner(row, user.id);
  if (row.status !== 'draft') throw unprocessable('Chỉ sửa được khi phiếu ở trạng thái draft');

  const body = await c.req.json<{
    title?: string;
    reason?: string;
    explanation?: string | null;
    required_time?: string;
    items?: ItemInput[];
  }>();

  await c.env.DB.prepare(
    `UPDATE proposals
        SET title = COALESCE(?2, title),
            reason = COALESCE(?3, reason),
            explanation = COALESCE(?4, explanation),
            required_time = COALESCE(?5, required_time),
            updated_at = datetime('now')
      WHERE id = ?1`,
  )
    .bind(
      id,
      body.title ?? null,
      body.reason ?? null,
      body.explanation ?? null,
      body.required_time ?? null,
    )
    .run();
  if (body.items) await replaceItems(c.env, id, body.items);

  return c.json({ proposal: await loadProposal(c, id), items: await loadItems(c.env, id) });
});

// ---- DELETE /api/proposals/:id (only draft) ----
proposalRoutes.delete('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = await loadProposal(c, id);
  assertOwner(row, user.id);
  if (row.status !== 'draft') throw unprocessable('Chỉ xoá được khi phiếu ở trạng thái draft');
  await c.env.DB.prepare(`DELETE FROM proposals WHERE id = ?1`).bind(id).run();
  return c.json({ ok: true });
});

// ---- POST /api/proposals/:id/submit ----
proposalRoutes.post('/:id{[0-9]+}/submit', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = await loadProposal(c, id);
  assertOwner(row, user.id);
  if (row.status !== 'draft') throw unprocessable('Phiếu đã submit');

  const manager = await getDeptManager(c.env, row.proposer_dept);
  const bod = await getActiveBod(c.env);
  const code = await nextProposalCode(c.env.DB, row.proposer_dept);
  const submittedAt = nowIso();

  // Edge case 6.1: proposer là Manager phòng mình → auto-approve bước Manager.
  const proposerIsManager = user.email.toLowerCase() === manager.email.toLowerCase();

  if (proposerIsManager) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE proposals
            SET code = ?2, status = 'manager_approved',
                manager_email = ?3, manager_name = ?4,
                bod_email = ?5, bod_name = ?6,
                submitted_at = ?7, manager_acted_at = ?7,
                updated_at = ?7
          WHERE id = ?1`,
      ).bind(
        id,
        code,
        manager.email,
        manager.name,
        bod.email,
        bod.name,
        submittedAt,
      ),
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'manager', ?2, ?3, 'approve', 'Tự duyệt do là Trưởng phòng', 'web')`,
      ).bind(id, manager.email, manager.name),
    ]);
    await enqueueNotification(c.env, {
      proposalId: id,
      channel: 'email',
      event: 'manager_approved',
      recipient: bod.email,
    });
  } else {
    await c.env.DB.prepare(
      `UPDATE proposals
          SET code = ?2, status = 'submitted',
              manager_email = ?3, manager_name = ?4,
              bod_email = ?5, bod_name = ?6,
              submitted_at = ?7, updated_at = ?7
        WHERE id = ?1`,
    )
      .bind(id, code, manager.email, manager.name, bod.email, bod.name, submittedAt)
      .run();
    await enqueueNotification(c.env, {
      proposalId: id,
      channel: 'email',
      event: 'submitted',
      recipient: manager.email,
    });
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// ---- POST /api/proposals/:id/manager-action ----
proposalRoutes.post('/:id{[0-9]+}/manager-action', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  const row = await loadProposal(c, id);

  if (row.status !== 'submitted') throw unprocessable('Phiếu không ở trạng thái chờ TP duyệt');
  if (!row.manager_email || row.manager_email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden('Bạn không phải Trưởng phòng phụ trách phiếu này');
  }
  if (body.action !== 'approve' && body.action !== 'reject') throw badRequest('action không hợp lệ');
  if (body.action === 'reject' && !body.comment?.trim()) throw badRequest('Cần ghi lý do từ chối');

  const now = nowIso();
  const newStatus = body.action === 'approve' ? 'manager_approved' : 'rejected';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals
          SET status = ?2, manager_acted_at = ?3,
              rejected_reason = CASE WHEN ?2 = 'rejected' THEN ?4 ELSE rejected_reason END,
              updated_at = ?3
        WHERE id = ?1`,
    ).bind(id, newStatus, now, body.comment ?? null),
    c.env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, 'manager', ?2, ?3, ?4, ?5, 'web')`,
    ).bind(id, user.email, user.name, body.action, body.comment ?? null),
  ]);

  if (body.action === 'approve' && row.bod_email) {
    // TODO Edge 6.2: nếu proposer == BOD email → auto-approve bước BOD luôn.
    await enqueueNotification(c.env, {
      proposalId: id,
      channel: 'email',
      event: 'manager_approved',
      recipient: row.bod_email,
    });
  } else if (body.action === 'reject') {
    // Notify proposer
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    if (proposer) {
      await enqueueNotification(c.env, {
        proposalId: id,
        channel: 'email',
        event: 'rejected',
        recipient: proposer.email,
      });
    }
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// ---- POST /api/proposals/:id/bod-action ----
proposalRoutes.post('/:id{[0-9]+}/bod-action', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  const row = await loadProposal(c, id);

  if (row.status !== 'manager_approved')
    throw unprocessable('Phiếu không ở trạng thái chờ BGĐ duyệt');
  if (!row.bod_email || row.bod_email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden('Bạn không phải BGĐ phụ trách phiếu này');
  }
  if (body.action !== 'approve' && body.action !== 'reject') throw badRequest('action không hợp lệ');
  if (body.action === 'reject' && !body.comment?.trim()) throw badRequest('Cần ghi lý do từ chối');

  const now = nowIso();
  const newStatus = body.action === 'approve' ? 'bod_approved' : 'rejected';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals
          SET status = ?2, bod_acted_at = ?3,
              rejected_reason = CASE WHEN ?2 = 'rejected' THEN ?4 ELSE rejected_reason END,
              updated_at = ?3
        WHERE id = ?1`,
    ).bind(id, newStatus, now, body.comment ?? null),
    c.env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, 'bod', ?2, ?3, ?4, ?5, 'web')`,
    ).bind(id, user.email, user.name, body.action, body.comment ?? null),
  ]);

  if (body.action === 'approve') {
    // Notify KSNB group (telegram) + KSNB emails (TODO env)
    if (c.env.KSNB_TELEGRAM_CHAT_ID) {
      await enqueueNotification(c.env, {
        proposalId: id,
        channel: 'telegram',
        event: 'bod_approved',
        recipient: c.env.KSNB_TELEGRAM_CHAT_ID,
      });
    }
  } else {
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    if (proposer) {
      await enqueueNotification(c.env, {
        proposalId: id,
        channel: 'email',
        event: 'rejected',
        recipient: proposer.email,
      });
    }
    if (row.manager_email) {
      await enqueueNotification(c.env, {
        proposalId: id,
        channel: 'email',
        event: 'rejected',
        recipient: row.manager_email,
      });
    }
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// ---- POST /api/proposals/:id/ksnb-complete ----
// Phase 1: bất kỳ user nào có role 'ksnb' (kiểm bằng env list, TODO chuyển sang bảng riêng).
proposalRoutes.post('/:id{[0-9]+}/ksnb-complete', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ comment?: string }>().catch(() => ({} as { comment?: string }));
  const row = await loadProposal(c, id);
  if (row.status !== 'bod_approved') throw unprocessable('Phiếu chưa được BGĐ duyệt');

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals SET status = 'completed', completed_at = ?2, updated_at = ?2 WHERE id = ?1`,
    ).bind(id, now),
    c.env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, 'ksnb', ?2, ?3, 'approve', ?4, 'web')`,
    ).bind(id, user.email, user.name, body.comment ?? null),
  ]);

  const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(row.proposer_user_id)
    .first<{ email: string }>();
  if (proposer) {
    await enqueueNotification(c.env, {
      proposalId: id,
      channel: 'email',
      event: 'completed',
      recipient: proposer.email,
    });
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// Proposal routes — Phase 1 core.
// State machine: draft → submitted → manager_approved → bod_approved → completed
//                 \-----------------> rejected (terminal)

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors';
import { nextProposalCode } from '../lib/codes';
import { getActiveBod, getDeptManager } from '../lib/routing';
import { enqueueNotification, type NotificationEvent } from '../lib/notifications';
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

// Validate DD/MM/YYYY chuẩn (đúng số ngày trong tháng, năm 1900-2100).
function isValidDdMmYyyy(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

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

// Enqueue email + telegram DM cho cùng 1 recipient email.
// Telegram dispatcher tự skip nếu user chưa link.
async function notifyApprover(
  env: AppEnv['Bindings'],
  proposalId: number,
  event: NotificationEvent,
  email: string,
): Promise<void> {
  await enqueueNotification(env, { proposalId, channel: 'email', event, recipient: email });
  await enqueueNotification(env, { proposalId, channel: 'telegram', event, recipient: email });
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
  if (required_time && !isValidDdMmYyyy(required_time)) {
    throw badRequest('Thời gian cần thực hiện phải đúng định dạng DD/MM/YYYY');
  }

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
  const scope = c.req.query('scope') ?? 'mine'; // mine | manager_inbox | bod_inbox
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

// ---- PATCH /api/proposals/:id → edit draft / chưa-phê-duyệt / bị từ chối ----
// Cho phép: draft (đang nháp), submitted (chưa có ai duyệt), rejected (bị TP/BGĐ từ chối).
// Khi sửa từ submitted/rejected: revert về draft, giữ code cũ, clear rejected_reason +
// timestamps duyệt cũ. User cần bấm "Gửi duyệt" lần nữa để re-submit (xem endpoint submit).
proposalRoutes.patch('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = await loadProposal(c, id);
  assertOwner(row, user.id);
  const editable = ['draft', 'submitted', 'rejected'];
  if (!editable.includes(row.status)) {
    throw unprocessable('Phiếu không thể sửa ở trạng thái hiện tại');
  }

  const body = await c.req.json<{
    title?: string;
    reason?: string;
    explanation?: string | null;
    required_time?: string;
    items?: ItemInput[];
  }>();

  if (body.required_time && body.required_time.trim() && !isValidDdMmYyyy(body.required_time.trim())) {
    throw badRequest('Thời gian cần thực hiện phải đúng định dạng DD/MM/YYYY');
  }

  await c.env.DB.prepare(
    `UPDATE proposals
        SET title = COALESCE(?2, title),
            reason = COALESCE(?3, reason),
            explanation = COALESCE(?4, explanation),
            required_time = COALESCE(?5, required_time),
            status = CASE WHEN status IN ('submitted','rejected') THEN 'draft' ELSE status END,
            rejected_reason = NULL,
            manager_acted_at = NULL,
            bod_acted_at = NULL,
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

// ---- POST /api/proposals/:id/cancel → proposer tự huỷ phiếu ----
// Cho phép khi phiếu chưa có phê duyệt: draft hoặc submitted.
// manager_approved/completed/rejected/cancelled đều không huỷ được nữa.
proposalRoutes.post('/:id{[0-9]+}/cancel', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const row = await loadProposal(c, id);
  assertOwner(row, user.id);
  const cancellable = ['draft', 'submitted'];
  if (!cancellable.includes(row.status)) {
    throw unprocessable('Chỉ huỷ được khi phiếu chưa có phê duyệt');
  }
  await c.env.DB.prepare(
    `UPDATE proposals SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?1`,
  )
    .bind(id)
    .run();
  return c.json({ proposal: await loadProposal(c, id) });
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
  // Re-submit sau khi sửa (PATCH revert về draft): giữ nguyên code đã sinh trước đó.
  // Chỉ sinh code mới khi đây là lần submit đầu tiên (code === null).
  const code = row.code ?? (await nextProposalCode(c.env.DB, row.proposer_dept));
  const submittedAt = nowIso();

  // Edge case 6.1: proposer là Manager phòng mình → auto-approve bước Manager.
  // Edge case 6.2: proposer là BOD → auto-approve bước BOD.
  // Cả 2 trùng (TP+BOD cùng người, là proposer): chuyển thẳng status='completed'.
  const proposerIsManager = user.email.toLowerCase() === manager.email.toLowerCase();
  const proposerIsBod = user.email.toLowerCase() === bod.email.toLowerCase();

  const stmts: D1PreparedStatement[] = [];
  let finalStatus: 'submitted' | 'manager_approved' | 'completed' = 'submitted';
  const setFields = [
    `code = ?2`,
    `status = ?3`,
    `manager_email = ?4`,
    `manager_name = ?5`,
    `bod_email = ?6`,
    `bod_name = ?7`,
    `submitted_at = ?8`,
    `updated_at = ?8`,
  ];

  if (proposerIsManager) {
    finalStatus = 'manager_approved';
    setFields.push(`manager_acted_at = ?8`);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'manager', ?2, ?3, 'approve', 'Tự duyệt do là Trưởng phòng', 'web')`,
      ).bind(id, manager.email, manager.name),
    );
  }
  if (proposerIsBod) {
    finalStatus = 'completed';
    setFields.push(`bod_acted_at = ?8`, `completed_at = ?8`);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'web')`,
      ).bind(id, bod.email, bod.name),
    );
  }

  stmts.unshift(
    c.env.DB.prepare(
      `UPDATE proposals SET ${setFields.join(', ')} WHERE id = ?1`,
    ).bind(
      id,
      code,
      finalStatus,
      manager.email,
      manager.name,
      bod.email,
      bod.name,
      submittedAt,
    ),
  );
  await c.env.DB.batch(stmts);

  // Notify bước kế tiếp tuỳ status cuối.
  if (finalStatus === 'submitted') {
    await notifyApprover(c.env, id, 'submitted', manager.email);
  } else if (finalStatus === 'manager_approved') {
    await notifyApprover(c.env, id, 'manager_approved', bod.email);
  } else {
    // completed → notify proposer + KSNB group (informational)
    await notifyApprover(c.env, id, 'completed', user.email);
    if (c.env.KSNB_TELEGRAM_CHAT_ID) {
      await enqueueNotification(c.env, {
        proposalId: id,
        channel: 'telegram',
        event: 'bod_approved',
        recipient: c.env.KSNB_TELEGRAM_CHAT_ID,
      });
    }
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
    // Edge 6.2: nếu proposer chính là BOD → auto-approve bước BOD luôn (completed).
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    const proposerIsBod =
      proposer?.email && proposer.email.toLowerCase() === row.bod_email.toLowerCase();

    if (proposerIsBod) {
      const completedAt = nowIso();
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE proposals SET status = 'completed', bod_acted_at = ?2, completed_at = ?2, updated_at = ?2 WHERE id = ?1`,
        ).bind(id, completedAt),
        c.env.DB.prepare(
          `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
           VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'web')`,
        ).bind(id, row.bod_email, row.bod_name),
      ]);
      if (proposer) await notifyApprover(c.env, id, 'completed', proposer.email);
      if (c.env.KSNB_TELEGRAM_CHAT_ID) {
        await enqueueNotification(c.env, {
          proposalId: id,
          channel: 'telegram',
          event: 'bod_approved',
          recipient: c.env.KSNB_TELEGRAM_CHAT_ID,
        });
      }
    } else {
      await notifyApprover(c.env, id, 'manager_approved', row.bod_email);
    }
  } else if (body.action === 'reject') {
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    if (proposer) await notifyApprover(c.env, id, 'rejected', proposer.email);
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
  // BOD approve = final → status='completed', set bod_acted_at + completed_at.
  const newStatus = body.action === 'approve' ? 'completed' : 'rejected';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals
          SET status = ?2, bod_acted_at = ?3,
              completed_at = CASE WHEN ?2 = 'completed' THEN ?3 ELSE completed_at END,
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
    // Notify proposer (completed) + KSNB group (informational)
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    if (proposer) await notifyApprover(c.env, id, 'completed', proposer.email);
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
    if (proposer) await notifyApprover(c.env, id, 'rejected', proposer.email);
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

// /ksnb-complete endpoint đã xoá — KSNB không còn vai trò trong workflow.
// Phiếu hoàn thành tự động khi BOD duyệt (xem bod-action endpoint trên).

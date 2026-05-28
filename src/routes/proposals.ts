// Proposal routes — Phase 1 + P2.1 (purchase).
// General: draft → submitted → manager_approved → completed (BOD duyệt)
// Purchase: draft → submitted → manager_approved → (en_approved nếu cần EN)
//                  → ic_approved → completed (BOD duyệt)
//                  rejected/cancelled — terminal.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors';
import { nextProposalCode } from '../lib/codes';
import { getActiveBod, getActiveEngineering, getActiveIc, getDeptManager, isKsnbUser } from '../lib/routing';
import { enqueueNotification, type NotificationEvent } from '../lib/notifications';
import { calcPrTotals, lineTotal, DEFAULT_VAT_RATE, ALLOWED_VAT_RATES } from '../lib/pr-math';
import { nowIso } from '../lib/time';
import { logAudit, webAuditContext, logAutoSkips, type AutoSkipItem } from '../lib/audit';

export const proposalRoutes = new Hono<AppEnv>();
proposalRoutes.use('*', requireAuth);

// ---- types ----
type ProposalRow = {
  id: number;
  code: string | null;
  status: string;
  proposal_type: 'general' | 'purchase';
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
  engineering_required: number;
  engineering_email: string | null;
  engineering_name: string | null;
  engineering_acted_at: string | null;
  ic_email: string | null;
  ic_name: string | null;
  ic_acted_at: string | null;
  delivery_date: string | null;
  suggested_vendor_1: string | null;
  suggested_vendor_2: string | null;
  suggested_vendor_3: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  vat_rate: number;
  rejected_reason: string | null;
  created_at: string;
  submitted_at: string | null;
  manager_acted_at: string | null;
  bod_acted_at: string | null;
  completed_at: string | null;
};

type ItemInput = {
  seq: number;
  content?: string;
  note?: string | null;
  // PR-specific (optional)
  item_name?: string | null;
  spec?: string | null;
  unit?: string | null;
  qty_stock?: number | null;
  qty_buy?: number | null;
  unit_price?: number | null;
  purpose?: string | null;
};

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
    `SELECT id, seq, content, note,
            item_name, spec, unit, qty_stock, qty_buy, unit_price, line_total, purpose
       FROM proposal_items WHERE proposal_id = ?1 ORDER BY seq ASC`,
  )
    .bind(proposalId)
    .all<{
      id: number;
      seq: number;
      content: string | null;
      note: string | null;
      item_name: string | null;
      spec: string | null;
      unit: string | null;
      qty_stock: number | null;
      qty_buy: number | null;
      unit_price: number | null;
      line_total: number | null;
      purpose: string | null;
    }>();
  return res.results ?? [];
}

// Branch theo proposal_type: PR lưu cột mua hàng + line_total snapshot, general lưu
// content/note kiểu Phase 1.
async function replaceItems(
  env: AppEnv['Bindings'],
  proposalId: number,
  items: ItemInput[],
  proposalType: 'general' | 'purchase',
) {
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM proposal_items WHERE proposal_id = ?1`).bind(proposalId),
  ];
  if (proposalType === 'purchase') {
    for (const it of items) {
      const qtyStock = it.qty_stock ?? null;
      const qtyBuy = it.qty_buy ?? null;
      const unitPrice = it.unit_price ?? null;
      const total =
        qtyBuy != null && unitPrice != null ? lineTotal({ qty_buy: qtyBuy, unit_price: unitPrice }) : null;
      // content NOT NULL ở schema cũ → mirror item_name vào content để không vỡ constraint
      // và phiếu cũ-style reader vẫn thấy tên hàng nếu có ai query trực tiếp.
      const contentMirror = (it.item_name ?? '').trim();
      stmts.push(
        env.DB.prepare(
          `INSERT INTO proposal_items
             (proposal_id, seq, content, note,
              item_name, spec, unit, qty_stock, qty_buy, unit_price, line_total, purpose)
           VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        ).bind(
          proposalId,            // ?1 proposal_id
          it.seq,                // ?2 seq
          contentMirror,         // ?3 content
          it.item_name ?? null,  // ?4 item_name
          it.spec ?? null,       // ?5 spec
          it.unit ?? null,       // ?6 unit
          qtyStock,              // ?7 qty_stock
          qtyBuy,                // ?8 qty_buy
          unitPrice,             // ?9 unit_price
          total,                 // ?10 line_total
          it.purpose ?? null,    // ?11 purpose
        ),
      );
    }
  } else {
    for (const it of items) {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO proposal_items (proposal_id, seq, content, note) VALUES (?1, ?2, ?3, ?4)`,
        ).bind(proposalId, it.seq, it.content ?? '', it.note ?? null),
      );
    }
  }
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

// Validate items theo proposal_type. Trả về totals (PR) hoặc null (general).
function validateAndCalcPr(
  items: ItemInput[],
  vatRate: number,
): { subtotal: number; vat: number; total: number } {
  if (!ALLOWED_VAT_RATES.includes(vatRate)) throw badRequest('VAT chỉ được 0%, 8% hoặc 10%');
  if (!items.length) throw badRequest('Phiếu mua hàng phải có ít nhất 1 hạng mục');
  for (const it of items) {
    if (!it.item_name || !it.item_name.trim()) {
      throw badRequest('Mỗi hạng mục phải có Tên hàng');
    }
    const q = Number(it.qty_buy ?? 0);
    const p = Number(it.unit_price ?? 0);
    if (!Number.isFinite(q) || q <= 0) {
      throw badRequest(`Số lượng mua phải > 0 (hạng mục "${it.item_name}")`);
    }
    if (!Number.isFinite(p) || p <= 0) {
      throw badRequest(`Đơn giá phải > 0 (hạng mục "${it.item_name}")`);
    }
  }
  return calcPrTotals(
    items.map((it) => ({ qty_buy: it.qty_buy, unit_price: it.unit_price })),
    vatRate,
  );
}

// ---- POST /api/proposals → create draft ----
proposalRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (!user.deptCode) {
    throw unprocessable(
      'Tài khoản của bạn chưa được gán phòng ban. Liên hệ quản trị hệ thống.',
      'no_department',
    );
  }
  const body = await c.req.json<{
    proposal_type?: 'general' | 'purchase';
    title?: string;
    reason?: string;
    explanation?: string | null;
    required_time?: string;
    items?: ItemInput[];
    // PR-specific
    engineering_required?: boolean | number;
    delivery_date?: string | null;
    suggested_vendor_1?: string | null;
    suggested_vendor_2?: string | null;
    suggested_vendor_3?: string | null;
    vat_rate?: number;
  }>();

  const proposalType: 'general' | 'purchase' = body.proposal_type === 'purchase' ? 'purchase' : 'general';
  const title = (body.title ?? '').trim();
  const reason = (body.reason ?? '').trim();
  const required_time = (body.required_time ?? '').trim();
  if (!title) throw badRequest('Thiếu Nội dung đề xuất');
  if (!reason) throw badRequest('Thiếu Lý do đề nghị');
  if (proposalType === 'general' && required_time && !isValidDdMmYyyy(required_time)) {
    throw badRequest('Thời gian cần thực hiện phải đúng định dạng DD/MM/YYYY');
  }

  let subtotal: number | null = null;
  let vat: number | null = null;
  let total: number | null = null;
  let vatRate = DEFAULT_VAT_RATE;
  let deliveryDate: string | null = null;
  let engineeringRequired = 0;

  if (proposalType === 'purchase') {
    deliveryDate = (body.delivery_date ?? '').trim() || null;
    if (deliveryDate && !isValidDdMmYyyy(deliveryDate)) {
      throw badRequest('Ngày cần giao phải đúng định dạng DD/MM/YYYY');
    }
    engineeringRequired = body.engineering_required ? 1 : 0;
    vatRate = body.vat_rate != null ? Number(body.vat_rate) : DEFAULT_VAT_RATE;
    const items = body.items ?? [];
    const totals = validateAndCalcPr(items, vatRate);
    subtotal = totals.subtotal;
    vat = totals.vat;
    total = totals.total;
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO proposals
       (status, proposal_type, proposer_user_id, proposer_name, proposer_title, proposer_dept,
        title, reason, explanation, required_time,
        engineering_required, delivery_date,
        suggested_vendor_1, suggested_vendor_2, suggested_vendor_3,
        subtotal, vat_amount, total_amount, vat_rate)
     VALUES ('draft', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
  )
    .bind(
      proposalType,
      user.id,
      user.name,
      user.jobTitle ?? null,
      user.deptCode,
      title,
      reason,
      body.explanation ?? null,
      required_time,
      engineeringRequired,
      deliveryDate,
      proposalType === 'purchase' ? (body.suggested_vendor_1 ?? null) : null,
      proposalType === 'purchase' ? (body.suggested_vendor_2 ?? null) : null,
      proposalType === 'purchase' ? (body.suggested_vendor_3 ?? null) : null,
      subtotal,
      vat,
      total,
      vatRate,
    )
    .run();
  const proposalId = Number(res.meta.last_row_id);
  if (body.items?.length) await replaceItems(c.env, proposalId, body.items, proposalType);

  const row = await loadProposal(c, proposalId);
  return c.json({ proposal: row, items: await loadItems(c.env, proposalId) }, 201);
});

// ---- GET /api/proposals → list (mine + inbox) ----
proposalRoutes.get('/', async (c) => {
  const user = c.get('user');
  const scope = c.req.query('scope') ?? 'mine'; // mine | manager_inbox | bod_inbox | engineering_inbox | ic_inbox
  const emailLower = user.email.toLowerCase();
  let sql = '';
  let bind: unknown[] = [];
  switch (scope) {
    case 'mine':
      sql = `SELECT * FROM proposals WHERE proposer_user_id = ?1 ORDER BY created_at DESC LIMIT 100`;
      bind = [user.id];
      break;
    case 'manager_inbox':
      // PR: chỉ hiện ở manager_inbox khi chờ TP (status='submitted').
      sql = `SELECT * FROM proposals WHERE LOWER(manager_email) = ?1 AND status = 'submitted' ORDER BY submitted_at ASC`;
      bind = [emailLower];
      break;
    case 'bod_inbox':
      // General: BOD nhận sau manager_approved. PR: BOD nhận sau ic_approved.
      sql = `SELECT * FROM proposals
              WHERE LOWER(bod_email) = ?1
                AND (
                  (proposal_type = 'general' AND status = 'manager_approved')
                  OR (proposal_type = 'purchase' AND status = 'ic_approved')
                )
              ORDER BY updated_at ASC`;
      bind = [emailLower];
      break;
    case 'engineering_inbox':
      // PR có engineering_required: EN duyệt ngay sau Manager.
      sql = `SELECT * FROM proposals
              WHERE LOWER(engineering_email) = ?1
                AND proposal_type = 'purchase'
                AND engineering_required = 1
                AND status = 'manager_approved'
              ORDER BY manager_acted_at ASC`;
      bind = [emailLower];
      break;
    case 'ic_inbox':
      // PR: IC nhận sau Manager (nếu không cần EN) hoặc sau EN.
      sql = `SELECT * FROM proposals
              WHERE LOWER(ic_email) = ?1
                AND proposal_type = 'purchase'
                AND (
                  (engineering_required = 0 AND status = 'manager_approved')
                  OR (engineering_required = 1 AND status = 'en_approved')
                )
              ORDER BY updated_at ASC`;
      bind = [emailLower];
      break;
    case 'approve_inbox':
      // Gộp mọi vai trò: phiếu đang chờ CHÍNH user duyệt ở bất kỳ bước nào (TP/EN/IC/BGĐ).
      // Mỗi phiếu chỉ chờ ở 1 bước nên không trùng dòng.
      sql = `SELECT * FROM proposals
              WHERE (
                (LOWER(manager_email) = ?1 AND status = 'submitted')
                OR (LOWER(bod_email) = ?1 AND (
                     (proposal_type = 'general' AND status = 'manager_approved')
                     OR (proposal_type = 'purchase' AND status = 'ic_approved')
                   ))
                OR (LOWER(engineering_email) = ?1 AND proposal_type = 'purchase'
                    AND engineering_required = 1 AND status = 'manager_approved')
                OR (LOWER(ic_email) = ?1 AND proposal_type = 'purchase' AND (
                     (engineering_required = 0 AND status = 'manager_approved')
                     OR (engineering_required = 1 AND status = 'en_approved')
                   ))
              )
              ORDER BY updated_at ASC`;
      bind = [emailLower];
      break;
    case 'procurement_inbox':
      // Phase 2: phiếu mua hàng đã duyệt (completed) + mua sắm chưa 'done' → cho user KSNB.
      if (!isKsnbUser(user.deptCode)) {
        sql = `SELECT * FROM proposals WHERE 1 = 0`;
        bind = [];
        break;
      }
      sql = `SELECT * FROM proposals p
              WHERE p.proposal_type = 'purchase' AND p.status = 'completed'
                AND COALESCE((SELECT pr.status FROM procurement pr WHERE pr.proposal_id = p.id), 'pending') <> 'done'
              ORDER BY p.completed_at ASC`;
      bind = [];
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
  // Chỉ sửa được khi CHƯA có bước phê duyệt nào: draft (nháp) hoặc submitted (chưa ai duyệt).
  // Đã có approve/reject (gồm rejected) → khóa sửa; muốn làm lại phải tạo phiếu mới.
  const editable = ['draft', 'submitted'];
  if (!editable.includes(row.status)) {
    throw unprocessable('Phiếu đã vào quy trình duyệt, không sửa được. Tạo phiếu mới nếu cần.');
  }

  const body = await c.req.json<{
    title?: string;
    reason?: string;
    explanation?: string | null;
    required_time?: string;
    items?: ItemInput[];
    // PR-specific (proposal_type không sửa được sau khi tạo)
    engineering_required?: boolean | number;
    delivery_date?: string | null;
    suggested_vendor_1?: string | null;
    suggested_vendor_2?: string | null;
    suggested_vendor_3?: string | null;
    vat_rate?: number;
  }>();

  const isPr = row.proposal_type === 'purchase';
  if (!isPr && body.required_time && body.required_time.trim() && !isValidDdMmYyyy(body.required_time.trim())) {
    throw badRequest('Thời gian cần thực hiện phải đúng định dạng DD/MM/YYYY');
  }

  let subtotal: number | null = null;
  let vat: number | null = null;
  let total: number | null = null;
  let vatRate: number | null = null;
  let deliveryDate: string | null | undefined = undefined;
  let engineeringRequired: number | null | undefined = undefined;
  let vendor1: string | null | undefined = undefined;
  let vendor2: string | null | undefined = undefined;
  let vendor3: string | null | undefined = undefined;

  if (isPr) {
    if (body.delivery_date !== undefined) {
      deliveryDate = (body.delivery_date ?? '')?.trim() || null;
      if (deliveryDate && !isValidDdMmYyyy(deliveryDate)) {
        throw badRequest('Ngày cần giao phải đúng định dạng DD/MM/YYYY');
      }
    }
    if (body.engineering_required !== undefined) {
      engineeringRequired = body.engineering_required ? 1 : 0;
    }
    if (body.suggested_vendor_1 !== undefined) vendor1 = body.suggested_vendor_1 ?? null;
    if (body.suggested_vendor_2 !== undefined) vendor2 = body.suggested_vendor_2 ?? null;
    if (body.suggested_vendor_3 !== undefined) vendor3 = body.suggested_vendor_3 ?? null;

    // VAT do user chọn (0/8/10); không gửi thì giữ giá trị cũ của phiếu.
    const effRate = body.vat_rate != null ? Number(body.vat_rate) : (row.vat_rate ?? DEFAULT_VAT_RATE);
    if (body.vat_rate != null) vatRate = effRate;
    // Items thay đổi → re-calc totals + snapshot (theo thuế suất hiện hành).
    if (body.items) {
      const totals = validateAndCalcPr(body.items, effRate);
      subtotal = totals.subtotal;
      vat = totals.vat;
      total = totals.total;
    }
  }

  await c.env.DB.prepare(
    `UPDATE proposals
        SET title = COALESCE(?2, title),
            reason = COALESCE(?3, reason),
            explanation = COALESCE(?4, explanation),
            required_time = COALESCE(?5, required_time),
            engineering_required = COALESCE(?6, engineering_required),
            delivery_date = CASE WHEN ?7 = 1 THEN ?8 ELSE delivery_date END,
            suggested_vendor_1 = CASE WHEN ?9 = 1 THEN ?10 ELSE suggested_vendor_1 END,
            suggested_vendor_2 = CASE WHEN ?11 = 1 THEN ?12 ELSE suggested_vendor_2 END,
            suggested_vendor_3 = CASE WHEN ?13 = 1 THEN ?14 ELSE suggested_vendor_3 END,
            subtotal = COALESCE(?15, subtotal),
            vat_amount = COALESCE(?16, vat_amount),
            total_amount = COALESCE(?17, total_amount),
            vat_rate = COALESCE(?18, vat_rate),
            status = CASE WHEN status IN ('submitted') THEN 'draft' ELSE status END,
            rejected_reason = NULL,
            manager_acted_at = NULL,
            engineering_acted_at = NULL,
            ic_acted_at = NULL,
            bod_acted_at = NULL,
            updated_at = datetime('now')
      WHERE id = ?1`,
  )
    .bind(
      id,
      body.title ?? null,
      body.reason ?? null,
      body.explanation ?? null,
      isPr ? null : (body.required_time ?? null),
      engineeringRequired ?? null,
      deliveryDate === undefined ? 0 : 1,
      deliveryDate ?? null,
      vendor1 === undefined ? 0 : 1,
      vendor1 ?? null,
      vendor2 === undefined ? 0 : 1,
      vendor2 ?? null,
      vendor3 === undefined ? 0 : 1,
      vendor3 ?? null,
      subtotal,
      vat,
      total,
      vatRate,
    )
    .run();
  if (body.items) await replaceItems(c.env, id, body.items, row.proposal_type);

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

  const isPr = row.proposal_type === 'purchase';
  const needEn = isPr && row.engineering_required === 1;

  const manager = await getDeptManager(c.env, row.proposer_dept);
  const bod = await getActiveBod(c.env);
  const en = needEn ? await getActiveEngineering(c.env) : null;
  const ic = isPr ? await getActiveIc(c.env) : null;

  // Re-submit sau khi sửa (PATCH revert về draft): giữ nguyên code đã sinh trước đó.
  const code = row.code ?? (await nextProposalCode(c.env.DB, row.proposer_dept));
  const submittedAt = nowIso();

  // Edge cases auto-skip: proposer trùng vai trò nào thì auto-approve bước đó.
  const u = user.email.toLowerCase();
  const proposerIsManager = u === manager.email.toLowerCase();
  const proposerIsEn = en !== null && u === en.email.toLowerCase();
  const proposerIsIc = ic !== null && u === ic.email.toLowerCase();
  const proposerIsBod = u === bod.email.toLowerCase();

  // Tính status cuối + approvals cần insert. Chain: submitted → manager_approved →
  // (en_approved nếu PR+needEn) → (ic_approved nếu PR) → completed.
  type PrStatus = 'submitted' | 'manager_approved' | 'en_approved' | 'ic_approved' | 'completed';
  let finalStatus: PrStatus = 'submitted';
  const stmts: D1PreparedStatement[] = [];

  const autoApproved: Array<{ step: string; email: string; name: string; comment: string }> = [];
  const insertApproval = (step: string, email: string, name: string, comment: string) => {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, ?2, ?3, ?4, 'approve', ?5, 'web')`,
      ).bind(id, step, email, name, comment),
    );
    autoApproved.push({ step, email, name, comment });
  };

  if (proposerIsManager) {
    finalStatus = 'manager_approved';
    insertApproval('manager', manager.email, manager.name, 'Tự duyệt do là Trưởng phòng');
    if (isPr && needEn && proposerIsEn && en) {
      finalStatus = 'en_approved';
      insertApproval('engineering', en.email, en.name, 'Tự duyệt do là EN');
    }
    if (isPr && proposerIsIc && ic && (!needEn || finalStatus === 'en_approved')) {
      finalStatus = 'ic_approved';
      insertApproval('ic', ic.email, ic.name, 'Tự duyệt do là IC');
    }
    // BOD auto-approve chỉ khi general (manager_approved) hoặc PR (ic_approved).
    const eligibleForBodAuto =
      (!isPr && finalStatus === 'manager_approved') ||
      (isPr && finalStatus === 'ic_approved');
    if (proposerIsBod && eligibleForBodAuto) {
      finalStatus = 'completed';
      insertApproval('bod', bod.email, bod.name, 'Tự duyệt do là BGĐ');
    }
  }

  // Build SET clause động.
  const setSql = [
    `code = ?2`,
    `status = ?3`,
    `manager_email = ?4`,
    `manager_name = ?5`,
    `bod_email = ?6`,
    `bod_name = ?7`,
    `submitted_at = ?8`,
    `updated_at = ?8`,
    `engineering_email = ?9`,
    `engineering_name = ?10`,
    `ic_email = ?11`,
    `ic_name = ?12`,
  ];
  if (finalStatus !== 'submitted') setSql.push(`manager_acted_at = ?8`);
  if (finalStatus === 'en_approved' || finalStatus === 'ic_approved' || finalStatus === 'completed') {
    if (isPr && needEn) setSql.push(`engineering_acted_at = ?8`);
  }
  if (finalStatus === 'ic_approved' || finalStatus === 'completed') {
    if (isPr) setSql.push(`ic_acted_at = ?8`);
  }
  if (finalStatus === 'completed') setSql.push(`bod_acted_at = ?8`, `completed_at = ?8`);

  stmts.unshift(
    c.env.DB.prepare(`UPDATE proposals SET ${setSql.join(', ')} WHERE id = ?1`).bind(
      id,
      code,
      finalStatus,
      manager.email,
      manager.name,
      bod.email,
      bod.name,
      submittedAt,
      en?.email ?? null,
      en?.name ?? null,
      ic?.email ?? null,
      ic?.name ?? null,
    ),
  );
  await c.env.DB.batch(stmts);

  // Audit: ghi sự kiện submit + mỗi bước auto-approve (proposer trùng vai trò) — vì các
  // bước này KHÔNG đi qua *-action nên phải log tại đây cho đủ vết phê duyệt.
  {
    const actx = await webAuditContext(c);
    await logAudit(c.env, {
      eventType: 'submit',
      actorEmail: user.email,
      actorName: user.name,
      actorUserId: user.id,
      proposalId: id,
      channel: 'web',
      ip: actx.ip,
      userAgent: actx.userAgent,
      sessionRef: actx.sessionRef,
      detail: JSON.stringify({ code, finalStatus }),
    });
    for (const a of autoApproved) {
      await logAudit(c.env, {
        eventType: 'auto_approve',
        actorEmail: a.email,
        actorName: a.name,
        actorUserId: user.id,
        proposalId: id,
        step: a.step,
        action: 'approve',
        channel: 'web',
        ip: actx.ip,
        userAgent: actx.userAgent,
        sessionRef: actx.sessionRef,
        detail: JSON.stringify({ reason: a.comment, viaSubmit: true }),
      });
    }
  }

  // Notify bước kế tiếp tuỳ status cuối.
  if (finalStatus === 'submitted') {
    await notifyApprover(c.env, id, 'submitted', manager.email);
  } else if (finalStatus === 'manager_approved') {
    // PR + needEn → EN; PR no-EN → IC; general → BOD.
    if (isPr && needEn && en) {
      await notifyApprover(c.env, id, 'manager_approved', en.email);
    } else if (isPr && ic) {
      await notifyApprover(c.env, id, 'manager_approved', ic.email);
    } else {
      await notifyApprover(c.env, id, 'manager_approved', bod.email);
    }
  } else if (finalStatus === 'en_approved' && ic) {
    await notifyApprover(c.env, id, 'engineering_approved', ic.email);
  } else if (finalStatus === 'ic_approved') {
    await notifyApprover(c.env, id, 'ic_approved', bod.email);
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
  const isPr = row.proposal_type === 'purchase';
  const needEn = isPr && row.engineering_required === 1;
  const now = nowIso();
  // Reject thì status='rejected' bất kể type. Approve: general → manager_approved.
  // PR cũng để 'manager_approved' và phân nhánh notify (EN hoặc IC) sau đó.
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

  {
    const actx = await webAuditContext(c);
    await logAudit(c.env, {
      eventType: body.action, actorEmail: user.email, actorName: user.name, actorUserId: user.id,
      proposalId: id, step: 'manager', action: body.action, channel: 'web',
      ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
      detail: JSON.stringify({ newStatus, comment: body.comment ?? null }),
    });
  }

  if (body.action === 'reject') {
    const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
      .bind(row.proposer_user_id)
      .first<{ email: string }>();
    if (proposer) await notifyApprover(c.env, id, 'rejected', proposer.email);
    return c.json({ proposal: await loadProposal(c, id) });
  }

  // Approve flow — phân nhánh theo proposal_type.
  if (!isPr) {
    // General Phase 1: chờ BOD.
    if (row.bod_email) {
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
        await logAutoSkips(c.env, await webAuditContext(c), { proposalId: id, actorUserId: user.id, channel: 'web' }, [
          { step: 'bod', email: row.bod_email, name: row.bod_name ?? row.bod_email, reason: 'Tự duyệt do là BGĐ' },
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
    }
    return c.json({ proposal: await loadProposal(c, id) });
  }

  // PR flow — proposer là EN/IC thì auto-skip step tương ứng.
  const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(row.proposer_user_id)
    .first<{ email: string }>();
  const proposerEmail = proposer?.email?.toLowerCase() ?? '';

  // Auto-skip EN nếu proposer = EN (cần check engineering_email vì routing đã snapshot).
  let curStatus: 'manager_approved' | 'en_approved' | 'ic_approved' | 'completed' = 'manager_approved';
  const extraStmts: D1PreparedStatement[] = [];
  const autoSkips: AutoSkipItem[] = [];
  const tsNow = now;

  if (needEn) {
    if (row.engineering_email && proposerEmail === row.engineering_email.toLowerCase()) {
      curStatus = 'en_approved';
      extraStmts.push(
        c.env.DB.prepare(
          `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
           VALUES (?1, 'engineering', ?2, ?3, 'approve', 'Tự duyệt do là EN', 'web')`,
        ).bind(id, row.engineering_email, row.engineering_name),
      );
      autoSkips.push({ step: 'engineering', email: row.engineering_email, name: row.engineering_name ?? row.engineering_email, reason: 'Tự duyệt do là EN' });
    }
  }
  // Sau (en_approved hoặc manager_approved+noEn): check auto-skip IC.
  const canSkipIc =
    (!needEn && curStatus === 'manager_approved') || curStatus === 'en_approved';
  if (canSkipIc && row.ic_email && proposerEmail === row.ic_email.toLowerCase()) {
    curStatus = 'ic_approved';
    extraStmts.push(
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'ic', ?2, ?3, 'approve', 'Tự duyệt do là IC', 'web')`,
      ).bind(id, row.ic_email, row.ic_name),
    );
    autoSkips.push({ step: 'ic', email: row.ic_email, name: row.ic_name ?? row.ic_email, reason: 'Tự duyệt do là IC' });
  }
  // BOD auto-skip chỉ khi đã đến ic_approved.
  if (curStatus === 'ic_approved' && row.bod_email && proposerEmail === row.bod_email.toLowerCase()) {
    curStatus = 'completed';
    extraStmts.push(
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'web')`,
      ).bind(id, row.bod_email, row.bod_name),
    );
    autoSkips.push({ step: 'bod', email: row.bod_email, name: row.bod_name ?? row.bod_email, reason: 'Tự duyệt do là BGĐ' });
  }

  if (curStatus !== 'manager_approved') {
    // Update các timestamp + status.
    const setSql = ['status = ?2', 'updated_at = ?3'];
    if (curStatus === 'en_approved' || curStatus === 'ic_approved' || curStatus === 'completed') {
      if (needEn) setSql.push('engineering_acted_at = ?3');
    }
    if (curStatus === 'ic_approved' || curStatus === 'completed') {
      setSql.push('ic_acted_at = ?3');
    }
    if (curStatus === 'completed') setSql.push('bod_acted_at = ?3', 'completed_at = ?3');
    extraStmts.unshift(
      c.env.DB.prepare(`UPDATE proposals SET ${setSql.join(', ')} WHERE id = ?1`).bind(
        id,
        curStatus,
        tsNow,
      ),
    );
    await c.env.DB.batch(extraStmts);
    if (autoSkips.length) {
      await logAutoSkips(c.env, await webAuditContext(c), { proposalId: id, actorUserId: user.id, channel: 'web' }, autoSkips);
    }
  }

  // Notify bước kế tiếp.
  if (curStatus === 'manager_approved') {
    // Chuẩn flow: PR + needEn → EN, no-EN → IC.
    if (needEn && row.engineering_email) {
      await notifyApprover(c.env, id, 'manager_approved', row.engineering_email);
    } else if (row.ic_email) {
      await notifyApprover(c.env, id, 'manager_approved', row.ic_email);
    }
  } else if (curStatus === 'en_approved' && row.ic_email) {
    await notifyApprover(c.env, id, 'engineering_approved', row.ic_email);
  } else if (curStatus === 'ic_approved' && row.bod_email) {
    await notifyApprover(c.env, id, 'ic_approved', row.bod_email);
  } else if (curStatus === 'completed') {
    if (proposer) await notifyApprover(c.env, id, 'completed', proposer.email);
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

// ---- POST /api/proposals/:id/engineering-action (PR-only) ----
proposalRoutes.post('/:id{[0-9]+}/engineering-action', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  const row = await loadProposal(c, id);

  if (row.proposal_type !== 'purchase' || row.engineering_required !== 1) {
    throw unprocessable('Phiếu không cần EN duyệt');
  }
  if (row.status !== 'manager_approved') throw unprocessable('Phiếu không ở trạng thái chờ EN duyệt');
  if (!row.engineering_email || row.engineering_email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden('Bạn không phải EN phụ trách phiếu này');
  }
  if (body.action !== 'approve' && body.action !== 'reject') throw badRequest('action không hợp lệ');
  const now = nowIso();
  const newStatus = body.action === 'approve' ? 'en_approved' : 'rejected';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals
          SET status = ?2, engineering_acted_at = ?3,
              rejected_reason = CASE WHEN ?2 = 'rejected' THEN ?4 ELSE rejected_reason END,
              updated_at = ?3
        WHERE id = ?1`,
    ).bind(id, newStatus, now, body.comment ?? null),
    c.env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, 'engineering', ?2, ?3, ?4, ?5, 'web')`,
    ).bind(id, user.email, user.name, body.action, body.comment ?? null),
  ]);

  {
    const actx = await webAuditContext(c);
    await logAudit(c.env, {
      eventType: body.action, actorEmail: user.email, actorName: user.name, actorUserId: user.id,
      proposalId: id, step: 'engineering', action: body.action, channel: 'web',
      ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
      detail: JSON.stringify({ newStatus, comment: body.comment ?? null }),
    });
  }

  const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(row.proposer_user_id)
    .first<{ email: string }>();

  if (body.action === 'reject') {
    if (proposer) await notifyApprover(c.env, id, 'rejected', proposer.email);
    return c.json({ proposal: await loadProposal(c, id) });
  }

  // Approve → chờ IC. Auto-skip IC nếu proposer là IC.
  const proposerEmail = proposer?.email?.toLowerCase() ?? '';
  if (row.ic_email && proposerEmail === row.ic_email.toLowerCase()) {
    // Skip IC → status='ic_approved'.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE proposals SET status = 'ic_approved', ic_acted_at = ?2, updated_at = ?2 WHERE id = ?1`,
      ).bind(id, now),
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'ic', ?2, ?3, 'approve', 'Tự duyệt do là IC', 'web')`,
      ).bind(id, row.ic_email, row.ic_name),
    ]);
    await logAutoSkips(c.env, await webAuditContext(c), { proposalId: id, actorUserId: user.id, channel: 'web' }, [
      { step: 'ic', email: row.ic_email, name: row.ic_name ?? row.ic_email, reason: 'Tự duyệt do là IC' },
    ]);
    // Sau ic_approved: tiếp tục check BOD auto-skip.
    if (row.bod_email && proposerEmail === row.bod_email.toLowerCase()) {
      const tsBod = nowIso();
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE proposals SET status = 'completed', bod_acted_at = ?2, completed_at = ?2, updated_at = ?2 WHERE id = ?1`,
        ).bind(id, tsBod),
        c.env.DB.prepare(
          `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
           VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'web')`,
        ).bind(id, row.bod_email, row.bod_name),
      ]);
      await logAutoSkips(c.env, await webAuditContext(c), { proposalId: id, actorUserId: user.id, channel: 'web' }, [
        { step: 'bod', email: row.bod_email, name: row.bod_name ?? row.bod_email, reason: 'Tự duyệt do là BGĐ' },
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
    } else if (row.bod_email) {
      await notifyApprover(c.env, id, 'ic_approved', row.bod_email);
    }
  } else if (row.ic_email) {
    await notifyApprover(c.env, id, 'engineering_approved', row.ic_email);
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// ---- POST /api/proposals/:id/ic-action (PR-only) ----
proposalRoutes.post('/:id{[0-9]+}/ic-action', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  const row = await loadProposal(c, id);

  if (row.proposal_type !== 'purchase') throw unprocessable('Phiếu không phải mua hàng');
  const expectedStatus = row.engineering_required === 1 ? 'en_approved' : 'manager_approved';
  if (row.status !== expectedStatus) throw unprocessable('Phiếu không ở trạng thái chờ IC duyệt');
  if (!row.ic_email || row.ic_email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden('Bạn không phải IC phụ trách phiếu này');
  }
  if (body.action !== 'approve' && body.action !== 'reject') throw badRequest('action không hợp lệ');
  const now = nowIso();
  const newStatus = body.action === 'approve' ? 'ic_approved' : 'rejected';

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE proposals
          SET status = ?2, ic_acted_at = ?3,
              rejected_reason = CASE WHEN ?2 = 'rejected' THEN ?4 ELSE rejected_reason END,
              updated_at = ?3
        WHERE id = ?1`,
    ).bind(id, newStatus, now, body.comment ?? null),
    c.env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, 'ic', ?2, ?3, ?4, ?5, 'web')`,
    ).bind(id, user.email, user.name, body.action, body.comment ?? null),
  ]);

  {
    const actx = await webAuditContext(c);
    await logAudit(c.env, {
      eventType: body.action, actorEmail: user.email, actorName: user.name, actorUserId: user.id,
      proposalId: id, step: 'ic', action: body.action, channel: 'web',
      ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
      detail: JSON.stringify({ newStatus, comment: body.comment ?? null }),
    });
  }

  const proposer = await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(row.proposer_user_id)
    .first<{ email: string }>();

  if (body.action === 'reject') {
    if (proposer) await notifyApprover(c.env, id, 'rejected', proposer.email);
    return c.json({ proposal: await loadProposal(c, id) });
  }

  // Approve → chờ BOD. Auto-skip BOD nếu proposer là BOD.
  const proposerEmail = proposer?.email?.toLowerCase() ?? '';
  if (row.bod_email && proposerEmail === row.bod_email.toLowerCase()) {
    const tsBod = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE proposals SET status = 'completed', bod_acted_at = ?2, completed_at = ?2, updated_at = ?2 WHERE id = ?1`,
      ).bind(id, tsBod),
      c.env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'web')`,
      ).bind(id, row.bod_email, row.bod_name),
    ]);
    await logAutoSkips(c.env, await webAuditContext(c), { proposalId: id, actorUserId: user.id, channel: 'web' }, [
      { step: 'bod', email: row.bod_email, name: row.bod_name ?? row.bod_email, reason: 'Tự duyệt do là BGĐ' },
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
  } else if (row.bod_email) {
    await notifyApprover(c.env, id, 'ic_approved', row.bod_email);
  }

  return c.json({ proposal: await loadProposal(c, id) });
});

// ---- POST /api/proposals/:id/bod-action ----
proposalRoutes.post('/:id{[0-9]+}/bod-action', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  const row = await loadProposal(c, id);

  // General: chờ BGĐ ở status='manager_approved'. PR: ở 'ic_approved'.
  const expectedStatus = row.proposal_type === 'purchase' ? 'ic_approved' : 'manager_approved';
  if (row.status !== expectedStatus)
    throw unprocessable('Phiếu không ở trạng thái chờ BGĐ duyệt');
  if (!row.bod_email || row.bod_email.toLowerCase() !== user.email.toLowerCase()) {
    throw forbidden('Bạn không phải BGĐ phụ trách phiếu này');
  }
  if (body.action !== 'approve' && body.action !== 'reject') throw badRequest('action không hợp lệ');
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

  {
    const actx = await webAuditContext(c);
    await logAudit(c.env, {
      eventType: body.action, actorEmail: user.email, actorName: user.name, actorUserId: user.id,
      proposalId: id, step: 'bod', action: body.action, channel: 'web',
      ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
      detail: JSON.stringify({ newStatus, comment: body.comment ?? null }),
    });
  }

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

// ---- Phase 2: KSNB theo dõi mua hàng (procurement) ----
async function loadProcurement(env: AppEnv['Bindings'], id: number) {
  const head = await env.DB.prepare(`SELECT * FROM procurement WHERE proposal_id = ?1`)
    .bind(id)
    .first();
  const events = await env.DB.prepare(
    `SELECT id, type, event_date, percent, note, created_by_name, created_at
       FROM procurement_event WHERE proposal_id = ?1 ORDER BY id ASC`,
  )
    .bind(id)
    .all();
  return { head: head ?? null, events: events.results ?? [] };
}

const PROC_TYPES = ['order', 'receive', 'payment', 'other'];

// GET trạng thái + nhật ký mua sắm.
proposalRoutes.get('/:id{[0-9]+}/procurement', async (c) => {
  return c.json(await loadProcurement(c.env, Number(c.req.param('id'))));
});

// Thêm 1 hoạt động mua sắm (Đặt hàng / Nhận hàng / Thanh toán % / Khác).
proposalRoutes.post('/:id{[0-9]+}/procurement/event', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  if (!isKsnbUser(user.deptCode)) throw forbidden('Chỉ KSNB được theo dõi mua hàng');
  const row = await loadProposal(c, id);
  if (row.proposal_type !== 'purchase' || row.status !== 'completed') {
    throw unprocessable('Chỉ phiếu mua hàng đã duyệt mới theo dõi mua sắm');
  }
  const body = await c.req.json<{ type?: string; event_date?: string; percent?: number; note?: string }>();
  const type = body.type ?? '';
  if (!PROC_TYPES.includes(type)) throw badRequest('Loại hoạt động không hợp lệ');
  const percent = type === 'payment' && body.percent != null ? Number(body.percent) : null;
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO procurement (proposal_id, status, updated_at) VALUES (?1, 'in_progress', ?2)
       ON CONFLICT (proposal_id) DO UPDATE
         SET status = CASE WHEN procurement.status = 'done' THEN 'done' ELSE 'in_progress' END,
             updated_at = ?2`,
    ).bind(id, now),
    c.env.DB.prepare(
      `INSERT INTO procurement_event (proposal_id, type, event_date, percent, note, created_by_user_id, created_by_name)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(id, type, (body.event_date ?? '').trim() || null, percent, (body.note ?? '').trim() || null, user.id, user.name),
  ]);
  const actx = await webAuditContext(c);
  await logAudit(c.env, {
    eventType: 'procurement_event', actorEmail: user.email, actorName: user.name, actorUserId: user.id,
    proposalId: id, action: type, channel: 'web', ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
    detail: JSON.stringify({ type, percent, note: body.note ?? null }),
  });
  return c.json(await loadProcurement(c.env, id));
});

// Đánh dấu hoàn tất mua sắm (đóng giai đoạn).
proposalRoutes.post('/:id{[0-9]+}/procurement/done', async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  if (!isKsnbUser(user.deptCode)) throw forbidden('Chỉ KSNB được theo dõi mua hàng');
  const row = await loadProposal(c, id);
  if (row.proposal_type !== 'purchase' || row.status !== 'completed') {
    throw unprocessable('Phiếu không hợp lệ để hoàn tất mua sắm');
  }
  const body = await c.req.json<{ note?: string }>();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO procurement (proposal_id, status, done_at, done_by_user_id, done_by_name, done_note, updated_at)
     VALUES (?1, 'done', ?2, ?3, ?4, ?5, ?2)
     ON CONFLICT (proposal_id) DO UPDATE
       SET status = 'done', done_at = ?2, done_by_user_id = ?3, done_by_name = ?4, done_note = ?5, updated_at = ?2`,
  )
    .bind(id, now, user.id, user.name, (body.note ?? '').trim() || null)
    .run();
  const actx = await webAuditContext(c);
  await logAudit(c.env, {
    eventType: 'procurement_done', actorEmail: user.email, actorName: user.name, actorUserId: user.id,
    proposalId: id, action: 'done', channel: 'web', ip: actx.ip, userAgent: actx.userAgent, sessionRef: actx.sessionRef,
    detail: JSON.stringify({ note: body.note ?? null }),
  });
  return c.json(await loadProcurement(c.env, id));
});

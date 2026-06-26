// GIẤY ĐỀ NGHỊ THANH TOÁN (DNTT) — mẫu AVPG-AC-P1-F1.
// Đợt 1: tạo phiếu từ template → in ra giấy đi trình ký TAY (chưa có duyệt điện tử).
// Trang theo dõi bám vết hồ sơ giấy đang ở chặng nào trong 6 chặng cố định.
// Server-render (Tailwind + Alpine cho bảng kê động), form POST — cùng style /invoices.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { html, raw } from 'hono/html';
import type { AppEnv, SessionUser } from '../types';
import { page } from '../web/layout';
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors';
import { nowIso, vnDisplay } from '../lib/time';
import { nextPaymentCode } from '../lib/codes';
import { readVndWords } from '../lib/num-to-words-vi';
import { logAudit, webAuditContext } from '../lib/audit';
import { paymentPrintPage } from '../web/payment-print';
import { getDeptManager, getActiveBod, getActiveIc, type Approver } from '../lib/routing';
import {
  createSignedDocument,
  distributeDocument,
  documensoConfigured,
  type DocumensoSigner,
} from '../lib/documenso';
import { pdfRenderConfigured, renderPaymentPdf } from '../lib/payment-pdf';

export const paymentRoutes = new Hono<AppEnv>();

// Chuỗi chặng. current_stage = chặng phiếu ĐANG ở (chờ bên đó ký).
// Cặp chặng 2-3 (KSNB & Kế toán) ký theo thứ tự tuỳ thực tế: bên nào nhận hồ sơ
// trước thì ký trước (mid_order = 'ksnb' | 'acct' ghi bên ký TRƯỚC, NULL = chưa chọn).
export type MidOrder = 'ksnb' | 'acct' | null;
export function prStages(midOrder: string | null | undefined): string[] {
  const mid: [string, string] =
    midOrder === 'ksnb'
      ? ['KSNB ký', 'Kế toán ký']
      : midOrder === 'acct'
        ? ['Kế toán ký', 'KSNB ký']
        : ['KSNB / Kế toán ký', 'Bên còn lại ký'];
  return ['Nhập', 'Trưởng bộ phận ký', mid[0], mid[1], 'BOD ký', 'Đã thanh toán'];
}
const LAST_STAGE = 5; // Đã thanh toán

// Toạ độ ô CHỮ KÝ trên bản in (đơn vị %, trang 1). Mẫu AVPG-AC-P1-F1 có 5 ô:
// [Người lập | Trưởng bộ phận | KSNB | Kế toán | BOD]. Chỉ 4 ô sau cần ký điện tử.
// ⚠️ Số liệu dưới là ƯỚC LƯỢNG — phải CHỈNH lại bằng mắt trên Documenso UI sau lần render PDF
// thật đầu tiên (bảng kê dài có thể xô sang trang 2 → cần đổi pageNumber). Xem docs/.
const SIGN_FIELD_POS: Record<'manager' | 'ksnb' | 'acct' | 'bod', { pageNumber: number; pageX: number; pageY: number; width: number; height: number }> = {
  manager: { pageNumber: 1, pageX: 20.6, pageY: 84, width: 16, height: 10 },
  ksnb: { pageNumber: 1, pageX: 40.2, pageY: 84, width: 16, height: 10 },
  acct: { pageNumber: 1, pageX: 59.8, pageY: 84, width: 16, height: 10 },
  bod: { pageNumber: 1, pageX: 79.4, pageY: 84, width: 16, height: 10 },
};

// Ký điện tử khả dụng khi đã cấu hình Documenso + Gotenberg.
function eSignAvailable(env: AppEnv['Bindings']): boolean {
  return documensoConfigured(env) && pdfRenderConfigured(env);
}

// status suy từ current_stage (trừ 'cancelled' lưu thẳng DB).
function stageStatus(stage: number): 'draft' | 'in_progress' | 'paid' {
  if (stage <= 0) return 'draft';
  if (stage >= LAST_STAGE) return 'paid';
  return 'in_progress';
}

// ===== Helpers hiển thị =====
const vnd = new Intl.NumberFormat('vi-VN');
const money = (n: unknown): string => (n == null || n === '' ? '' : vnd.format(Number(n)));
const esc = (s: unknown): string => String(s ?? '');
// Bỏ dấu chấm ngăn nghìn (ô tiền nhập kiểu VN) → số.
const parseMoney = (s: unknown): number => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;
const parseQty = (s: unknown): number => {
  const v = Number(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

type PrRow = {
  id: number;
  code: string | null;
  status: string;
  current_stage: number;
  mid_order: string | null;
  creator_email: string;
  creator_name: string | null;
  dept_code: string;
  payee_name: string | null;
  payee_title: string | null;
  purpose: string | null;
  total_amount: number | string;
  amount_words: string | null;
  pay_form: string | null;
  receive_form: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_name: string | null;
  transfer_note: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Documenso (ký điện tử) — null khi phiếu theo luồng giấy.
  documenso_document_id?: number | null;
  documenso_envelope_id?: string | null;
  documenso_status?: string | null;
  signed_pdf_key?: string | null;
  signed_pdf_sha256?: string | null;
  sign_sent_at?: string | null;
  signed_completed_at?: string | null;
};

// Dòng danh sách theo dõi = header phiếu + ghi chú trình ký mới nhất (từ stage_log).
type PrListRow = PrRow & {
  last_note: string | null;
  last_note_by: string | null;
  last_note_at: string | null;
};

type PrItem = {
  seq: number;
  description: string | null;
  unit_price: number | string | null;
  qty: number | string | null;
  amount: number | string | null;
  currency: string | null;
  note: string | null;
};

// Chỉ phòng IT được dùng module Đề nghị Thanh toán (mã phòng trong bảng departments).
// Đổi danh sách này nếu mở rộng cho phòng khác.
export const PR_ALLOWED_DEPTS = ['IT'];
export function canUsePayments(deptCode: string | null | undefined): boolean {
  return !!deptCode && PR_ALLOWED_DEPTS.includes(deptCode.toUpperCase());
}

// Bắt buộc đăng nhập + giới hạn phòng IT cho toàn bộ /payments.
paymentRoutes.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user) return c.redirect('/auth/login?return_to=/payments');
  if (!canUsePayments(user.deptCode))
    throw forbidden('Tính năng Đề nghị Thanh toán chỉ dành cho phòng IT.');
  await next();
});

// Badge trạng thái cho danh sách.
function prStatusBadge(status: string, stage: number, stages: string[]): ReturnType<typeof html> {
  if (status === 'cancelled')
    return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-600">Đã huỷ</span>`;
  if (status === 'paid')
    return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Đã thanh toán</span>`;
  if (status === 'draft')
    return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">Nháp</span>`;
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Đang ở: ${esc(stages[stage] ?? '?')}</span>`;
}

// Thanh stepper 6 chặng.
function stepper(stage: number, cancelled: boolean, stages: string[]): ReturnType<typeof html> {
  return html`<div class="flex flex-wrap items-center gap-1.5">
    ${stages.map((label, i) => {
      const done = !cancelled && i < stage;
      const current = !cancelled && i === stage;
      const cls = cancelled
        ? 'bg-slate-100 text-slate-400'
        : done
          ? 'bg-emerald-600 text-white'
          : current
            ? 'bg-blue-700 text-white ring-2 ring-blue-300'
            : 'bg-slate-100 text-slate-500';
      return html`<span class="px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}">${done ? '✓ ' : ''}${esc(label)}</span>${i < LAST_STAGE ? html`<span class="text-slate-300 text-xs">→</span>` : ''}`;
    })}
  </div>`;
}

// ============================ DANH SÁCH / THEO DÕI ============================
paymentRoutes.get('/', async (c) => {
  const user = c.get('user')!;
  const scope = c.req.query('scope') ?? 'all'; // all | mine
  const st = c.req.query('st') ?? 'open'; // open | paid | cancelled | all
  const q = (c.req.query('q') ?? '').trim();

  const conds: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  if (scope === 'mine') {
    conds.push(`LOWER(creator_email) = ?${++n}`);
    params.push(user.email.toLowerCase());
  }
  if (st === 'open') conds.push(`status IN ('draft','in_progress')`);
  else if (st === 'paid') conds.push(`status = 'paid'`);
  else if (st === 'cancelled') conds.push(`status = 'cancelled'`);
  if (q) {
    conds.push(`(LOWER(code) LIKE ?${++n} OR LOWER(payee_name) LIKE ?${n} OR LOWER(purpose) LIKE ?${n})`);
    params.push(`%${q.toLowerCase()}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  // Ghi chú trình ký mới nhất (ai đang giữ hồ sơ / tình trạng) cho cột Ghi chú.
  // Chỉ lấy kind advance/note — là 2 kind có ghi chú người dùng nhập tay;
  // create/revert/cancel chèn note tự động ('Tạo phiếu'...) không có giá trị theo dõi.
  const lastNote = (expr: string) =>
    `(SELECT ${expr} FROM payment_request_stage_log l
       WHERE l.pr_id = payment_request.id AND l.kind IN ('advance','note')
         AND l.note IS NOT NULL AND l.note <> ''
       ORDER BY l.id DESC LIMIT 1)`;
  const rows =
    (
      await c.env.DB.prepare(
        `SELECT id, code, status, current_stage, mid_order, creator_name, creator_email, dept_code,
                payee_name, purpose, total_amount, created_at,
                ${lastNote('l.note')} AS last_note,
                ${lastNote('COALESCE(l.actor_name, l.actor_email)')} AS last_note_by,
                ${lastNote('l.acted_at')} AS last_note_at
           FROM payment_request ${where}
          ORDER BY id DESC`,
      )
        .bind(...params)
        .all<PrListRow>()
    ).results ?? [];

  return c.html(
    page({
      title: 'Đề nghị Thanh toán',
      user,
      wide: true,
      body: listBody(rows, { scope, st, q }),
    }),
  );
});

function listBody(rows: PrListRow[], f: { scope: string; st: string; q: string }) {
  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    const merged = { scope: f.scope, st: f.st, q: f.q, ...patch };
    if (merged.scope && merged.scope !== 'all') u.set('scope', merged.scope);
    if (merged.st && merged.st !== 'open') u.set('st', merged.st);
    if (merged.q) u.set('q', merged.q);
    const s = u.toString();
    return s ? `/payments?${s}` : '/payments';
  };
  const tab = (key: 'scope' | 'st', val: string, label: string, activeCls: string) =>
    html`<a href="${qs({ [key]: val })}"
      class="px-3 py-1.5 rounded-md text-sm ${f[key] === val ? activeCls : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">${label}</a>`;

  return html`
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold text-slate-800">💳 Đề nghị Thanh toán — Theo dõi trình ký</h1>
      <a href="/payments/new" class="bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition">+ Tạo đề nghị</a>
    </div>
    <div class="flex flex-wrap gap-2 mb-3">
      ${tab('scope', 'all', 'Tất cả phiếu', 'bg-blue-900 text-white')}
      ${tab('scope', 'mine', 'Của tôi', 'bg-blue-900 text-white')}
      <span class="w-px bg-slate-200 mx-1"></span>
      ${tab('st', 'open', 'Đang trình', 'bg-amber-500 text-white')}
      ${tab('st', 'paid', 'Đã thanh toán', 'bg-emerald-700 text-white')}
      ${tab('st', 'cancelled', 'Đã huỷ', 'bg-slate-500 text-white')}
      ${tab('st', 'all', 'Tất cả TT', 'bg-slate-700 text-white')}
    </div>
    <form method="get" action="/payments" class="flex flex-wrap gap-2 mb-4 items-end">
      <input type="hidden" name="scope" value="${f.scope}" />
      <input type="hidden" name="st" value="${f.st}" />
      <label class="flex flex-col text-xs text-slate-500 gap-1">Tìm (mã / người nhận / mục đích)
        <input type="text" name="q" value="${f.q}" placeholder="vd KT01 hoặc mực in" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm w-72" />
      </label>
      <button class="px-4 py-1.5 bg-blue-900 text-white rounded-md text-sm">Lọc</button>
    </form>
    ${rows.length === 0
      ? html`<div class="text-center text-slate-400 bg-white rounded-lg ring-1 ring-slate-200 py-12">Chưa có đề nghị thanh toán.</div>`
      : html`<div class="overflow-x-auto bg-white rounded-lg ring-1 ring-slate-200">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th class="text-left px-3 py-2">Mã phiếu</th>
              <th class="text-left px-3 py-2">Người nhận / Mục đích</th>
              <th class="text-right px-3 py-2">Số tiền</th>
              <th class="text-left px-3 py-2">Người tạo</th>
              <th class="text-left px-3 py-2">Tiến độ trình ký</th>
              <th class="text-left px-3 py-2 w-[24%]">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              (r) => html`<tr class="border-t border-slate-100 hover:bg-blue-50/40">
              <td class="px-3 py-2 align-top whitespace-nowrap">
                <a href="/payments/${String(r.id)}" class="text-blue-700 font-semibold hover:underline">${esc(r.code ?? '(nháp)')}</a>
              </td>
              <td class="px-3 py-2 align-top">
                <div class="font-medium text-slate-700">${esc(r.payee_name ?? '—')}</div>
                <div class="text-xs text-slate-500 break-words">${esc(r.purpose ?? '')}</div>
              </td>
              <td class="px-3 py-2 align-top text-right font-medium whitespace-nowrap">${money(r.total_amount)}</td>
              <td class="px-3 py-2 align-top text-slate-600 whitespace-nowrap">${esc(r.creator_name ?? r.creator_email)}</td>
              <td class="px-3 py-2 align-top whitespace-nowrap">${prStatusBadge(r.status, Number(r.current_stage), prStages(r.mid_order))}</td>
              <td class="px-3 py-2 align-top">
                ${r.last_note
                  ? html`<div class="text-xs text-slate-600 break-words">${esc(r.last_note)}</div>
                      <div class="text-[11px] text-slate-400 mt-0.5">${esc(r.last_note_by ?? '')}${r.last_note_at ? ` · ${vnDisplay(r.last_note_at)}` : ''}</div>`
                  : html`<span class="text-xs text-slate-300">—</span>`}
              </td>
            </tr>`,
            )}
          </tbody>
          <tfoot>
            <tr class="border-t border-slate-200 bg-slate-50">
              <td colspan="2" class="px-3 py-2 text-right font-medium text-slate-600">Tổng tiền</td>
              <td class="px-3 py-2 text-right font-bold text-blue-900 whitespace-nowrap">${money(rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0))}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>`}
    <p class="text-xs text-slate-400 mt-3">${String(rows.length)} phiếu · nhấn <b>mã phiếu</b> để xem chi tiết, in và cập nhật chặng trình ký.</p>`;
}

// ============================ FORM TẠO / SỬA ============================
paymentRoutes.get('/new', (c) => {
  const user = c.get('user')!;
  if (!user.deptCode)
    throw unprocessable('Tài khoản chưa được gán phòng ban. Liên hệ quản trị hệ thống.', 'no_department');
  return c.html(page({ title: 'Tạo đề nghị thanh toán', user, body: formBody(user, null) }));
});

paymentRoutes.get('/:id{[0-9]+}/edit', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await c.env.DB.prepare(`SELECT * FROM payment_request WHERE id = ?1`).bind(id).first<PrRow>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  if (pr.creator_email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden('Bạn không phải người tạo phiếu này');
  if (pr.status !== 'draft')
    throw unprocessable('Phiếu đã bắt đầu trình ký, không sửa được. Lùi về chặng Nhập nếu cần.');
  const items =
    (
      await c.env.DB.prepare(
        `SELECT seq, description, unit_price, qty, amount, currency, note
           FROM payment_request_item WHERE pr_id = ?1 ORDER BY seq ASC`,
      )
        .bind(id)
        .all<PrItem>()
    ).results ?? [];
  return c.html(page({ title: `Sửa ${pr.code ?? 'phiếu'}`, user, body: formBody(user, { pr, items }) }));
});

function formBody(me: SessionUser, existing: { pr: PrRow; items: PrItem[] } | null) {
  const pr = existing?.pr ?? null;
  const action = pr ? `/payments/${pr.id}` : '/payments';
  const cancelHref = pr ? `/payments/${pr.id}` : '/payments';
  const itemsJson = JSON.stringify(
    existing && existing.items.length
      ? existing.items.map((it) => ({
          description: it.description ?? '',
          unit_price: it.unit_price == null ? '' : String(it.unit_price),
          qty: it.qty == null ? '' : String(it.qty),
          currency: it.currency ?? 'VND',
          note: it.note ?? '',
        }))
      : [{ description: '', unit_price: '', qty: '', currency: 'VND', note: '' }],
  );
  const v = (s: string | null | undefined) => esc(s ?? '');

  return html`
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-semibold text-slate-800">${pr ? `Sửa đề nghị ${esc(pr.code ?? '')}` : 'Tạo Giấy Đề Nghị Thanh Toán'}</h1>
        <a href="${cancelHref}" class="text-slate-500 hover:text-slate-700 text-sm">← Huỷ</a>
      </div>
      <form method="post" action="${action}" x-data="prForm()" @submit="prepare()"
        class="bg-white rounded-xl ring-1 ring-slate-200 p-6 space-y-5">
        <div class="grid md:grid-cols-2 gap-4">
          <div class="flex flex-col gap-1 text-sm">Họ &amp; tên người thanh toán
            <div class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700">${esc(me.name)}</div>
          </div>
          <div class="flex flex-col gap-1 text-sm">Chức danh
            <div class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700">${esc(me.jobTitle ?? '—')}</div>
          </div>
        </div>
        <p class="text-xs text-slate-400 -mt-3">Tự động lấy theo tài khoản đăng nhập (M365).</p>
        <label class="flex flex-col gap-1 text-sm">Mục đích thanh toán
          <textarea name="purpose" rows="2" required
            class="px-3 py-2 border border-slate-300 rounded-md">${v(pr?.purpose)}</textarea>
        </label>

        <!-- Bảng kê -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-slate-700">Thanh toán theo bảng kê</span>
            <button type="button" @click="addRow()" class="text-sm text-blue-700 hover:underline">+ Thêm dòng</button>
          </div>
          <div class="overflow-x-auto ring-1 ring-slate-200 rounded-md">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th class="px-2 py-1.5 text-left">Diễn giải</th>
                  <th class="px-2 py-1.5 text-right w-28">Đơn giá</th>
                  <th class="px-2 py-1.5 text-right w-20">SL</th>
                  <th class="px-2 py-1.5 text-right w-32">Số tiền</th>
                  <th class="px-2 py-1.5 text-left w-20">Loại tiền</th>
                  <th class="px-2 py-1.5 text-left w-32">Ghi chú</th>
                  <th class="w-8"></th>
                </tr>
              </thead>
              <tbody>
                <template x-for="(it, idx) in items" :key="idx">
                  <tr class="border-t border-slate-100">
                    <td class="px-1 py-1"><input x-model="it.description" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                    <td class="px-1 py-1"><input x-model="it.unit_price" @input="fmt($event); calc()" inputmode="numeric" class="w-full px-2 py-1 text-right border border-slate-200 rounded" /></td>
                    <td class="px-1 py-1"><input x-model="it.qty" @input="calc()" inputmode="decimal" class="w-full px-2 py-1 text-right border border-slate-200 rounded" /></td>
                    <td class="px-1 py-1"><input :value="lineAmount(it)" readonly class="w-full px-2 py-1 text-right border border-slate-100 bg-slate-50 rounded text-slate-600" /></td>
                    <td class="px-1 py-1">
                      <select x-model="it.currency" class="w-full px-1 py-1 border border-slate-200 rounded">
                        <option>VND</option><option>USD</option>
                      </select>
                    </td>
                    <td class="px-1 py-1"><input x-model="it.note" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                    <td class="px-1 py-1 text-center">
                      <button type="button" @click="removeRow(idx)" x-show="items.length > 1" class="text-rose-500 hover:text-rose-700">✕</button>
                    </td>
                  </tr>
                </template>
              </tbody>
              <tfoot>
                <tr class="border-t border-slate-200 bg-slate-50">
                  <td colspan="3" class="px-2 py-2 text-right font-medium">Tổng cộng</td>
                  <td class="px-2 py-2 text-right font-bold text-blue-900" x-text="fmtNum(total())"></td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="text-xs text-slate-500 mt-1">Bằng chữ: <span class="italic" x-text="words()"></span></p>
        </div>

        <!-- Hình thức thanh toán -->
        <div class="grid md:grid-cols-2 gap-4">
          <label class="flex flex-col gap-1 text-sm">Hình thức thanh toán
            <select name="pay_form" class="px-3 py-2 border border-slate-300 rounded-md">
              ${['Công ty', 'Cá nhân'].map(
                (o) => html`<option value="${o}" ${pr?.pay_form === o ? 'selected' : ''}>${o}</option>`,
              )}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">Hình thức nhận tiền
            <select name="receive_form" class="px-3 py-2 border border-slate-300 rounded-md">
              ${['CK', 'TM'].map(
                (o) => html`<option value="${o}" ${pr?.receive_form === o ? 'selected' : ''}>${o === 'CK' ? 'Chuyển khoản (CK)' : 'Tiền mặt (TM)'}</option>`,
              )}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">Tên chủ tài khoản
            <input name="bank_account_name" value="${v(pr?.bank_account_name)}" class="px-3 py-2 border border-slate-300 rounded-md" />
          </label>
          <label class="flex flex-col gap-1 text-sm">Số tài khoản người nhận
            <input name="bank_account_no" value="${v(pr?.bank_account_no)}" class="px-3 py-2 border border-slate-300 rounded-md" />
          </label>
          <label class="flex flex-col gap-1 text-sm">Ngân hàng
            <input name="bank_name" value="${v(pr?.bank_name)}" class="px-3 py-2 border border-slate-300 rounded-md" />
          </label>
          <label class="flex flex-col gap-1 text-sm">Nội dung CK
            <input name="transfer_note" value="${v(pr?.transfer_note)}" class="px-3 py-2 border border-slate-300 rounded-md" />
          </label>
        </div>

        <input type="hidden" name="items_json" x-ref="items_json" />
        <input type="hidden" name="amount_words" x-ref="amount_words" />
        <div class="flex justify-end gap-3 pt-2">
          <a href="${cancelHref}" class="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Huỷ</a>
          <button class="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">${pr ? 'Lưu thay đổi' : 'Tạo phiếu'}</button>
        </div>
      </form>
    </div>
    <script>
      function prForm() {
        return {
          items: ${raw(itemsJson.replace(/</g, '\\u003c'))},
          addRow() { this.items.push({ description: '', unit_price: '', qty: '', currency: 'VND', note: '' }); },
          removeRow(i) { this.items.splice(i, 1); if (!this.items.length) this.addRow(); },
          num(s) { return Number(String(s == null ? '' : s).replace(/[^\\d]/g, '')) || 0; },
          qtyNum(s) { var v = Number(String(s == null ? '' : s).replace(/\\./g, '').replace(',', '.')); return isFinite(v) ? v : 0; },
          lineRaw(it) { var q = this.qtyNum(it.qty); return Math.round(this.num(it.unit_price) * (q || 1)); },
          lineAmount(it) { return this.fmtNum(this.lineRaw(it)); },
          total() { return this.items.reduce((s, it) => s + this.lineRaw(it), 0); },
          fmtNum(n) { return n ? Number(n).toLocaleString('vi-VN') : '0'; },
          fmt(e) { var el = e.target; var d = el.value.replace(/[^\\d]/g, ''); el.value = d ? Number(d).toLocaleString('vi-VN') : ''; },
          calc() {},
          words() { return readWords(this.total()); },
          prepare() {
            this.$refs.items_json.value = JSON.stringify(this.items.map(function (it) {
              return { description: it.description, unit_price: it.unit_price, qty: it.qty, currency: it.currency, note: it.note };
            }));
            this.$refs.amount_words.value = this.words();
          },
        };
      }
      // Đọc số thành chữ phía client (đồng bộ logic với server num-to-words-vi).
      function readWords(amount) {
        var DIGITS = ['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
        var SCALES = ['','nghìn','triệu','tỷ','nghìn tỷ','triệu tỷ','tỷ tỷ'];
        var n = Math.floor(Math.abs(Number(amount) || 0));
        if (n === 0) return 'Không đồng';
        function grp(x, full) {
          var t = Math.floor(x / 100), c = Math.floor((x % 100) / 10), d = x % 10, p = [];
          if (t > 0 || full) { p.push(DIGITS[t], 'trăm'); }
          if (c > 1) { p.push(DIGITS[c], 'mươi'); if (d === 1) p.push('mốt'); else if (d === 4) p.push('tư'); else if (d === 5) p.push('lăm'); else if (d > 0) p.push(DIGITS[d]); }
          else if (c === 1) { p.push('mười'); if (d === 5) p.push('lăm'); else if (d > 0) p.push(DIGITS[d]); }
          else if (d > 0) { if (t > 0 || full) p.push('lẻ'); p.push(DIGITS[d]); }
          return p.join(' ');
        }
        var g = [];
        while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); }
        var out = [], top = g.length - 1;
        for (var i = top; i >= 0; i--) {
          if (g[i] === 0 && i !== top) continue;
          var txt = grp(g[i], i !== top); if (txt) out.push(txt);
          if (SCALES[i]) out.push(SCALES[i]);
        }
        var s = out.join(' ').replace(/\\s+/g, ' ').trim();
        return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
      }
    </script>`;
}

// Parse + validate item từ items_json.
function parseItems(raw: unknown): { items: Array<{ description: string; unit_price: number; qty: number; amount: number; currency: string; note: string }>; total: number } {
  let arr: unknown[] = [];
  try {
    arr = JSON.parse(String(raw ?? '[]'));
  } catch {
    throw badRequest('Bảng kê không hợp lệ');
  }
  if (!Array.isArray(arr)) arr = [];
  const items = arr
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const unit_price = parseMoney(o.unit_price);
      const qty = parseQty(o.qty);
      const amount = Math.round(unit_price * (qty || 1));
      return {
        description: String(o.description ?? '').trim(),
        unit_price,
        qty,
        amount,
        currency: String(o.currency ?? 'VND').trim() || 'VND',
        note: String(o.note ?? '').trim(),
      };
    })
    .filter((it) => it.description || it.amount > 0);
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { items, total };
}

// ============================ TẠO ============================
paymentRoutes.post('/', async (c) => {
  const user = c.get('user')!;
  if (!user.deptCode) throw unprocessable('Tài khoản chưa được gán phòng ban.', 'no_department');
  const b = await c.req.parseBody();
  // Người thanh toán = chính user đang đăng nhập (tên + chức danh M365), không lấy từ form.
  const payee_name = user.name;
  const payee_title = user.jobTitle ?? null;
  const purpose = String(b.purpose ?? '').trim();
  if (!purpose) throw badRequest('Thiếu mục đích thanh toán');
  const { items, total } = parseItems(b.items_json);
  const amount_words = String(b.amount_words ?? '').trim() || readVndWords(total);

  const code = await nextPaymentCode(c.env.DB, user.deptCode);
  const ins = await c.env.DB.prepare(
    `INSERT INTO payment_request
       (code, status, current_stage, creator_user_id, creator_email, creator_name, dept_code,
        payee_name, payee_title, purpose, total_amount, amount_words,
        pay_form, receive_form, bank_account_name, bank_account_no, bank_name, transfer_note)
     VALUES (?1,'draft',0,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
     RETURNING id`,
  )
    .bind(
      code,
      user.id,
      user.email,
      user.name,
      user.deptCode,
      payee_name,
      payee_title,
      purpose,
      total,
      amount_words,
      String(b.pay_form ?? '').trim() || null,
      String(b.receive_form ?? 'CK').trim() || null,
      String(b.bank_account_name ?? '').trim() || null,
      String(b.bank_account_no ?? '').trim() || null,
      String(b.bank_name ?? '').trim() || null,
      String(b.transfer_note ?? '').trim() || null,
    )
    .first<{ id: number }>();
  const id = ins!.id;
  await insertItems(c.env.DB, id, items);
  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1, 0, ?2, 'create', ?3, ?4, ?5)`,
  )
    .bind(id, prStages(null)[0], user.email, user.name, 'Tạo phiếu')
    .run();
  return c.redirect(`/payments/${id}`);
});

async function insertItems(
  db: AppEnv['Bindings']['DB'],
  prId: number,
  items: Array<{ description: string; unit_price: number; qty: number; amount: number; currency: string; note: string }>,
) {
  let seq = 1;
  for (const it of items) {
    await db
      .prepare(
        `INSERT INTO payment_request_item (pr_id, seq, description, unit_price, qty, amount, currency, note)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
      )
      .bind(prId, seq++, it.description || null, it.unit_price, it.qty, it.amount, it.currency, it.note || null)
      .run();
  }
}

// ============================ SỬA ============================
paymentRoutes.post('/:id{[0-9]+}', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await c.env.DB.prepare(`SELECT creator_email, status FROM payment_request WHERE id = ?1`)
    .bind(id)
    .first<{ creator_email: string; status: string }>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  if (pr.creator_email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden('Bạn không phải người tạo phiếu này');
  if (pr.status !== 'draft') throw unprocessable('Phiếu đã trình ký, không sửa được.');

  const b = await c.req.parseBody();
  // Người thanh toán = user đang đăng nhập (= người tạo), lấy từ session.
  const payee_name = user.name;
  const payee_title = user.jobTitle ?? null;
  const purpose = String(b.purpose ?? '').trim();
  if (!purpose) throw badRequest('Thiếu mục đích thanh toán');
  const { items, total } = parseItems(b.items_json);
  const amount_words = String(b.amount_words ?? '').trim() || readVndWords(total);

  await c.env.DB.prepare(
    `UPDATE payment_request SET
       payee_name=?2, payee_title=?3, purpose=?4, total_amount=?5, amount_words=?6,
       pay_form=?7, receive_form=?8, bank_account_name=?9, bank_account_no=?10, bank_name=?11,
       transfer_note=?12, updated_at=iso_now()
     WHERE id=?1`,
  )
    .bind(
      id,
      payee_name,
      payee_title,
      purpose,
      total,
      amount_words,
      String(b.pay_form ?? '').trim() || null,
      String(b.receive_form ?? 'CK').trim() || null,
      String(b.bank_account_name ?? '').trim() || null,
      String(b.bank_account_no ?? '').trim() || null,
      String(b.bank_name ?? '').trim() || null,
      String(b.transfer_note ?? '').trim() || null,
    )
    .run();
  await c.env.DB.prepare(`DELETE FROM payment_request_item WHERE pr_id = ?1`).bind(id).run();
  await insertItems(c.env.DB, id, items);
  return c.redirect(`/payments/${id}`);
});

// ============================ CHI TIẾT ============================
paymentRoutes.get('/:id{[0-9]+}', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await c.env.DB.prepare(`SELECT * FROM payment_request WHERE id = ?1`).bind(id).first<PrRow>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  const items =
    (
      await c.env.DB.prepare(
        `SELECT seq, description, unit_price, qty, amount, currency, note
           FROM payment_request_item WHERE pr_id = ?1 ORDER BY seq ASC`,
      )
        .bind(id)
        .all<PrItem>()
    ).results ?? [];
  const log =
    (
      await c.env.DB.prepare(
        `SELECT stage_index, stage_name, kind, actor_email, actor_name, note, acted_at
           FROM payment_request_stage_log WHERE pr_id = ?1 ORDER BY id ASC`,
      )
        .bind(id)
        .all<{ stage_index: number; stage_name: string; kind: string; actor_email: string; actor_name: string | null; note: string | null; acted_at: string }>()
    ).results ?? [];

  // Người ký Documenso (nếu đã gửi ký) — để hiển thị trạng thái từng người.
  const signers =
    (
      await c.env.DB.prepare(
        `SELECT role, email, name, signed_at FROM payment_request_signer WHERE pr_id = ?1 ORDER BY id ASC`,
      )
        .bind(id)
        .all<{ role: string; email: string; name: string | null; signed_at: string | null }>()
    ).results ?? [];

  // Prefill 4 người ký cho form "Gửi ký điện tử" (best-effort — không chặn nếu thiếu cấu hình).
  let prefill: SignPrefill | null = null;
  if (pr.status === 'draft' && eSignAvailable(c.env)) {
    const pick = async (fn: () => Promise<Approver>): Promise<Approver | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };
    const [manager, ksnb, bod] = await Promise.all([
      pick(() => getDeptManager(c.env, pr.dept_code)),
      pick(() => getActiveIc(c.env)),
      pick(() => getActiveBod(c.env)),
    ]);
    prefill = { manager, ksnb, bod };
  }

  return c.html(page({ title: pr.code ?? 'Đề nghị TT', user, body: detailBody(user, pr, items, log, signers, prefill, eSignAvailable(c.env)) }));
});

type SignPrefill = { manager: Approver | null; ksnb: Approver | null; bod: Approver | null };

// Card "Gửi ký điện tử" — 4 người ký prefill (sửa được), Kế toán nhập tay.
function sendSignCard(pr: PrRow, prefill: SignPrefill | null) {
  const row = (
    role: string,
    label: string,
    ap: Approver | null,
    editableName = false,
  ) => html`<div class="grid grid-cols-12 gap-2 items-center">
    <div class="col-span-3 text-sm text-slate-600">${label}</div>
    <input name="${role}_name" value="${esc(ap?.name ?? '')}" placeholder="Họ tên"
      class="col-span-4 px-2 py-1.5 border ${editableName ? 'border-slate-300' : 'border-slate-200 bg-slate-50'} rounded-md text-sm" />
    <input name="${role}_email" value="${esc(ap?.email ?? '')}" placeholder="email@anvietenergy.com" type="email" required
      class="col-span-5 px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
  </div>`;
  return html`<div class="bg-blue-50/60 rounded-xl ring-1 ring-blue-200 p-5 space-y-3">
    <div class="text-sm font-semibold text-blue-900">✍️ Gửi ký điện tử (Documenso)</div>
    <p class="text-xs text-slate-500 -mt-1">Mỗi người sẽ nhận email mời ký, đăng nhập M365 để ký. Thứ tự: Trưởng bộ phận → (KSNB &amp; Kế toán, bên nào trước cũng được) → BOD.</p>
    <form method="post" action="/payments/${String(pr.id)}/send-sign" class="space-y-2"
      onsubmit="return confirm('Gửi phiếu đi ký điện tử? Sau khi gửi sẽ không sửa nội dung được nữa.')">
      ${row('manager', 'Trưởng bộ phận', prefill?.manager ?? null)}
      ${row('ksnb', 'KSNB', prefill?.ksnb ?? null)}
      ${row('acct', 'Kế toán', null, true)}
      ${row('bod', 'BOD', prefill?.bod ?? null)}
      <div class="pt-2">
        <button class="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">Gửi đi ký điện tử →</button>
      </div>
    </form>
  </div>`;
}

function detailBody(
  user: { email: string },
  pr: PrRow,
  items: PrItem[],
  log: Array<{ stage_index: number; stage_name: string; kind: string; actor_email: string; actor_name: string | null; note: string | null; acted_at: string }>,
  signers: Array<{ role: string; email: string; name: string | null; signed_at: string | null }> = [],
  prefill: SignPrefill | null = null,
  eSign = false,
) {
  const stage = Number(pr.current_stage);
  const stages = prStages(pr.mid_order);
  const cancelled = pr.status === 'cancelled';
  const isCreator = pr.creator_email.toLowerCase() === user.email.toLowerCase();
  // Phiếu đã gửi ký điện tử qua Documenso → chặng do webhook lái, KHÓA nút chỉnh tay.
  const hasEnvelope = !!pr.documenso_envelope_id;
  const signCompleted = pr.documenso_status === 'COMPLETED';
  const canAdvance = !cancelled && !hasEnvelope && stage < LAST_STAGE;
  // Sau Trưởng bộ phận ký: hồ sơ đi KSNB hoặc Kế toán tuỳ bên nào nhận trước.
  const pickMid = canAdvance && stage === 1;
  const nextStage = stage + 1;
  const roleLabel: Record<string, string> = { manager: 'Trưởng bộ phận', ksnb: 'KSNB', acct: 'Kế toán', bod: 'BOD' };

  const kindLabel: Record<string, string> = {
    create: 'Tạo phiếu',
    advance: 'Chuyển chặng',
    revert: 'Lùi chặng',
    note: 'Ghi chú',
    cancel: 'Huỷ phiếu',
  };

  return html`
    <div class="max-w-4xl mx-auto space-y-5">
      <div class="flex items-center justify-between">
        <a href="/payments" class="text-sm text-slate-500 hover:text-slate-700">← Danh sách</a>
        <div class="flex items-center gap-2">
          ${pr.status === 'draft' && isCreator && !hasEnvelope
            ? html`<a href="/payments/${String(pr.id)}/edit" class="px-3 py-1.5 text-sm ring-1 ring-slate-300 rounded-md hover:bg-slate-50">✎ Sửa</a>`
            : ''}
          ${pr.signed_pdf_key
            ? html`<a href="/payments/${String(pr.id)}/signed.pdf" target="_blank" class="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded-md hover:bg-emerald-800">⬇ PDF đã ký</a>`
            : ''}
          <a href="/payments/${String(pr.id)}/print" target="_blank" class="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-md hover:bg-slate-700">🖨 In phiếu</a>
        </div>
      </div>

      <div class="bg-white rounded-xl ring-1 ring-slate-200 p-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="text-xs uppercase tracking-wide text-slate-400">Giấy đề nghị thanh toán</div>
            <div class="text-2xl font-bold text-blue-900">${esc(pr.code ?? '(nháp)')}</div>
            <div class="text-xs text-slate-400 mt-0.5">Tạo bởi ${esc(pr.creator_name ?? pr.creator_email)} · ${vnDisplay(pr.created_at)}</div>
          </div>
          <div>${prStatusBadge(pr.status, stage, stages)}</div>
        </div>

        <!-- Stepper lớn -->
        <div class="mb-5 p-3 bg-slate-50 rounded-lg">${stepper(stage, cancelled, stages)}</div>

        <div class="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><span class="text-slate-500">Người thanh toán:</span> <b>${esc(pr.payee_name)}</b></div>
          <div><span class="text-slate-500">Chức danh:</span> ${esc(pr.payee_title ?? '')}</div>
          <div class="md:col-span-2"><span class="text-slate-500">Mục đích:</span> ${esc(pr.purpose ?? '')}</div>
        </div>

        <table class="w-full text-sm mt-4 ring-1 ring-slate-200 rounded">
          <thead class="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th class="px-2 py-1.5 text-left">Diễn giải</th>
              <th class="px-2 py-1.5 text-right">Đơn giá</th>
              <th class="px-2 py-1.5 text-right">SL</th>
              <th class="px-2 py-1.5 text-right">Số tiền</th>
              <th class="px-2 py-1.5 text-left">Loại</th>
              <th class="px-2 py-1.5 text-left">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${items.length
              ? items.map(
                  (it) => html`<tr class="border-t border-slate-100">
                    <td class="px-2 py-1.5">${esc(it.description ?? '')}</td>
                    <td class="px-2 py-1.5 text-right">${money(it.unit_price)}</td>
                    <td class="px-2 py-1.5 text-right">${esc(it.qty ?? '')}</td>
                    <td class="px-2 py-1.5 text-right font-medium">${money(it.amount)}</td>
                    <td class="px-2 py-1.5">${esc(it.currency ?? '')}</td>
                    <td class="px-2 py-1.5 text-slate-500">${esc(it.note ?? '')}</td>
                  </tr>`,
                )
              : html`<tr><td colspan="6" class="px-2 py-3 text-center text-slate-400">(Chưa có dòng nào)</td></tr>`}
          </tbody>
          <tfoot>
            <tr class="border-t border-slate-200 bg-slate-50">
              <td colspan="3" class="px-2 py-2 text-right font-medium">Tổng cộng</td>
              <td class="px-2 py-2 text-right font-bold text-blue-900">${money(pr.total_amount)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
        <p class="text-sm text-slate-600 mt-2">Bằng chữ: <i>${esc(pr.amount_words ?? '')}</i></p>

        <div class="grid md:grid-cols-2 gap-x-6 gap-y-1 text-sm mt-4 pt-4 border-t border-slate-100">
          <div><span class="text-slate-500">Hình thức TT:</span> ${esc(pr.pay_form ?? '')}</div>
          <div><span class="text-slate-500">Nhận tiền:</span> ${esc(pr.receive_form ?? '')}</div>
          <div><span class="text-slate-500">Chủ TK:</span> ${esc(pr.bank_account_name ?? '')}</div>
          <div><span class="text-slate-500">Số TK:</span> ${esc(pr.bank_account_no ?? '')}</div>
          <div><span class="text-slate-500">Ngân hàng:</span> ${esc(pr.bank_name ?? '')}</div>
          <div><span class="text-slate-500">Nội dung CK:</span> ${esc(pr.transfer_note ?? '')}</div>
        </div>
      </div>

      <!-- Hành động trình ký -->
      ${cancelled
        ? html`<div class="bg-slate-100 text-slate-500 rounded-xl p-4 text-sm">Phiếu đã huỷ.</div>`
        : hasEnvelope
          ? html`<div class="bg-white rounded-xl ring-1 ring-slate-200 p-5 space-y-4">
              <div class="flex items-center justify-between">
                <div class="text-sm font-semibold text-slate-700">✍️ Ký điện tử (Documenso)</div>
                <span class="text-xs px-2 py-0.5 rounded-full ${signCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${signCompleted ? 'Đã ký xong' : 'Đang chờ ký'}</span>
              </div>
              <ul class="space-y-1.5 text-sm">
                ${signers.map(
                  (s) => html`<li class="flex items-center gap-2">
                    <span class="${s.signed_at ? 'text-emerald-600' : 'text-slate-300'}">${s.signed_at ? '✓' : '⏳'}</span>
                    <span class="font-medium text-slate-700 w-32">${esc(roleLabel[s.role] ?? s.role)}</span>
                    <span class="text-slate-500">${esc(s.name ?? s.email)}</span>
                    <span class="text-xs text-slate-400">${s.signed_at ? `· ký ${vnDisplay(s.signed_at)}` : '· chờ ký'}</span>
                  </li>`,
                )}
              </ul>
              <p class="text-xs text-slate-400">Tiến độ chặng tự cập nhật khi có người ký — không chỉnh tay.</p>
              <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                ${signCompleted && stage < LAST_STAGE
                  ? html`<form method="post" action="/payments/${String(pr.id)}/advance">
                      <button class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-sm font-semibold">✓ Đánh dấu Đã thanh toán</button>
                    </form>`
                  : ''}
                ${isCreator
                  ? html`<form method="post" action="/payments/${String(pr.id)}/cancel" onsubmit="return confirm('Huỷ phiếu này? (sẽ không tự huỷ bên Documenso)')">
                      <button class="px-3 py-1.5 text-sm text-rose-600 ring-1 ring-rose-200 rounded-md hover:bg-rose-50">Huỷ phiếu</button>
                    </form>`
                  : ''}
              </div>
            </div>`
          : html`
            ${eSign && pr.status === 'draft' && isCreator ? sendSignCard(pr, prefill) : ''}
            <div class="bg-white rounded-xl ring-1 ring-slate-200 p-5 space-y-4">
              <div class="text-sm font-semibold text-slate-700">Cập nhật trình ký${eSign ? ' (thủ công / hồ sơ giấy)' : ''}</div>
              <div class="flex flex-wrap gap-3 items-end">
                ${canAdvance
                  ? html`<form method="post" action="/payments/${String(pr.id)}/advance" class="flex flex-wrap gap-2 items-end">
                      <label class="flex flex-col text-xs text-slate-500 gap-1">Ghi chú (ai đang giữ hồ sơ / tình trạng)
                        <input name="note" placeholder="vd: đã trình, đang ở bàn KSNB" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm w-80" />
                      </label>
                      ${pickMid
                        ? html`<button name="to" value="ksnb" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-sm font-semibold">
                              ✓ Đã xong "${esc(stages[stage])}" → KSNB ký
                            </button>
                            <button name="to" value="acct" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-sm font-semibold">
                              ✓ Đã xong "${esc(stages[stage])}" → Kế toán ký
                            </button>`
                        : html`<button class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-sm font-semibold">
                            ✓ ${nextStage >= LAST_STAGE ? 'Đánh dấu Đã thanh toán' : `Đã xong "${esc(stages[stage])}" → ${esc(stages[nextStage])}`}
                          </button>`}
                    </form>`
                  : html`<div class="text-sm text-emerald-700 font-medium">✓ Hồ sơ đã hoàn tất (Đã thanh toán).</div>`}
              </div>
              <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <form method="post" action="/payments/${String(pr.id)}/note" class="flex gap-2 items-center">
                  <input name="note" placeholder="Thêm ghi chú vị trí hiện tại" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm w-72" required />
                  <button class="px-3 py-1.5 text-sm ring-1 ring-slate-300 rounded-md hover:bg-slate-50">Ghi chú</button>
                </form>
                ${stage > 0
                  ? html`<form method="post" action="/payments/${String(pr.id)}/revert" onsubmit="return confirm('Lùi về chặng trước?')">
                      <button class="px-3 py-1.5 text-sm text-amber-700 ring-1 ring-amber-200 rounded-md hover:bg-amber-50">↶ Lùi chặng</button>
                    </form>`
                  : ''}
                ${isCreator
                  ? html`<form method="post" action="/payments/${String(pr.id)}/cancel" onsubmit="return confirm('Huỷ phiếu này?')">
                      <button class="px-3 py-1.5 text-sm text-rose-600 ring-1 ring-rose-200 rounded-md hover:bg-rose-50">Huỷ phiếu</button>
                    </form>`
                  : ''}
              </div>
            </div>`}

      <!-- Lịch sử trình ký -->
      <div class="bg-white rounded-xl ring-1 ring-slate-200 p-5">
        <div class="text-sm font-semibold text-slate-700 mb-3">Lịch sử trình ký</div>
        <ol class="space-y-2">
          ${log.length
            ? log.map(
                (e) => html`<li class="flex gap-3 text-sm">
                  <span class="text-slate-400 whitespace-nowrap">${vnDisplay(e.acted_at)}</span>
                  <span class="font-medium text-slate-700 whitespace-nowrap">${esc(kindLabel[e.kind] ?? e.kind)}: ${esc(e.stage_name)}</span>
                  <span class="text-slate-500">${esc(e.note ?? '')} <span class="text-slate-400">— ${esc(e.actor_name ?? e.actor_email)}</span></span>
                </li>`,
              )
            : html`<li class="text-slate-400 text-sm">Chưa có hoạt động.</li>`}
        </ol>
      </div>
    </div>`;
}

// ============================ CHUYỂN / LÙI / GHI CHÚ / HUỶ ============================
async function loadForAction(c: Context<AppEnv>, id: number) {
  const pr = await c.env.DB.prepare(`SELECT id, status, current_stage, mid_order, creator_email FROM payment_request WHERE id = ?1`)
    .bind(id)
    .first<{ id: number; status: string; current_stage: number; mid_order: string | null; creator_email: string }>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  if (pr.status === 'cancelled') throw unprocessable('Phiếu đã huỷ.');
  return pr;
}

paymentRoutes.post('/:id{[0-9]+}/advance', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await loadForAction(c, id);
  if (pr.current_stage >= LAST_STAGE) throw unprocessable('Phiếu đã ở chặng cuối.');
  const next = pr.current_stage + 1;
  const b = await c.req.parseBody();
  const note = String(b.note ?? '').trim();
  // Rời chặng Trưởng bộ phận: phải chọn hồ sơ đi KSNB hay Kế toán trước.
  let midOrder = pr.mid_order;
  if (pr.current_stage === 1) {
    const to = String(b.to ?? '');
    if (to !== 'ksnb' && to !== 'acct') throw badRequest('Chọn chuyển KSNB hay Kế toán trước.');
    midOrder = to;
  }
  const stages = prStages(midOrder);
  await c.env.DB.prepare(
    `UPDATE payment_request SET current_stage=?2, status=?3, mid_order=?4, updated_at=iso_now() WHERE id=?1`,
  )
    .bind(id, next, stageStatus(next), midOrder)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1,?2,?3,'advance',?4,?5,?6)`,
  )
    .bind(id, next, stages[next], user.email, user.name, note || null)
    .run();
  const ctx = await webAuditContext(c);
  await logAudit(c.env, {
    eventType: 'pr_advance',
    actorEmail: user.email,
    actorName: user.name,
    actorUserId: user.id,
    proposalId: id,
    step: stages[next],
    action: 'advance',
    channel: 'web',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    sessionRef: ctx.sessionRef,
    detail: JSON.stringify({ doc: 'payment_request', from: pr.current_stage, to: next, note }),
  });
  return c.redirect(`/payments/${id}`);
});

paymentRoutes.post('/:id{[0-9]+}/revert', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await loadForAction(c, id);
  if (pr.current_stage <= 0) throw unprocessable('Phiếu đang ở chặng đầu.');
  const prev = pr.current_stage - 1;
  // Lùi về trước cặp KSNB/Kế toán → bỏ lựa chọn thứ tự, lần chuyển sau chọn lại.
  const midOrder = prev <= 1 ? null : pr.mid_order;
  const stages = prStages(midOrder);
  await c.env.DB.prepare(
    `UPDATE payment_request SET current_stage=?2, status=?3, mid_order=?4, updated_at=iso_now() WHERE id=?1`,
  )
    .bind(id, prev, stageStatus(prev), midOrder)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1,?2,?3,'revert',?4,?5,?6)`,
  )
    .bind(id, prev, stages[prev], user.email, user.name, 'Lùi chặng')
    .run();
  return c.redirect(`/payments/${id}`);
});

paymentRoutes.post('/:id{[0-9]+}/note', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await loadForAction(c, id);
  const b = await c.req.parseBody();
  const note = String(b.note ?? '').trim();
  if (!note) throw badRequest('Thiếu nội dung ghi chú');
  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1,?2,?3,'note',?4,?5,?6)`,
  )
    .bind(id, pr.current_stage, prStages(pr.mid_order)[pr.current_stage], user.email, user.name, note)
    .run();
  return c.redirect(`/payments/${id}`);
});

paymentRoutes.post('/:id{[0-9]+}/cancel', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const pr = await loadForAction(c, id);
  if (pr.creator_email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden('Chỉ người tạo mới huỷ được phiếu');
  await c.env.DB.prepare(`UPDATE payment_request SET status='cancelled', updated_at=iso_now() WHERE id=?1`)
    .bind(id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1,?2,?3,'cancel',?4,?5,'Huỷ phiếu')`,
  )
    .bind(id, pr.current_stage, prStages(pr.mid_order)[pr.current_stage], user.email, user.name)
    .run();
  return c.redirect(`/payments/${id}`);
});

// ============================ GỬI KÝ ĐIỆN TỬ (DOCUMENSO) ============================
paymentRoutes.post('/:id{[0-9]+}/send-sign', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (!eSignAvailable(c.env))
    throw unprocessable('Chưa cấu hình ký điện tử (Documenso + Gotenberg).');
  const pr = await c.env.DB.prepare(`SELECT * FROM payment_request WHERE id = ?1`).bind(id).first<PrRow>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  if (pr.creator_email.toLowerCase() !== user.email.toLowerCase())
    throw forbidden('Chỉ người tạo mới gửi ký.');
  if (pr.status !== 'draft') throw unprocessable('Phiếu đã trình ký rồi.');
  if (pr.documenso_envelope_id) throw unprocessable('Phiếu đã gửi ký điện tử.');

  const b = await c.req.parseBody();
  // role → signingOrder + chặng danh nghĩa (KSNB/Kế toán cùng order 2 = ký song song).
  const roleDefs = [
    { role: 'manager' as const, order: 1, stage: 1 },
    { role: 'ksnb' as const, order: 2, stage: 2 },
    { role: 'acct' as const, order: 2, stage: 3 },
    { role: 'bod' as const, order: 3, stage: 4 },
  ];
  const signersInput = roleDefs.map((r) => ({
    ...r,
    email: String(b[`${r.role}_email`] ?? '').trim(),
    name: String(b[`${r.role}_name`] ?? '').trim(),
  }));
  for (const s of signersInput)
    if (!s.email) throw badRequest(`Thiếu email người ký (${s.role}).`);

  const items =
    (
      await c.env.DB.prepare(
        `SELECT seq, description, unit_price, qty, amount, currency, note
           FROM payment_request_item WHERE pr_id = ?1 ORDER BY seq ASC`,
      )
        .bind(id)
        .all<Record<string, unknown>>()
    ).results ?? [];

  // 1) Render PDF bản in → 2) tạo document Documenso (4 người ký + ô chữ ký inline).
  const pdf = await renderPaymentPdf(
    c.env,
    pr as unknown as Record<string, unknown>,
    items,
    { proposerName: pr.creator_name ?? '', managerName: signersInput[0]?.name ?? '' },
  );
  const dsSigners: DocumensoSigner[] = signersInput.map((s) => ({
    email: s.email,
    name: s.name || s.email,
    signingOrder: s.order,
    field: SIGN_FIELD_POS[s.role],
  }));
  const created = await createSignedDocument(c.env, {
    title: pr.code ?? `DNTT-${id}`,
    externalId: `pr-${id}`,
    pdf,
    signers: dsSigners,
  });

  // 3) Lưu map recipient → role/chặng (match recipient_id theo email).
  for (const s of signersInput) {
    const rec = created.recipients.find((r) => (r.email ?? '').toLowerCase() === s.email.toLowerCase());
    await c.env.DB.prepare(
      `INSERT INTO payment_request_signer (pr_id, role, stage_index, recipient_id, email, name)
       VALUES (?1,?2,?3,?4,?5,?6)`,
    )
      .bind(id, s.role, s.stage, rec?.id ?? null, s.email, s.name || null)
      .run();
  }

  // 4) Gắn envelope vào phiếu + chuyển sang chặng "Trưởng bộ phận ký".
  await c.env.DB.prepare(
    `UPDATE payment_request SET documenso_document_id=?2, documenso_envelope_id=?3,
       documenso_status='PENDING', sign_sent_at=?4, current_stage=1, status='in_progress', updated_at=iso_now()
     WHERE id=?1`,
  )
    .bind(id, created.documentId, created.envelopeId, nowIso())
    .run();

  // 5) Gửi mail mời ký.
  await distributeDocument(c.env, created.documentId);

  await c.env.DB.prepare(
    `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
     VALUES (?1,1,?2,'advance',?3,?4,?5)`,
  )
    .bind(id, prStages(null)[1], user.email, user.name, 'Gửi ký điện tử qua Documenso')
    .run();
  const ctx = await webAuditContext(c);
  await logAudit(c.env, {
    eventType: 'pr_send_sign',
    actorEmail: user.email,
    actorName: user.name,
    actorUserId: user.id,
    proposalId: id,
    action: 'advance',
    channel: 'web',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    sessionRef: ctx.sessionRef,
    detail: JSON.stringify({ doc: 'payment_request', documentId: created.documentId, envelopeId: created.envelopeId }),
  });
  return c.redirect(`/payments/${id}`);
});

// Tải bản PDF đã ký (lưu trong FILES sau khi Documenso báo completed).
paymentRoutes.get('/:id{[0-9]+}/signed.pdf', async (c) => {
  const id = Number(c.req.param('id'));
  const pr = await c.env.DB.prepare(`SELECT signed_pdf_key, code FROM payment_request WHERE id = ?1`)
    .bind(id)
    .first<{ signed_pdf_key: string | null; code: string | null }>();
  if (!pr?.signed_pdf_key) throw notFound('Chưa có bản PDF đã ký');
  const bytes = await c.env.FILES.get(pr.signed_pdf_key);
  if (!bytes) throw notFound('File không tồn tại trên lưu trữ');
  const safeName = `${(pr.code ?? `DNTT-${id}`).replace(/[\r\n"\\]/g, '_')}-signed.pdf`;
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
    },
  });
});

// ============================ IN ============================
paymentRoutes.get('/:id{[0-9]+}/print', async (c) => {
  const id = Number(c.req.param('id'));
  const pr = await c.env.DB.prepare(`SELECT * FROM payment_request WHERE id = ?1`).bind(id).first<Record<string, unknown>>();
  if (!pr) throw notFound('Phiếu không tồn tại');
  const items =
    (
      await c.env.DB.prepare(
        `SELECT seq, description, unit_price, qty, amount, currency, note
           FROM payment_request_item WHERE pr_id = ?1 ORDER BY seq ASC`,
      )
        .bind(id)
        .all<Record<string, unknown>>()
    ).results ?? [];
  // Trưởng bộ phận = manager đã map theo phòng người tạo (lookup mềm — không chặn in nếu chưa map).
  const mgr = await c.env.DB.prepare(
    `SELECT user_name AS name FROM department_managers
      WHERE dept_code = ?1 AND is_active = 1 ORDER BY id ASC LIMIT 1`,
  )
    .bind(String(pr.dept_code ?? ''))
    .first<{ name: string }>();
  return c.html(
    paymentPrintPage(pr, items, {
      proposerName: String(pr.creator_name ?? ''),
      managerName: mgr?.name ?? '',
    }),
  );
});

// Theo dõi HÓA ĐƠN NCC + công nợ. Mail HĐĐT → ingest tạo dòng 'pending' →
// người dùng xác nhận (nhà máy / NCC / phiếu) → 'confirmed' → theo dõi thanh toán.
// Trang server-render (Tailwind, form POST). Admin: map MST bên mua → nhà máy.

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../types';
import { page } from '../web/layout';
import { requireAdmin } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { nowIso, vnDisplay, daysSinceDate } from '../lib/time';
import { runInvoiceIngest } from '../lib/invoice-ingest';

export const invoiceRoutes = new Hono<AppEnv>();

// Bắt buộc đăng nhập cho toàn bộ /invoices.
invoiceRoutes.use('*', async (c, next) => {
  if (!c.get('user')) return c.redirect('/auth/login?return_to=/invoices');
  await next();
});

// ===== Helpers hiển thị =====
const vnd = new Intl.NumberFormat('vi-VN');
const money = (n: unknown): string => (n == null ? '' : vnd.format(Number(n)));
const pct = (n: unknown): string => (n == null ? '' : `${Number(n) * 100}%`);
const esc = (s: unknown): string => String(s ?? '');

type InvoiceRow = {
  id: number;
  status: string;
  provider: string | null;
  invoice_url: string | null;
  serial: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  seller_tax_code: string | null;
  seller_name: string | null;
  buyer_tax_code: string | null;
  buyer_name: string | null;
  branch: string | null;
  supplier_short: string | null;
  subtotal: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  total: number | null;
  payment_status: string;
  paid_amount: number | null;
  credit_term_days: number | null;
  proposal_code: string | null;
  doc_submit_date: string | null;
  receive_date: string | null;
  note: string | null;
  amount_words: string | null;
  seller_address: string | null;
  buyer_address: string | null;
  tax_auth_code: string | null;
  lookup_code: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
};

// Cột "TT THANH TOÁN" KHÔNG nhập tay — suy ra từ "Đã TT" (paid) so với "Thành tiền" (total):
//   paid >= total (total>0)  → 'paid'    (Đã thanh toán)
//   0 < paid < total         → 'partial' (Đã tạm ứng)
//   paid <= 0 / chưa nhập    → 'unpaid'  (Đang thanh toán)
function derivePayStatus(total: unknown, paid: unknown): 'unpaid' | 'partial' | 'paid' {
  const t = Number(total ?? 0);
  const p = Number(paid ?? 0);
  if (p <= 0) return 'unpaid';
  if (t > 0 && p >= t) return 'paid';
  return 'partial';
}

// Cột "TT THANH TOÁN" của sổ Excel: Đang thanh toán / Đã tạm ứng / Đã thanh toán.
function payBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    unpaid: { label: 'Đang thanh toán', cls: 'bg-rose-100 text-rose-700' },
    partial: { label: 'Đã tạm ứng', cls: 'bg-amber-100 text-amber-800' },
    paid: { label: 'Đã thanh toán', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}">${m.label}</span>`;
}

// Cột "TÌNH TRẠNG" (L) + "NGÀY QUÁ HẠN" (M) — tính từ ngày HĐ + số ngày được nợ.
//   hạn = ngày HĐ + credit_term_days; quá hạn khi (hôm nay − ngày HĐ) > số ngày nợ.
// Trả về { kind, overdueDays } để render badge + số ngày.
function dueStatus(r: {
  total: number | null;
  paid_amount: number | null;
  invoice_date: string | null;
  credit_term_days: number | null;
}) {
  if (derivePayStatus(r.total, r.paid_amount) === 'paid') return { kind: 'paid' as const, overdueDays: null };
  const since = daysSinceDate(r.invoice_date);
  if (since == null || r.credit_term_days == null) return { kind: 'unknown' as const, overdueDays: null };
  const overdue = since - r.credit_term_days; // > 0 = đã quá hạn bấy nhiêu ngày
  return overdue > 0
    ? { kind: 'overdue' as const, overdueDays: overdue }
    : { kind: 'in_term' as const, overdueDays: overdue };
}

function dueBadge(d: ReturnType<typeof dueStatus>) {
  const map = {
    paid: { label: 'Đã thanh toán', cls: 'bg-emerald-100 text-emerald-700' },
    overdue: { label: 'Quá hạn', cls: 'bg-rose-100 text-rose-700' },
    in_term: { label: 'Trong hạn', cls: 'bg-blue-100 text-blue-800' },
    unknown: { label: '—', cls: 'bg-slate-100 text-slate-500' },
  } as const;
  const m = map[d.kind];
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}">${m.label}</span>`;
}

function recBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Chờ xác nhận', cls: 'bg-amber-100 text-amber-800' },
    confirmed: { label: 'Đã xác nhận', cls: 'bg-blue-100 text-blue-800' },
    rejected: { label: 'Bỏ qua', cls: 'bg-slate-200 text-slate-600' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}">${m.label}</span>`;
}

// ===== Danh sách =====
invoiceRoutes.get('/', async (c) => {
  const user = c.get('user')!;
  const status = c.req.query('status') ?? 'all';
  const branch = c.req.query('branch') ?? '';
  const q = (c.req.query('q') ?? '').trim();

  const conds: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  if (status !== 'all') {
    conds.push(`status = ?${++n}`);
    params.push(status);
  }
  if (branch) {
    conds.push(`branch = ?${++n}`);
    params.push(branch);
  }
  if (q) {
    conds.push(`(LOWER(invoice_no) LIKE ?${++n} OR LOWER(seller_name) LIKE ?${n} OR LOWER(supplier_short) LIKE ?${n})`);
    params.push(`%${q.toLowerCase()}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  // Toàn bộ HĐ khớp lọc (không LIMIT) — để dựng bảng + tính KPI công nợ giống sheet.
  const rows =
    (
      await c.env.DB.prepare(
        `SELECT id, status, serial, invoice_no, invoice_date, seller_name, supplier_short, branch,
                subtotal, vat_amount, total, payment_status, paid_amount, credit_term_days, proposal_code
           FROM supplier_invoice ${where} ORDER BY supplier_short, seller_name, invoice_date`,
      )
        .bind(...params)
        .all<InvoiceRow>()
    ).results ?? [];

  // KPI header (sổ Excel: TỔNG công nợ chưa trả + QUÁ HẠN). Tính trên tập đang lọc,
  // loại HĐ đã bỏ qua (rejected) khỏi tổng nợ.
  let totalOutstanding = 0;
  let totalOverdue = 0;
  for (const r of rows) {
    if (r.status === 'rejected') continue;
    const outstanding = Number(r.total ?? 0) - Number(r.paid_amount ?? 0);
    if (outstanding <= 0) continue;
    totalOutstanding += outstanding;
    if (dueStatus(r).kind === 'overdue') totalOverdue += outstanding;
  }

  const branches =
    (await c.env.DB.prepare(`SELECT name FROM branch WHERE active = 1 ORDER BY sort_order`).all<{ name: string }>())
      .results ?? [];
  const pendingCount =
    (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM supplier_invoice WHERE status = 'pending'`).first<{ n: number }>())
      ?.n ?? 0;

  return c.html(
    page({
      title: 'Hóa đơn NCC',
      user,
      wide: true,
      body: listBody(rows, { status, branch, q, branches, pendingCount, totalOutstanding, totalOverdue }),
    }),
  );
});

function listBody(
  rows: InvoiceRow[],
  f: {
    status: string;
    branch: string;
    q: string;
    branches: { name: string }[];
    pendingCount: number;
    totalOutstanding: number;
    totalOverdue: number;
  },
) {
  const tab = (key: string, label: string) =>
    html`<a href="/invoices?status=${key}"
      class="px-3 py-1.5 rounded-md text-sm ${f.status === key ? 'bg-blue-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}">${label}</a>`;
  const kpi = (label: string, value: string, cls: string) =>
    html`<div class="bg-white rounded-lg ring-1 ring-slate-200 px-4 py-3">
      <div class="text-xs text-slate-400 uppercase tracking-wide">${label}</div>
      <div class="text-xl font-bold ${cls}">${value}</div>
    </div>`;
  return html`
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold text-slate-800">🧾 Hóa đơn NCC — Theo dõi công nợ ${f.pendingCount > 0 ? html`<span class="ml-2 align-middle text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">${String(f.pendingCount)} chờ xác nhận</span>` : ''}</h1>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
      ${kpi('Tổng công nợ', money(f.totalOutstanding), 'text-blue-900')}
      ${kpi('Quá hạn', money(f.totalOverdue), 'text-rose-600')}
      ${kpi('Ngày cập nhật', vnDisplay(nowIso()).slice(0, 10), 'text-slate-700')}
    </div>
    <div class="flex flex-wrap gap-2 mb-3">
      ${tab('all', 'Tất cả')} ${tab('pending', 'Chờ xác nhận')} ${tab('confirmed', 'Đã xác nhận')} ${tab('rejected', 'Bỏ qua')}
    </div>
    <form method="get" action="/invoices" class="flex flex-wrap gap-2 mb-4 items-end">
      <input type="hidden" name="status" value="${f.status}" />
      <label class="flex flex-col text-xs text-slate-500 gap-1">Nhà máy
        <select name="branch" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm">
          <option value="">— Tất cả —</option>
          ${f.branches.map((b) => html`<option value="${b.name}" ${f.branch === b.name ? 'selected' : ''}>${b.name}</option>`)}
        </select>
      </label>
      <label class="flex flex-col text-xs text-slate-500 gap-1">Tìm (số HĐ / NCC)
        <input type="text" name="q" value="${f.q}" placeholder="vd 632 hoặc H&T" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
      </label>
      <button class="px-4 py-1.5 bg-blue-900 text-white rounded-md text-sm">Lọc</button>
    </form>
    ${rows.length === 0
      ? html`<div class="text-center text-slate-400 bg-white rounded-lg ring-1 ring-slate-200 py-12">Chưa có hóa đơn.</div>`
      : html`<div class="overflow-x-auto bg-white rounded-lg ring-1 ring-slate-200">
        <table class="w-full text-sm whitespace-nowrap">
          <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th class="text-right px-2 py-2">STT</th>
              <th class="text-center px-2 py-2">TT thanh toán</th>
              <th class="text-left px-2 py-2">Nhà máy</th>
              <th class="text-left px-2 py-2">Nhà cung cấp</th>
              <th class="text-left px-2 py-2">Số HĐ</th>
              <th class="text-left px-2 py-2">Ngày HĐ</th>
              <th class="text-right px-2 py-2">Thành tiền</th>
              <th class="text-right px-2 py-2">Đã TT</th>
              <th class="text-right px-2 py-2">Chưa TT</th>
              <th class="text-center px-2 py-2">Công nợ (ngày)</th>
              <th class="text-center px-2 py-2">Tình trạng</th>
              <th class="text-right px-2 py-2">Quá hạn (ngày)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const outstanding = Number(r.total ?? 0) - Number(r.paid_amount ?? 0);
              const d = dueStatus(r);
              return html`<tr class="border-t border-slate-100 hover:bg-blue-50/40 ${r.status === 'rejected' ? 'opacity-50' : ''}">
              <td class="px-2 py-2 text-right text-slate-400">${String(i + 1)}</td>
              <td class="px-2 py-2 text-center">${payBadge(derivePayStatus(r.total, r.paid_amount))}</td>
              <td class="px-2 py-2">${r.branch ? esc(r.branch) : html`<span class="text-rose-500 text-xs">chưa gán</span>`}</td>
              <td class="px-2 py-2">${esc(r.supplier_short ?? r.seller_name)}</td>
              <td class="px-2 py-2 text-slate-600">
                <a href="/invoices/${String(r.id)}" class="text-blue-700 hover:underline"><b>${esc(r.invoice_no)}</b></a>
                ${r.status === 'pending' ? html` <span class="text-amber-600 text-xs">●</span>` : ''}
              </td>
              <td class="px-2 py-2">${esc(r.invoice_date)}</td>
              <td class="px-2 py-2 text-right font-medium">${money(r.total)}</td>
              <td class="px-2 py-2 text-right text-emerald-700">${r.paid_amount ? money(r.paid_amount) : ''}</td>
              <td class="px-2 py-2 text-right ${outstanding > 0 ? 'text-rose-600 font-medium' : 'text-slate-300'}">${outstanding > 0 ? money(outstanding) : '0'}</td>
              <td class="px-2 py-2 text-center text-slate-600">${r.credit_term_days == null ? '—' : String(r.credit_term_days)}</td>
              <td class="px-2 py-2 text-center">${dueBadge(d)}</td>
              <td class="px-2 py-2 text-right ${d.kind === 'overdue' ? 'text-rose-600 font-medium' : 'text-slate-400'}">${d.overdueDays != null && d.overdueDays > 0 ? String(d.overdueDays) : ''}</td>
            </tr>`;
            })}
          </tbody>
        </table>
      </div>`}
    <p class="text-xs text-slate-400 mt-3">${String(rows.length)} hóa đơn · ● = chờ xác nhận · tự động đọc từ mail HĐĐT về hộp thư chung.</p>`;
}

// ===== Chi tiết + xác nhận =====
invoiceRoutes.get('/:id{[0-9]+}', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const inv = await c.env.DB.prepare(`SELECT * FROM supplier_invoice WHERE id = ?1`).bind(id).first<InvoiceRow>();
  if (!inv) throw notFound('Hóa đơn không tồn tại');
  const lines =
    (
      await c.env.DB.prepare(
        `SELECT seq, item_name, unit, qty, unit_price, vat_rate, amount
           FROM supplier_invoice_line WHERE invoice_id = ?1 ORDER BY seq`,
      )
        .bind(id)
        .all<{ seq: number; item_name: string; unit: string; qty: number; unit_price: number; vat_rate: number; amount: number }>()
    ).results ?? [];
  const branches =
    (await c.env.DB.prepare(`SELECT name FROM branch WHERE active = 1 ORDER BY sort_order`).all<{ name: string }>())
      .results ?? [];
  return c.html(page({ title: `HĐ ${esc(inv.invoice_no)}`, user, body: detailBody(inv, lines, branches) }));
});

function detailBody(
  inv: InvoiceRow,
  lines: { seq: number; item_name: string; unit: string; qty: number; unit_price: number; vat_rate: number; amount: number }[],
  branches: { name: string }[],
) {
  const field = (label: string, value: unknown) =>
    html`<div><div class="text-xs text-slate-400">${label}</div><div class="text-slate-800">${esc(value) || '—'}</div></div>`;
  return html`
    <div class="mb-4 flex items-center gap-3">
      <a href="/invoices" class="text-sm text-slate-500 hover:underline">← Danh sách</a>
      ${recBadge(inv.status)} ${payBadge(derivePayStatus(inv.total, inv.paid_amount))}
      ${inv.invoice_url ? html`<a href="${inv.invoice_url}" target="_blank" class="text-sm text-blue-600 hover:underline ml-auto">Xem HĐ gốc ↗</a>` : ''}
    </div>

    <div class="bg-white rounded-lg ring-1 ring-slate-200 p-5 mb-4">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h1 class="text-lg font-semibold text-slate-800">Hóa đơn GTGT</h1>
          <div class="text-sm text-slate-500">Ký hiệu <b>${esc(inv.serial)}</b> · Số <b>${esc(inv.invoice_no)}</b> · Ngày ${esc(inv.invoice_date)}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-400">Tổng thanh toán</div>
          <div class="text-2xl font-bold text-blue-900">${money(inv.total)}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div class="space-y-2">
          <div class="font-medium text-slate-600 border-b pb-1">Bên bán</div>
          ${field('Tên', inv.seller_name)} ${field('MST', inv.seller_tax_code)} ${field('Địa chỉ', inv.seller_address)}
        </div>
        <div class="space-y-2">
          <div class="font-medium text-slate-600 border-b pb-1">Bên mua</div>
          ${field('Tên', inv.buyer_name)} ${field('MST', inv.buyer_tax_code)} ${field('Địa chỉ', inv.buyer_address)}
        </div>
      </div>
    </div>

    <div class="bg-white rounded-lg ring-1 ring-slate-200 overflow-x-auto mb-4">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr><th class="px-3 py-2 text-left">STT</th><th class="px-3 py-2 text-left">Tên hàng</th><th class="px-3 py-2">ĐVT</th>
          <th class="px-3 py-2 text-right">SL</th><th class="px-3 py-2 text-right">Đơn giá</th><th class="px-3 py-2 text-right">Thành tiền</th></tr>
        </thead>
        <tbody>
          ${lines.map(
            (l) => html`<tr class="border-t border-slate-100">
            <td class="px-3 py-2">${String(l.seq)}</td><td class="px-3 py-2">${esc(l.item_name)}</td>
            <td class="px-3 py-2 text-center">${esc(l.unit)}</td><td class="px-3 py-2 text-right">${money(l.qty)}</td>
            <td class="px-3 py-2 text-right">${money(l.unit_price)}</td><td class="px-3 py-2 text-right">${money(l.amount)}</td></tr>`,
          )}
        </tbody>
        <tfoot class="text-sm">
          <tr class="border-t border-slate-200"><td colspan="5" class="px-3 py-1.5 text-right text-slate-500">Cộng tiền hàng</td><td class="px-3 py-1.5 text-right">${money(inv.subtotal)}</td></tr>
          <tr><td colspan="5" class="px-3 py-1.5 text-right text-slate-500">Thuế GTGT (${pct(inv.vat_rate)})</td><td class="px-3 py-1.5 text-right">${money(inv.vat_amount)}</td></tr>
          <tr class="font-semibold"><td colspan="5" class="px-3 py-1.5 text-right">Tổng thanh toán</td><td class="px-3 py-1.5 text-right text-blue-900">${money(inv.total)}</td></tr>
        </tfoot>
      </table>
    </div>

    <!-- Xác nhận / phân loại -->
    <form method="post" action="/invoices/${String(inv.id)}/confirm" class="bg-white rounded-lg ring-1 ring-slate-200 p-5 mb-4">
      <div class="font-medium text-slate-700 mb-3">Phân loại & xác nhận (KSNB)</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <label class="flex flex-col gap-1">Nhà máy
          <select name="branch" class="px-2 py-1.5 border border-slate-300 rounded-md">
            <option value="">— Chọn —</option>
            ${branches.map((b) => html`<option value="${b.name}" ${inv.branch === b.name ? 'selected' : ''}>${b.name}</option>`)}
          </select>
        </label>
        <label class="flex flex-col gap-1">Tên ngắn NCC
          <input type="text" name="supplier_short" value="${esc(inv.supplier_short)}" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
        <label class="flex flex-col gap-1">Phiếu đề xuất
          <input type="text" name="proposal_code" value="${esc(inv.proposal_code)}" placeholder="vd 250205_02.02_SK" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
      </div>
      <label class="flex items-center gap-2 mt-3 text-sm text-slate-600">
        <input type="checkbox" name="remember_map" value="1" checked class="rounded" />
        Ghi nhớ map MST bên mua (${esc(inv.buyer_tax_code)}) → nhà máy này cho các HĐ sau
      </label>
      <div class="mt-4 flex gap-2">
        <button class="px-4 py-2 bg-blue-900 text-white rounded-md text-sm">${inv.status === 'confirmed' ? 'Cập nhật' : 'Xác nhận'}</button>
      </div>
      ${inv.confirmed_at ? html`<p class="text-xs text-slate-400 mt-2">Xác nhận bởi ${esc(inv.confirmed_by_name)} lúc ${vnDisplay(inv.confirmed_at)}</p>` : ''}
    </form>

    <!-- Theo dõi thanh toán -->
    <form method="post" action="/invoices/${String(inv.id)}/payment" class="bg-white rounded-lg ring-1 ring-slate-200 p-5 mb-4">
      <div class="flex items-center justify-between mb-3">
        <div class="font-medium text-slate-700">Công nợ / thanh toán</div>
        ${(() => {
          const d = dueStatus(inv);
          const outstanding = Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0);
          return html`<div class="flex items-center gap-3 text-sm">
            ${payBadge(derivePayStatus(inv.total, inv.paid_amount))}
            ${dueBadge(d)}
            ${d.kind === 'overdue' ? html`<span class="text-rose-600">quá hạn ${String(d.overdueDays)} ngày</span>` : ''}
            <span class="text-slate-500">Còn nợ <b class="${outstanding > 0 ? 'text-rose-600' : 'text-slate-700'}">${money(outstanding)}</b></span>
          </div>`;
        })()}
      </div>
      <p class="text-xs text-slate-400 mb-3">TT thanh toán tự suy từ "Đã thanh toán" so với Tổng (${money(inv.total)}): đủ → Đã thanh toán · một phần → Đã tạm ứng · 0 → Đang thanh toán.</p>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <label class="flex flex-col gap-1">Đã thanh toán (Đã TT)
          <input type="number" name="paid_amount" value="${esc(inv.paid_amount)}" step="any" min="0" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
        <label class="flex flex-col gap-1">Công nợ (số ngày)
          <input type="number" name="credit_term_days" value="${esc(inv.credit_term_days)}" min="0" step="1" placeholder="vd 30" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
        <label class="flex flex-col gap-1">Ngày nộp chứng từ
          <input type="date" name="doc_submit_date" value="${esc(inv.doc_submit_date)}" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
        <label class="flex flex-col gap-1">Ngày nhận hàng
          <input type="date" name="receive_date" value="${esc(inv.receive_date)}" class="px-2 py-1.5 border border-slate-300 rounded-md" />
        </label>
      </div>
      <label class="flex flex-col gap-1 mt-3 text-sm">Ghi chú
        <input type="text" name="note" value="${esc(inv.note)}" class="px-2 py-1.5 border border-slate-300 rounded-md" />
      </label>
      <div class="mt-4"><button class="px-4 py-2 bg-emerald-700 text-white rounded-md text-sm">Lưu công nợ</button></div>
    </form>

    <form method="post" action="/invoices/${String(inv.id)}/reject" onsubmit="return confirm('Bỏ qua hóa đơn này?')">
      <button class="text-sm text-slate-400 hover:text-rose-600">Bỏ qua hóa đơn này</button>
    </form>`;
}

// ===== Actions =====
invoiceRoutes.post('/:id{[0-9]+}/confirm', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const b = await c.req.parseBody();
  const branch = String(b.branch ?? '').trim();
  const supplierShort = String(b.supplier_short ?? '').trim() || null;
  const proposalCode = String(b.proposal_code ?? '').trim() || null;
  const rememberMap = b.remember_map === '1';
  if (!branch) throw badRequest('Phải chọn nhà máy');

  const inv = await c.env.DB.prepare(`SELECT buyer_tax_code, buyer_name, seller_tax_code FROM supplier_invoice WHERE id = ?1`)
    .bind(id)
    .first<{ buyer_tax_code: string | null; buyer_name: string | null; seller_tax_code: string | null }>();
  if (!inv) throw notFound('Hóa đơn không tồn tại');

  await c.env.DB.prepare(
    `UPDATE supplier_invoice
        SET branch = ?2, supplier_short = ?3, proposal_code = ?4, status = 'confirmed',
            confirmed_at = ?5, confirmed_by_user_id = ?6, confirmed_by_name = ?7, updated_at = ?5
      WHERE id = ?1`,
  )
    .bind(id, branch, supplierShort, proposalCode, nowIso(), user.id, user.name)
    .run();

  // Ghi nhớ map MST bên mua → nhà máy (auto-fill HĐ sau).
  if (rememberMap && inv.buyer_tax_code) {
    await c.env.DB.prepare(
      `INSERT INTO buyer_branch_map (buyer_tax_code, buyer_name, branch)
       VALUES (?1, ?2, ?3)
       ON CONFLICT (buyer_tax_code) DO UPDATE SET branch = EXCLUDED.branch, buyer_name = EXCLUDED.buyer_name, updated_at = iso_now()`,
    )
      .bind(inv.buyer_tax_code, inv.buyer_name, branch)
      .run();
  }
  // Cập nhật tên ngắn NCC.
  if (supplierShort && inv.seller_tax_code) {
    await c.env.DB.prepare(
      `UPDATE supplier_alias SET short_name = ?2, updated_at = iso_now() WHERE seller_tax_code = ?1`,
    )
      .bind(inv.seller_tax_code, supplierShort)
      .run();
  }
  return c.redirect(`/invoices/${id}`);
});

invoiceRoutes.post('/:id{[0-9]+}/payment', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.parseBody();
  const paidAmount = b.paid_amount ? Number(b.paid_amount) : 0;
  const creditTermRaw = String(b.credit_term_days ?? '').trim();
  const creditTerm = creditTermRaw === '' ? null : Math.max(0, Math.round(Number(creditTermRaw)));

  // TT thanh toán suy ra từ Đã TT so với Thành tiền — KSNB không nhập tay.
  const inv = await c.env.DB.prepare(`SELECT total, seller_tax_code FROM supplier_invoice WHERE id = ?1`)
    .bind(id)
    .first<{ total: number | null; seller_tax_code: string | null }>();
  const paymentStatus = derivePayStatus(inv?.total, paidAmount);

  await c.env.DB.prepare(
    `UPDATE supplier_invoice
        SET payment_status = ?2, paid_amount = ?3, credit_term_days = ?4,
            doc_submit_date = ?5, receive_date = ?6, note = ?7, updated_at = iso_now()
      WHERE id = ?1`,
  )
    .bind(
      id,
      paymentStatus,
      paidAmount,
      creditTerm,
      String(b.doc_submit_date ?? '') || null,
      String(b.receive_date ?? '') || null,
      String(b.note ?? '') || null,
    )
    .run();

  // Ghi nhớ số ngày được nợ làm mặc định cho NCC (auto-fill HĐ sau).
  if (creditTerm != null && inv?.seller_tax_code) {
    await c.env.DB.prepare(
      `UPDATE supplier_alias SET default_credit_term = ?2, updated_at = iso_now() WHERE seller_tax_code = ?1`,
    )
      .bind(inv.seller_tax_code, creditTerm)
      .run();
  }
  return c.redirect(`/invoices/${id}`);
});

invoiceRoutes.post('/:id{[0-9]+}/reject', async (c) => {
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(`UPDATE supplier_invoice SET status = 'rejected', updated_at = iso_now() WHERE id = ?1`)
    .bind(id)
    .run();
  return c.redirect('/invoices');
});

// ===== Admin: map MST bên mua → nhà máy =====
invoiceRoutes.use('/admin/*', requireAdmin);

// Trigger ingest thủ công (admin) — để test, không phải chờ cron */10.
invoiceRoutes.post('/admin/ingest-now', async (c) => {
  const r = await runInvoiceIngest(c.env);
  const msg = `Quét ${r.scanned} mail mới · tạo ${r.parsed} HĐ · trùng ${r.duplicate} · không phải HĐ ${r.noInvoice} · lỗi ${r.errors}`;
  return c.redirect(`/invoices/admin/buyer-map?flash=${encodeURIComponent(msg)}`);
});

invoiceRoutes.get('/admin/buyer-map', async (c) => {
  const user = c.get('user')!;
  const flash = c.req.query('flash') ?? '';
  const maps =
    (
      await c.env.DB.prepare(
        `SELECT buyer_tax_code, buyer_name, branch FROM buyer_branch_map ORDER BY branch, buyer_name`,
      ).all<{ buyer_tax_code: string; buyer_name: string | null; branch: string }>()
    ).results ?? [];
  const branches =
    (await c.env.DB.prepare(`SELECT name FROM branch WHERE active = 1 ORDER BY sort_order`).all<{ name: string }>())
      .results ?? [];
  return c.html(page({ title: 'Map nhà máy', user, body: buyerMapBody(maps, branches, flash) }));
});

function buyerMapBody(
  maps: { buyer_tax_code: string; buyer_name: string | null; branch: string }[],
  branches: { name: string }[],
  flash = '',
) {
  return html`
    <div class="mb-4 flex items-center gap-3">
      <a href="/invoices" class="text-sm text-slate-500 hover:underline">← Hóa đơn</a>
      <h1 class="text-xl font-semibold text-slate-800">🏭 Map pháp nhân (MST mua) → Nhà máy</h1>
    </div>
    ${flash ? html`<div class="mb-4 p-3 rounded-md bg-emerald-50 text-emerald-800 text-sm ring-1 ring-emerald-200">${flash}</div>` : ''}
    <p class="text-sm text-slate-500 mb-4">HĐ về sẽ tự gán nhà máy theo MST bên mua. Map cũng tự cập nhật khi bạn xác nhận 1 HĐ.</p>
    <form method="post" action="/invoices/admin/ingest-now" class="mb-4">
      <button class="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm">⟳ Chạy ingest ngay (test — không chờ cron)</button>
    </form>
    <form method="post" action="/invoices/admin/buyer-map" class="flex flex-wrap gap-2 items-end bg-white p-4 rounded-lg ring-1 ring-slate-200 mb-4">
      <label class="flex flex-col text-xs text-slate-500 gap-1">MST bên mua
        <input type="text" name="buyer_tax_code" required class="px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
      </label>
      <label class="flex flex-col text-xs text-slate-500 gap-1">Tên (tuỳ chọn)
        <input type="text" name="buyer_name" class="px-2 py-1.5 border border-slate-300 rounded-md text-sm" />
      </label>
      <label class="flex flex-col text-xs text-slate-500 gap-1">Nhà máy
        <select name="branch" required class="px-2 py-1.5 border border-slate-300 rounded-md text-sm">
          ${branches.map((b) => html`<option value="${b.name}">${b.name}</option>`)}
        </select>
      </label>
      <button class="px-4 py-1.5 bg-blue-900 text-white rounded-md text-sm">Thêm / cập nhật</button>
    </form>
    <div class="bg-white rounded-lg ring-1 ring-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs uppercase"><tr>
          <th class="px-3 py-2 text-left">MST bên mua</th><th class="px-3 py-2 text-left">Tên</th>
          <th class="px-3 py-2 text-left">Nhà máy</th><th class="px-3 py-2"></th></tr></thead>
        <tbody>
          ${maps.length === 0
            ? html`<tr><td colspan="4" class="px-3 py-8 text-center text-slate-400">Chưa có map nào.</td></tr>`
            : maps.map(
                (m) => html`<tr class="border-t border-slate-100">
                <td class="px-3 py-2 font-mono">${m.buyer_tax_code}</td>
                <td class="px-3 py-2">${esc(m.buyer_name)}</td>
                <td class="px-3 py-2">${m.branch}</td>
                <td class="px-3 py-2 text-right">
                  <form method="post" action="/invoices/admin/buyer-map/delete" class="inline">
                    <input type="hidden" name="buyer_tax_code" value="${m.buyer_tax_code}" />
                    <button class="text-rose-500 hover:underline text-xs">Xoá</button>
                  </form>
                </td></tr>`,
              )}
        </tbody>
      </table>
    </div>`;
}

invoiceRoutes.post('/admin/buyer-map', async (c) => {
  const b = await c.req.parseBody();
  const taxCode = String(b.buyer_tax_code ?? '').trim();
  const branch = String(b.branch ?? '').trim();
  const buyerName = String(b.buyer_name ?? '').trim() || null;
  if (!taxCode || !branch) throw badRequest('Thiếu MST hoặc nhà máy');
  await c.env.DB.prepare(
    `INSERT INTO buyer_branch_map (buyer_tax_code, buyer_name, branch)
     VALUES (?1, ?2, ?3)
     ON CONFLICT (buyer_tax_code) DO UPDATE SET branch = EXCLUDED.branch, buyer_name = EXCLUDED.buyer_name, updated_at = iso_now()`,
  )
    .bind(taxCode, buyerName, branch)
    .run();
  return c.redirect('/invoices/admin/buyer-map');
});

invoiceRoutes.post('/admin/buyer-map/delete', async (c) => {
  const b = await c.req.parseBody();
  await c.env.DB.prepare(`DELETE FROM buyer_branch_map WHERE buyer_tax_code = ?1`)
    .bind(String(b.buyer_tax_code ?? ''))
    .run();
  return c.redirect('/invoices/admin/buyer-map');
});

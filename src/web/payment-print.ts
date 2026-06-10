// Bản in GIẤY ĐỀ NGHỊ THANH TOÁN — mẫu AVPG-AC-P1-F1 (A4 portrait).
// Đợt 1: trình ký TAY → 5 ô chữ ký để TRỐNG cho ký tươi
// (Người đề nghị · Trưởng bộ phận · KSNB · Kế toán · Ban Giám đốc).

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { vnDisplay } from '../lib/time';

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
type Row = Record<string, unknown>;

const vnd = new Intl.NumberFormat('vi-VN');
const money = (n: unknown): string => (n == null || n === '' ? '' : vnd.format(Number(n)));
const s = (v: unknown): string => String(v ?? '');

export function paymentPrintPage(pr: Row, items: Row[]): Html {
  const code = (pr.code as string) ?? '(chưa có mã)';
  const createdAt = (pr.created_at as string) ?? '';
  const receiveForm = s(pr.receive_form);
  const isCK = receiveForm === 'CK';

  // Tối thiểu 6 dòng kê như mẫu giấy.
  const minRows = 6;
  const rows = items.slice();
  while (rows.length < minRows) rows.push({});

  const SIGS = ['Người đề nghị', 'Trưởng bộ phận', 'Kiểm soát nội bộ', 'Kế toán', 'Ban Giám đốc'];

  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>ĐNTT ${code}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; font-size: 12pt; }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .page { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 14mm; max-width: 210mm; }
      .print-bar { max-width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px; }
      .print-bar .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    }
    @media print { .print-bar { display: none; } .page { padding: 0; } }

    .head { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 13pt; font-weight: bold; color: #1e3a8a; }
    .brand-tag { font-size: 8pt; font-style: italic; color: #b45309; }
    .ctrl { border: 1px solid #000; font-size: 8.5pt; }
    .ctrl td { border: 1px solid #000; padding: 1mm 2mm; }
    .ctrl td.k { font-weight: bold; }

    .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 5mm 0 1mm; }
    .code { text-align: center; font-size: 10pt; font-style: italic; color: #444; margin-bottom: 4mm; }
    .row { margin: 1.5mm 0; }
    .label { font-weight: bold; }
    .dotted { border-bottom: 1px dotted #555; display: inline-block; min-width: 40mm; }

    table.kê { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 11pt; }
    table.kê th, table.kê td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top; }
    table.kê th { background: #f1f5f9; text-align: center; font-weight: bold; }
    table.kê td.c { text-align: center; }
    table.kê td.r { text-align: right; }
    .total-row td { font-weight: bold; }

    .cb { font-family: monospace; font-size: 11pt; margin-right: 1mm; }
    .pay-line { margin: 1.5mm 0; }

    table.sigs { width: 100%; border-collapse: collapse; margin-top: 8mm; font-size: 10pt; }
    table.sigs td { text-align: center; vertical-align: top; padding: 0 1mm; width: 20%; }
    .sig-role { font-weight: bold; }
    .sig-hint { font-style: italic; font-size: 8pt; color: #666; }
    .sig-space { height: 26mm; }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/payments/${s(pr.id)}">← Quay lại phiếu</a>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="page">
    <div class="head">
      <div>
        <div class="brand">AN VIET PHAT GROUP</div>
        <div class="brand-tag">Together growing strong &amp; success</div>
      </div>
      <table class="ctrl">
        <tr><td class="k">Mã kiểm soát</td><td>AVPG-AC-P1-F1</td></tr>
        <tr><td class="k">Số sửa đổi</td><td>01</td></tr>
        <tr><td class="k">Ngày ban hành</td><td>09/09/2021</td></tr>
      </table>
    </div>

    <div class="title">GIẤY ĐỀ NGHỊ THANH TOÁN</div>
    <div class="code">Mã số đề nghị: ${code} · ${vnDisplay(createdAt)}</div>

    <div class="row"><span class="label">Họ &amp; tên người thanh toán:</span> ${s(pr.payee_name)}</div>
    <div class="row"><span class="label">Chức danh:</span> ${s(pr.payee_title)}</div>
    <div class="row"><span class="label">Mục đích thanh toán:</span> ${s(pr.purpose)}</div>
    <div class="row"><span class="label">Thanh toán tiền theo bảng kê dưới đây:</span></div>

    <table class="kê">
      <thead>
        <tr>
          <th style="width:8mm">STT</th>
          <th>Diễn giải</th>
          <th style="width:26mm">Đơn giá</th>
          <th style="width:14mm">SL</th>
          <th style="width:30mm">Số tiền</th>
          <th style="width:16mm">Loại tiền</th>
          <th style="width:24mm">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (it, i) => html`<tr>
            <td class="c">${it.description || it.amount != null ? i + 1 : ''}</td>
            <td>${s(it.description)}</td>
            <td class="r">${money(it.unit_price)}</td>
            <td class="r">${s(it.qty)}</td>
            <td class="r">${money(it.amount)}</td>
            <td class="c">${s(it.currency)}</td>
            <td>${s(it.note)}</td>
          </tr>`,
        )}
        <tr class="total-row">
          <td colspan="4" class="r">Tổng cộng :</td>
          <td class="r">${money(pr.total_amount)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <div class="row"><span class="label">Bằng chữ :</span> <i>${s(pr.amount_words)}</i></div>

    <div class="pay-line">
      <span class="label">Hình thức thanh toán:</span> ${s(pr.pay_form)}
    </div>
    <div class="pay-line">
      <span class="label">Hình thức nhận tiền:</span>
      <span class="cb">${isCK ? '☑' : '☐'}</span> Chuyển khoản (CK)
      &nbsp;&nbsp;<span class="cb">${!isCK && receiveForm ? '☑' : '☐'}</span> Tiền mặt (TM)
    </div>
    <div class="pay-line"><span class="label">Tên chủ tài khoản:</span> ${s(pr.bank_account_name)}</div>
    <div class="pay-line"><span class="label">Số tài khoản người nhận:</span> ${s(pr.bank_account_no)}${pr.bank_name ? html` &nbsp;—&nbsp; <span class="label">Ngân hàng:</span> ${s(pr.bank_name)}` : ''}</div>
    <div class="pay-line"><span class="label">Nội dung CK:</span> ${s(pr.transfer_note)}</div>

    <table class="sigs">
      <tr>
        ${SIGS.map(
          (role) => html`<td>
            <div class="sig-role">${role}</div>
            <div class="sig-hint">(Ký, Họ và tên)</div>
            <div class="sig-space"></div>
          </td>`,
        )}
      </tr>
    </table>
  </div>
</body>
</html>`;
}

// Bản in GIẤY ĐỀ NGHỊ THANH TOÁN — dựng "y chang" mẫu AVPG-AC-P1-F1 (file docs/DNTT.xlsx).
// A4 portrait, Times New Roman. Bố cục bám lưới cột A–K + ô gộp của bản gốc:
//   logo (A1:D3) | tiêu đề (E1:I3) | hộp mã kiểm soát (J1:K3); bảng kê 6 dòng;
//   ô tích Công ty/Cá nhân & CK/TM; 5 ô chữ ký: Người đề nghị · Trưởng bộ phận ·
//   Kiểm soát nội bộ · Kế toán · Ban Giám đốc. Đợt 1: ký TAY → ô chữ ký để trống.

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { vnDisplay } from '../lib/time';
import { AVPG_LOGO_DATA_URL } from '../lib/avpg-logo';

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
type Row = Record<string, unknown>;

const vnd = new Intl.NumberFormat('vi-VN');
const money = (n: unknown): string => (n == null || n === '' ? '' : vnd.format(Number(n)));
const s = (v: unknown): string => String(v ?? '');
const cb = (on: boolean): string => (on ? '☑' : '☐');

export function paymentPrintPage(pr: Row, items: Row[]): Html {
  const code = (pr.code as string) ?? '';
  const dateStr = vnDisplay((pr.created_at as string) ?? '').slice(0, 10);
  const payForm = s(pr.pay_form);
  const receiveForm = s(pr.receive_form);

  // Bảng kê tối thiểu 6 dòng như bản gốc (rows 12–17).
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
    @page { size: A4; margin: 12mm 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; font-size: 12.5pt; line-height: 1.25; }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .page { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 12mm; width: 210mm; }
      .print-bar { width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px; }
      .print-bar .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    }
    @media print { .print-bar { display: none; } .page { padding: 0; } }

    /* ===== Header: logo | tiêu đề | hộp mã kiểm soát ===== */
    table.hdr { width: 100%; border-collapse: collapse; }
    table.hdr > tbody > tr > td { vertical-align: middle; padding: 0; }
    .hdr .logo-cell { width: 33mm; }
    .hdr .logo-cell img { width: 33mm; height: auto; display: block; }
    .hdr .title-cell { text-align: center; padding: 0 3mm; }
    .hdr .title { font-size: 19pt; font-weight: bold; letter-spacing: .3px; }
    .hdr .ctrl { width: 52mm; border-collapse: collapse; font-size: 8.5pt; }
    .hdr .ctrl td { border: 1px solid #000; padding: 1mm 2mm; }
    .hdr .ctrl td.k { white-space: nowrap; }

    .gap { height: 3mm; }

    /* ===== Khối thông tin (label + value gạch chân chấm) ===== */
    table.info { width: 100%; border-collapse: collapse; }
    table.info td { padding: 1.3mm 0; vertical-align: bottom; }
    .lbl { font-weight: bold; white-space: nowrap; padding-right: 2mm; }
    .val { border-bottom: 1px dotted #777; width: 100%; }
    .val.tall { min-height: 9mm; }

    /* ===== Bảng kê ===== */
    table.ke { width: 100%; border-collapse: collapse; margin-top: 1mm; font-size: 11.5pt; }
    table.ke th, table.ke td { border: 1px solid #000; padding: 1.4mm 2mm; vertical-align: top; }
    table.ke th { text-align: center; font-weight: bold; background: #f2f2f2; }
    table.ke td.c { text-align: center; }
    table.ke td.r { text-align: right; }
    table.ke tr.total td { font-weight: bold; }

    .pay { margin-top: 1mm; }
    .pay .row { padding: 1.2mm 0; }
    .cbk { font-family: 'Segoe UI Symbol', 'DejaVu Sans', sans-serif; font-size: 12pt; margin: 0 1mm 0 3mm; }

    /* ===== Chữ ký ===== */
    table.sig { width: 100%; border-collapse: collapse; margin-top: 4mm; }
    table.sig td { width: 20%; text-align: center; vertical-align: top; padding: 0 1mm; }
    .sig-role { font-weight: bold; }
    .sig-hint { font-style: italic; font-size: 9pt; }
    .sig-space { height: 26mm; }

    .note-foot { margin-top: 5mm; font-size: 8.5pt; font-style: italic; color: #333; white-space: pre-line; }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/payments/${s(pr.id)}">← Quay lại phiếu</a>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="page">

    <!-- HEADER -->
    <table class="hdr">
      <tr>
        <td class="logo-cell"><img src="${AVPG_LOGO_DATA_URL}" alt="AVPG" /></td>
        <td class="title-cell"><div class="title">GIẤY ĐỀ NGHỊ THANH TOÁN</div></td>
        <td>
          <table class="ctrl">
            <tr><td class="k">Mã kiểm soát:</td><td>AVPG-AC-P1-F1</td></tr>
            <tr><td class="k">Số sửa đổi:</td><td>01</td></tr>
            <tr><td class="k">Ngày ban hành:</td><td>09/09/2021</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <div class="gap"></div>

    <!-- THÔNG TIN -->
    <table class="info">
      <tr>
        <td class="lbl">Mã số đề nghị:</td>
        <td class="val" style="width:auto; white-space:nowrap; border:0; font-weight:bold;">${code}</td>
        <td style="text-align:right; white-space:nowrap;">Ngày: ${dateStr}</td>
      </tr>
    </table>
    <table class="info">
      <tr><td class="lbl">Họ &amp; tên người thanh toán:</td><td class="val">${s(pr.payee_name)}</td></tr>
      <tr><td class="lbl">Chức danh:</td><td class="val">${s(pr.payee_title)}</td></tr>
      <tr><td class="lbl" style="vertical-align:top;">Mục đích thanh toán:</td><td class="val tall">${s(pr.purpose)}</td></tr>
    </table>

    <div style="margin:1.5mm 0 0; font-weight:bold;">Thanh toán tiền theo bảng kê dưới đây:</div>

    <!-- BẢNG KÊ -->
    <table class="ke">
      <thead>
        <tr>
          <th style="width:4.7%">STT</th>
          <th style="width:36.7%">Diễn giải</th>
          <th style="width:13%">Đơn giá</th>
          <th style="width:8.2%">SL</th>
          <th style="width:14.2%">Số tiền</th>
          <th style="width:8.7%">Loại tiền</th>
          <th style="width:14.4%">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((it, i) => {
          const filled = it.description != null || it.amount != null;
          return html`<tr>
            <td class="c">${filled ? i + 1 : ''}</td>
            <td>${s(it.description)}</td>
            <td class="r">${money(it.unit_price)}</td>
            <td class="c">${s(it.qty)}</td>
            <td class="r">${money(it.amount)}</td>
            <td class="c">${s(it.currency)}</td>
            <td>${s(it.note)}</td>
          </tr>`;
        })}
        <tr class="total">
          <td colspan="4" class="r">Tổng cộng :</td>
          <td class="r">${money(pr.total_amount)}</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>

    <table class="info" style="margin-top:1.5mm;">
      <tr><td class="lbl">Bằng chữ :</td><td class="val" style="font-style:italic;">${s(pr.amount_words)}</td></tr>
    </table>

    <!-- HÌNH THỨC -->
    <div class="pay">
      <div class="row">
        <span class="lbl">Hình thức thanh toán:</span>
        <span class="cbk">${cb(payForm === 'Công ty')}</span> Công ty
        <span class="cbk">${cb(payForm === 'Cá nhân')}</span> Cá nhân
      </div>
      <div class="row">
        <span class="lbl">Hình thức nhận tiền:</span>
        <span class="cbk">${cb(receiveForm === 'CK')}</span> Chuyển khoản (CK)
        <span class="cbk">${cb(receiveForm === 'TM')}</span> Tiền mặt (TM)
      </div>
    </div>
    <table class="info">
      <tr><td class="lbl">Tên chủ tài khoản:</td><td class="val">${s(pr.bank_account_name)}</td></tr>
      <tr><td class="lbl">Số tài khoản người nhận:</td><td class="val">${s(pr.bank_account_no)}${pr.bank_name ? html` &nbsp;—&nbsp; ${s(pr.bank_name)}` : ''}</td></tr>
      <tr><td class="lbl">Nội dung CK:</td><td class="val">${s(pr.transfer_note)}</td></tr>
    </table>

    <!-- CHỮ KÝ -->
    <table class="sig">
      <tr>${SIGS.map((r) => html`<td class="sig-role">${r}</td>`)}</tr>
      <tr>${SIGS.map(() => html`<td class="sig-hint">(Ký, Họ và tên)</td>`)}</tr>
      <tr>${SIGS.map(() => html`<td class="sig-space"></td>`)}</tr>
    </table>

    <div class="note-foot">GHI CHÚ: Cách đặt mã số đề nghị: XX01-DDMMYYYY — XX: viết tắt phòng ban đề nghị; 01: số thứ tự tăng dần; DDMMYYYY: ngày lập phiếu.</div>

  </div>
</body>
</html>`;
}

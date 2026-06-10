// Bản in GIẤY ĐỀ NGHỊ THANH TOÁN — dựng "y chang" mẫu AVPG-AC-P1-F1 (docs/DNTT.pdf).
// A4 portrait, Times New Roman, KHUNG VIỀN bao toàn phiếu. Bám đúng lưới cột A–K +
// ô gộp của bản gốc: header hộp 3 ô (logo | tiêu đề | mã kiểm soát); khối thông tin;
// bảng kê 6 dòng (Tổng cộng nằm ở vùng cột Diễn giải như bản gốc); Bằng chữ; hình thức
// TT/nhận tiền (1 giá trị + ☑); Tên chủ TK / Số TK / Nội dung CK / Đi từ công ty;
// 5 ô chữ ký; GHI CHÚ mã đỏ ở đáy.

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

// 'Ngày DD tháng MM năm YYYY' từ ISO (giờ VN).
function ngayThangNam(iso: string): string {
  const d = vnDisplay(iso).slice(0, 10); // dd/mm/yyyy
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (!m) return '';
  return `Ngày ${m[1]} tháng ${m[2]} năm ${m[3]}`;
}

export function paymentPrintPage(pr: Row, items: Row[]): Html {
  const code = (pr.code as string) ?? '';
  const dateStr = ngayThangNam((pr.created_at as string) ?? '');
  const payForm = s(pr.pay_form) || 'Công ty';
  const receiveForm = s(pr.receive_form) || 'CK';

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
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; font-size: 12pt; }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .sheet { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 12mm; width: 210mm; }
      .print-bar { width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px; }
      .print-bar .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    }
    @media print { .print-bar { display: none; } .sheet { padding: 0; } }

    table.form { width: 100%; border-collapse: collapse; border: 1.4pt solid #000; table-layout: fixed; }
    table.form > tbody > tr > td { padding: 1mm 2mm; vertical-align: top; overflow: hidden; }
    .bx { border: 0.75pt solid #000; }   /* viền 4 cạnh (bảng kê) */
    .bb { border-bottom: 0.75pt solid #000; }
    .bt { border-top: 0.75pt solid #000; }
    .br { border-right: 0.75pt solid #000; }
    .lbl { font-weight: normal; }
    .c { text-align: center; }
    .r { text-align: right; }
    .ul { border-bottom: 0.6pt solid #000; }  /* gạch chân ô giá trị */

    .title { text-align: center; font-size: 18pt; font-weight: bold; }
    .logo { width: 32mm; height: auto; display: block; margin: 0 auto; }

    table.ctrl { width: 100%; height: 100%; border-collapse: collapse; font-size: 8.5pt; }
    table.ctrl td { padding: 0.6mm 1.5mm; vertical-align: middle; }

    table.sig { width: 100%; border-collapse: collapse; }
    table.sig td { text-align: center; vertical-align: top; width: 20%; padding: 0 1mm; }
    .sig-role { font-weight: bold; }
    .sig-hint { font-style: italic; font-size: 9pt; }

    .red { color: #c00; font-weight: bold; }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/payments/${s(pr.id)}">← Quay lại phiếu</a>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="sheet">
    <table class="form">
      <colgroup>
        <col style="width:4.73%" /><col style="width:2.57%" /><col style="width:3.53%" />
        <col style="width:8.58%" /><col style="width:9.14%" /><col style="width:12.91%" />
        <col style="width:12.99%" /><col style="width:8.18%" /><col style="width:14.20%" />
        <col style="width:8.74%" /><col style="width:14.44%" />
      </colgroup>

      <!-- ===== HEADER: logo | tiêu đề | mã kiểm soát ===== -->
      <tr style="height:18mm">
        <td colspan="4" class="br bb c" style="vertical-align:middle"><img class="logo" src="${AVPG_LOGO_DATA_URL}" alt="AVPG" /></td>
        <td colspan="5" class="br bb" style="vertical-align:middle"><div class="title">GIẤY ĐỀ NGHỊ THANH TOÁN</div></td>
        <td colspan="2" class="bb" style="padding:0">
          <table class="ctrl">
            <tr><td class="bb">Mã kiểm soát: AVPG-AC-P1-F1</td></tr>
            <tr><td class="bb">Số sửa đổi: 01</td></tr>
            <tr><td>Ngày ban hành: 09/09/2021</td></tr>
          </table>
        </td>
      </tr>

      <!-- ===== KHỐI THÔNG TIN ===== -->
      <tr style="height:8mm">
        <td colspan="3" style="white-space:nowrap; vertical-align:middle">Mã số đề nghị:</td>
        <td colspan="4" class="ul" style="font-weight:bold; vertical-align:middle">${code}</td>
        <td colspan="4" class="r" style="vertical-align:middle">${dateStr}</td>
      </tr>
      <tr style="height:8mm">
        <td colspan="4" style="white-space:nowrap; vertical-align:middle">Họ &amp; tên người thanh toán:</td>
        <td colspan="7" class="ul" style="vertical-align:middle">${s(pr.payee_name)}</td>
      </tr>
      <tr style="height:8mm">
        <td colspan="3" style="white-space:nowrap; vertical-align:middle">Chức danh:</td>
        <td colspan="8" class="ul" style="vertical-align:middle">${s(pr.payee_title)}</td>
      </tr>
      <tr style="height:9mm">
        <td colspan="4" style="white-space:nowrap; vertical-align:middle">Mục đích thanh toán:</td>
        <td colspan="7" class="ul" style="font-weight:bold; vertical-align:middle">${s(pr.purpose)}</td>
      </tr>
      <tr style="height:7mm">
        <td colspan="6" style="white-space:nowrap; vertical-align:middle">Thanh toán tiền theo bảng kê dưới đây:</td>
        <td colspan="5" class="ul"></td>
      </tr>

      <!-- ===== BẢNG KÊ ===== -->
      <tr>
        <td colspan="6" class="bx c" style="font-weight:bold">Diễn giải</td>
        <td class="bx c" style="font-weight:bold">Đơn giá</td>
        <td class="bx c" style="font-weight:bold">SL</td>
        <td class="bx c" style="font-weight:bold">Số tiền</td>
        <td class="bx c" style="font-weight:bold">Loại tiền</td>
        <td class="bx c" style="font-weight:bold">Ghi chú</td>
      </tr>
      ${rows.map((it, i) => {
        const filled = it.description != null || it.amount != null;
        return html`<tr style="height:7mm">
          <td class="bx c">${filled ? i + 1 : ''}</td>
          <td colspan="5" class="bx">${s(it.description)}</td>
          <td class="bx r">${money(it.unit_price)}</td>
          <td class="bx c">${s(it.qty)}</td>
          <td class="bx r">${money(it.amount)}</td>
          <td class="bx c">${s(it.currency)}</td>
          <td class="bx">${s(it.note)}</td>
        </tr>`;
      })}
      <tr style="height:7mm">
        <td colspan="3" class="bx" style="white-space:nowrap">Tổng cộng :</td>
        <td colspan="3" class="bx r" style="font-weight:bold">${money(pr.total_amount)}</td>
        <td class="bx"></td>
        <td class="bx"></td>
        <td class="bx"></td>
        <td class="bx"></td>
        <td class="bx"></td>
      </tr>

      <!-- ===== BẰNG CHỮ ===== -->
      <tr style="height:7mm">
        <td colspan="11" class="bx"><span style="white-space:nowrap">Bằng chữ :</span> <i>${s(pr.amount_words)}</i></td>
      </tr>

      <!-- ===== HÌNH THỨC ===== -->
      <tr style="height:8mm">
        <td colspan="11" class="bb" style="vertical-align:middle">
          <span style="white-space:nowrap">Hình thức thanh toán:</span>
          <span style="display:inline-block; margin-left:32%">${s(payForm)} <span style="font-size:13pt">${cb(true)}</span></span>
        </td>
      </tr>
      <tr style="height:8mm">
        <td colspan="11" class="bb" style="vertical-align:middle">
          <span style="white-space:nowrap">Hình thức nhận tiền:</span>
          <span style="display:inline-block; margin-left:32%">${s(receiveForm)} <span style="font-size:13pt">${cb(true)}</span></span>
        </td>
      </tr>

      <!-- ===== KHỐI TÀI KHOẢN (vùng mở, ghi tay) ===== -->
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Tên chủ tài khoản: ${s(pr.bank_account_name)}</td></tr>
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Số tài khoản người nhận: ${s(pr.bank_account_no)}${pr.bank_name ? html` — ${s(pr.bank_name)}` : ''}</td></tr>
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Nội dung CK: ${s(pr.transfer_note)}</td></tr>
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Đi từ công ty:</td></tr>

      <!-- ===== CHỮ KÝ ===== -->
      <tr>
        <td colspan="11" style="padding-top:2mm">
          <table class="sig">
            <tr>${SIGS.map((r) => html`<td class="sig-role">${r}</td>`)}</tr>
            <tr>${SIGS.map(() => html`<td class="sig-hint">(Ký, Họ và tên)</td>`)}</tr>
            <tr>${SIGS.map(() => html`<td style="height:30mm"></td>`)}</tr>
          </table>
        </td>
      </tr>

      <!-- ===== GHI CHÚ ===== -->
      <tr>
        <td colspan="11" class="bt" style="font-size:8.5pt; font-style:italic">
          <u>GHI CHÚ:</u> Cách đặt mã số đề nghị: <span class="red">XX01-DDMMYYYY</span>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

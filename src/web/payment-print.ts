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
import { VN_BANKS } from '../lib/vn-banks';

// bank_name lưu dưới dạng tên ngắn (short). Bản in cần TÊN ĐẦY ĐỦ → tra ngược short → full.
// Dữ liệu cũ / ngoài danh mục (không khớp) giữ nguyên giá trị đang lưu.
const BANK_FULL_BY_SHORT = new Map(VN_BANKS.map((b) => [b.short, b.full]));
const bankFullName = (v: unknown): string => {
  const short = String(v ?? '').trim();
  return short ? BANK_FULL_BY_SHORT.get(short) ?? short : '';
};

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

export function paymentPrintPage(
  pr: Row,
  items: Row[],
  sig?: { proposerName?: string; managerName?: string; forSign?: boolean },
): Html {
  // forSign=true (bản PDF gửi ký Documenso): GHIM khối chữ ký cố định ở ĐÁY trang
  // (position:fixed) để ô ký luôn ở 1 vị trí dù bảng kê dài/ngắn. Bản in giấy (forSign
  // false) giữ khối chữ ký trong luồng bảng như cũ — KHÔNG đụng layout đã căn.
  const forSign = sig?.forSign === true;
  const code = (pr.code as string) ?? '';
  const dateStr = ngayThangNam((pr.created_at as string) ?? '');
  const payForm = s(pr.pay_form) || 'Công ty';
  const receiveForm = s(pr.receive_form) || 'CK';

  // Chỉ in đúng số dòng có dữ liệu (không chèn dòng trống).
  const rows = items.slice();

  // Khối chữ ký: Người đề nghị (người tạo) + Trưởng bộ phận (manager đã map) in sẵn tên;
  // 3 chặng còn lại ký + ghi tên tay.
  const SIGS: Array<{ role: string; name: string }> = [
    { role: 'Người đề nghị', name: s(sig?.proposerName) },
    { role: 'Trưởng bộ phận', name: s(sig?.managerName) },
    { role: 'Kiểm soát nội bộ', name: '' },
    { role: 'Kế toán', name: '' },
    { role: 'Ban Giám đốc', name: '' },
  ];
  const sigTable = html`<table class="sig">
            <tr>${SIGS.map((x) => html`<td class="sig-role">${x.role}</td>`)}</tr>
            <tr>${SIGS.map(() => html`<td class="sig-hint">(Ký, Họ và tên)</td>`)}</tr>
            <tr>${SIGS.map((x) => html`<td style="height:30mm; vertical-align:bottom; font-weight:bold">${x.name}</td>`)}</tr>
          </table>`;

  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>ĐNTT ${code}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; font-size: 9pt; }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .sheet { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 12mm; width: 210mm; }
      .print-bar { width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a { padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px; }
      .print-bar .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    }
    @media print { .print-bar { display: none; } .sheet { padding: 0; } }

    table.form { width: 100%; border-collapse: collapse; border: 1.4pt solid #000; table-layout: fixed; }
    table.form > tbody > tr > td { padding: 1mm 2mm; vertical-align: top; }
    .bx { border: 0.75pt solid #000; padding: 0.8mm 1mm; }   /* viền 4 cạnh (bảng kê) */
    .bb { border-bottom: 0.75pt solid #000; }
    .bt { border-top: 0.75pt solid #000; }
    .br { border-right: 0.75pt solid #000; }
    .lbl { font-weight: normal; }
    .c { text-align: center; }
    .r { text-align: right; }
    .ul { border-bottom: 0.6pt solid #000; }  /* gạch chân ô giá trị */
    .lblc { white-space: nowrap; vertical-align: bottom; }   /* nhãn — 1 dòng, sát đáy */
    .valc { vertical-align: bottom; }                         /* giá trị — nằm trên đường kẻ */

    .title { text-align: center; font-size: 13pt; font-weight: bold; }
    .th { font-weight: bold; font-size: 10pt; text-align: center; }   /* tiêu đề bảng kê */
    .logo { width: 29mm; height: auto; display: block; margin: 0 auto; }

    table.ctrl { width: 100%; height: 100%; border-collapse: collapse; font-size: 7pt; }
    table.ctrl td { padding: 0.6mm 1.5mm; vertical-align: middle; white-space: nowrap; }

    table.sig { width: 100%; border-collapse: collapse; }
    table.sig td { text-align: center; vertical-align: top; width: 20%; padding: 0 1mm; }
    .sig-role { font-weight: bold; font-size: 9.5pt; }
    .sig-hint { font-style: italic; font-size: 8.5pt; }
    /* Bản PDF ký: khối chữ ký sang HẲN trang riêng (cuối) → vị trí ô ký luôn cố định,
       không bị bảng kê dài/ngắn xô lệch hay đè lên. */
    .sig-page { break-before: page; padding-top: 22mm; }

    .red { color: #c00; font-weight: bold; }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/payments/${s(pr.id)}">← Quay lại phiếu</a>
    <label style="display:inline-flex; align-items:center; gap:6px; font-size:14px; color:#1e293b; cursor:pointer">
      <input type="checkbox" id="toggle-logo" checked
        onchange="document.getElementById('avpg-logo').style.visibility = this.checked ? 'visible' : 'hidden'" />
      Hiện logo AVP Group
    </label>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="sheet">
    <table class="form">
      <colgroup>
        <col style="width:4.73%" /><col style="width:2.57%" /><col style="width:3.53%" />
        <col style="width:8.58%" /><col style="width:9.14%" /><col style="width:10.15%" />
        <col style="width:12.99%" /><col style="width:8.18%" /><col style="width:13.70%" />
        <col style="width:11.75%" /><col style="width:14.43%" />
      </colgroup>

      <!-- ===== HEADER: logo | tiêu đề | mã kiểm soát ===== -->
      <tr style="height:18mm">
        <td colspan="4" class="br bb c" style="vertical-align:middle"><img id="avpg-logo" class="logo" src="${AVPG_LOGO_DATA_URL}" alt="AVPG" /></td>
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
        <td colspan="6" class="lblc">Mã số đề nghị:</td>
        <td colspan="2" class="ul valc" style="font-weight:bold">${code}</td>
        <td colspan="3" class="r" style="white-space:nowrap; vertical-align:bottom">${dateStr}</td>
      </tr>
      <tr style="height:8mm">
        <td colspan="6" class="lblc">Họ &amp; tên người thanh toán:</td>
        <td colspan="5" class="ul valc">${s(pr.payee_name)}</td>
      </tr>
      <tr style="height:8mm">
        <td colspan="6" class="lblc">Chức danh:</td>
        <td colspan="5" class="ul valc">${s(pr.payee_title)}</td>
      </tr>
      <tr style="height:9mm">
        <td colspan="6" class="lblc">Mục đích thanh toán:</td>
        <td colspan="5" class="ul valc" style="font-weight:bold">${s(pr.purpose)}</td>
      </tr>
      <tr style="height:7mm">
        <td colspan="6" class="lblc">Thanh toán tiền theo bảng kê dưới đây:</td>
        <td colspan="5" class="ul"></td>
      </tr>

      <!-- ===== BẢNG KÊ ===== -->
      <tr>
        <td colspan="6" class="bx th">Diễn giải</td>
        <td class="bx th">Đơn giá</td>
        <td class="bx th">SL</td>
        <td class="bx th">Số tiền</td>
        <td class="bx th">Loại tiền</td>
        <td class="bx th">Ghi chú</td>
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

      <!-- ===== HÌNH THỨC (KHÔNG kẻ gạch dưới) ===== -->
      <tr style="height:8mm">
        <td colspan="11" style="vertical-align:middle">
          <span style="white-space:nowrap">Hình thức thanh toán:</span>
          <span style="display:inline-block; margin-left:32%">${s(payForm)} <span style="font-size:10pt">${cb(true)}</span></span>
        </td>
      </tr>
      <tr style="height:8mm">
        <td colspan="11" style="vertical-align:middle">
          <span style="white-space:nowrap">Hình thức nhận tiền:</span>
          <span style="display:inline-block; margin-left:32%">${s(receiveForm)} <span style="font-size:10pt">${cb(true)}</span></span>
        </td>
      </tr>

      <!-- ===== KHỐI TÀI KHOẢN (vùng mở, ghi tay) ===== -->
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Tên chủ tài khoản: ${s(pr.bank_account_name)}</td></tr>
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Số tài khoản người nhận: ${s(pr.bank_account_no)}${pr.bank_name ? html` — ${bankFullName(pr.bank_name)}` : ''}${pr.bank_branch ? html` – CN: ${s(pr.bank_branch)}` : ''}</td></tr>
      <tr style="height:13mm"><td colspan="11" style="vertical-align:top">Nội dung CK: ${s(pr.transfer_note)}</td></tr>
      <tr style="height:13mm"><td colspan="11" class="bb" style="vertical-align:top">Đi từ công ty: ${s(pr.from_company)}</td></tr>

      <!-- ===== CHỮ KÝ (bản in giấy: trong luồng bảng) ===== -->
      ${forSign ? '' : html`<tr>
        <td colspan="11" style="padding-top:2mm">${sigTable}</td>
      </tr>`}

      <!-- ===== GHI CHÚ ===== -->
      <tr>
        <td colspan="11" class="bt" style="font-size:8pt; font-style:italic">
          <b><u>GHI CHÚ:</u></b> Cách đặt mã số đề nghị: <span class="red">XX01-DDMMYYYY</span>
        </td>
      </tr>
    </table>
    <!-- ===== CHỮ KÝ (bản PDF ký: trang riêng cuối) ===== -->
    ${forSign ? html`<div class="sig-page">${sigTable}</div>` : ''}
  </div>
</body>
</html>`;
}

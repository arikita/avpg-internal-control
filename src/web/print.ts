// Print view — render HTML A4 cho phiếu đề xuất.
// General: template HR-10 (A4 portrait, letterhead PNG).
// Purchase: template AVPG-IC-P4-F1 (A4 landscape, bảng 12 cột).

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { vnDisplay } from '../lib/time';
import { formatVnd } from '../lib/pr-math';

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

type ProposalRow = Record<string, unknown>;
type ItemRow = Record<string, unknown>;
type ApprovalRow = {
  step: 'manager' | 'bod' | 'ksnb' | 'engineering' | 'ic' | string;
  actor_email: string;
  actor_name: string;
  action: 'approve' | 'reject' | string;
  acted_at: string;
  signature_data_url?: string | null; // joined từ users
};

export function printPage(
  proposal: ProposalRow,
  items: ItemRow[],
  approvals: ApprovalRow[],
  proposerSignature: string | null,
): Html {
  // Branch theo proposal_type — PR render mẫu AVPG-IC-P4-F1.
  if ((proposal.proposal_type as string) === 'purchase') {
    return printPurchasePage(proposal, items, approvals, proposerSignature);
  }
  // Lấy chữ ký TP + BGĐ từ approvals (chỉ action='approve').
  const managerApproval = approvals.find(
    (a) => a.step === 'manager' && a.action === 'approve',
  );
  const bodApproval = approvals.find((a) => a.step === 'bod' && a.action === 'approve');

  const code = (proposal.code as string) ?? '(chưa có mã)';
  const title = (proposal.title as string) ?? '';
  const reason = (proposal.reason as string) ?? '';
  const explanation = (proposal.explanation as string) ?? '';
  const requiredTime = (proposal.required_time as string) ?? '';
  const proposerName = (proposal.proposer_name as string) ?? '';
  const proposerTitle = (proposal.proposer_title as string) ?? '';
  const proposerDept = (proposal.proposer_dept as string) ?? '';
  const createdAt = (proposal.submitted_at as string) ?? (proposal.created_at as string) ?? '';

  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Phiếu ${code}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Times New Roman', Times, serif;
      color: #000;
      background: #fff;
    }
    .page {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      padding: 38mm 18mm 30mm 18mm; /* clear header + footer */
      /* Background trắng QUAN TRỌNG vì letterhead PNG là RGBA, vùng giữa
         có alpha transparent → nếu không có white underlay, nền body xám
         sẽ lộ ra. */
      background-color: #ffffff;
      background-image: url('/static/letterhead.png');
      background-repeat: no-repeat;
      background-position: top center;
      background-size: 210mm 297mm;
      /* Ép browser in nền (default browsers tắt background graphics khi
         in để tiết kiệm mực — phải override) */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .page { margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
      .print-bar { max-width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a {
        padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1;
        background: white; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px;
      }
      .print-bar .primary { background: #2563eb; color: white; border-color: #2563eb; }
    }
    @media print {
      .print-bar { display: none; }
    }
    .title {
      text-align: center;
      font-size: 22pt;
      font-weight: bold;
      margin: 0 0 4mm 0;
      letter-spacing: 1px;
    }
    .code {
      text-align: center;
      font-size: 10pt;
      font-style: italic;
      color: #444;
      margin: 0 0 6mm 0;
    }
    .greeting {
      font-size: 12pt;
      margin: 4mm 0;
    }
    .row {
      font-size: 12pt;
      margin: 2mm 0;
    }
    .label { font-weight: bold; }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm 8mm;
      font-size: 12pt;
      margin: 2mm 0;
    }
    .block {
      font-size: 12pt;
      margin: 3mm 0;
      white-space: pre-wrap;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin: 3mm 0;
      font-size: 12pt;
    }
    table.items th, table.items td {
      border: 1px solid #000;
      padding: 2mm 3mm;
      vertical-align: top;
      text-align: left;
    }
    table.items th {
      background: #f1f5f9;
      font-weight: bold;
      text-align: center;
    }
    table.items td.stt { text-align: center; width: 12mm; }
    table.items td.note { width: 50mm; }
    table.signatures {
      width: 100%;
      border-collapse: collapse;
      margin: 8mm 0 0 0;
      font-size: 11pt;
    }
    table.signatures td {
      text-align: center;
      vertical-align: top;
      padding: 0 2mm;
      width: 33.33%;
    }
    .sig-role {
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 2mm;
    }
    .sig-hint {
      font-style: italic;
      font-size: 9pt;
      color: #666;
    }
    .sig-img {
      height: 28mm;
      margin: 2mm auto 1mm auto;
      display: block;
      max-width: 50mm;
      object-fit: contain;
    }
    .sig-img-placeholder {
      height: 28mm;
    }
    .sig-name {
      font-weight: bold;
      min-height: 5mm;
    }
    .sig-date {
      font-size: 9pt;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/p/${proposal.id}">← Quay lại phiếu</a>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="page">
    <div class="title">PHIẾU ĐỀ XUẤT</div>
    <div class="code">Mã phiếu: ${code} · ${vnDisplay(createdAt)}</div>

    <div class="greeting"><span class="label">Kính gửi:</span> Ban Giám Đốc</div>

    <div class="row"><span class="label">Nội dung đề xuất:</span> ${title}</div>

    <div class="grid-2">
      <div><span class="label">Nhân viên:</span> ${proposerName}</div>
      <div></div>
      <div><span class="label">Chức vụ:</span> ${proposerTitle}</div>
      <div><span class="label">Phòng ban:</span> ${proposerDept}</div>
    </div>

    <div class="block">
      <span class="label">Lý do đề nghị:</span> ${reason}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:12mm">STT</th>
          <th>Nội dung</th>
          <th style="width:50mm">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        ${items.length > 0
          ? items.map(
              (it, i) => html`
                <tr>
                  <td class="stt">${String(i + 1).padStart(2, '0')}</td>
                  <td>${(it.content as string) ?? ''}</td>
                  <td class="note">${(it.note as string) ?? ''}</td>
                </tr>
              `,
            )
          : html`
              <tr><td class="stt">01</td><td>&nbsp;</td><td></td></tr>
              <tr><td class="stt">02</td><td>&nbsp;</td><td></td></tr>
            `}
      </tbody>
    </table>

    ${explanation
      ? html`<div class="block"><span class="label">Diễn giải:</span> ${explanation}</div>`
      : html`<div class="block"><span class="label">Diễn giải:</span></div>`}

    <div class="block"><span class="label">Thời gian cần thực hiện:</span> ${requiredTime}</div>

    <table class="signatures">
      <tr>
        <td>
          <div class="sig-role">Người đề nghị</div>
          <div class="sig-hint">(ký, ghi rõ họ tên)</div>
          ${proposerSignature
            ? html`<img class="sig-img" src="${proposerSignature}" alt="signature" />`
            : html`<div class="sig-img-placeholder"></div>`}
          <div class="sig-name">${proposerName}</div>
        </td>
        <td>
          <div class="sig-role">Trưởng bộ phận</div>
          <div class="sig-hint">(ký, ghi rõ họ tên)</div>
          ${managerApproval?.signature_data_url
            ? html`<img class="sig-img" src="${managerApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-placeholder"></div>`}
          <div class="sig-name">${managerApproval?.actor_name ?? ''}</div>
          ${managerApproval
            ? html`<div class="sig-date">${vnDisplay(managerApproval.acted_at)}</div>`
            : ''}
        </td>
        <td>
          <div class="sig-role">Ban Giám đốc</div>
          <div class="sig-hint">(ký, ghi rõ họ tên)</div>
          ${bodApproval?.signature_data_url
            ? html`<img class="sig-img" src="${bodApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-placeholder"></div>`}
          <div class="sig-name">${bodApproval?.actor_name ?? ''}</div>
          ${bodApproval ? html`<div class="sig-date">${vnDisplay(bodApproval.acted_at)}</div>` : ''}
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

// ===== Phiếu Đề Xuất Mua Hàng — template AVPG-IC-P4-F1 =====
// A4 landscape, bảng 12 cột match mẫu chuẩn.
function printPurchasePage(
  proposal: ProposalRow,
  items: ItemRow[],
  approvals: ApprovalRow[],
  proposerSignature: string | null,
): Html {
  const managerApproval = approvals.find((a) => a.step === 'manager' && a.action === 'approve');
  const bodApproval = approvals.find((a) => a.step === 'bod' && a.action === 'approve');

  const code = (proposal.code as string) ?? '(chưa có mã)';
  const proposerName = (proposal.proposer_name as string) ?? '';
  const proposerDept = (proposal.proposer_dept as string) ?? '';
  const submittedAt = (proposal.submitted_at as string) ?? (proposal.created_at as string) ?? '';
  const deliveryDate = (proposal.delivery_date as string) ?? '';
  const subtotal = Number(proposal.subtotal ?? 0);
  const vatAmount = Number(proposal.vat_amount ?? 0);
  const vatRate = Number(proposal.vat_rate ?? 10);
  const totalAmount = Number(proposal.total_amount ?? 0);
  const reason = (proposal.reason as string) ?? '';
  const title = (proposal.title as string) ?? '';
  const engineeringRequired = Number(proposal.engineering_required ?? 0) === 1;
  const sv1 = (proposal.suggested_vendor_1 as string) ?? '';
  const sv2 = (proposal.suggested_vendor_2 as string) ?? '';
  const sv3 = (proposal.suggested_vendor_3 as string) ?? '';

  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>PR ${code}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: 'Times New Roman', Times, serif;
      color: #000; background: #fff;
      font-size: 9pt;
    }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .page { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 8mm; max-width: 297mm; }
      .print-bar { max-width: 297mm; margin: 0 auto 10px auto; display: flex; justify-content: space-between; }
      .print-bar button, .print-bar a {
        padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1;
        background: white; color: #1e293b; cursor: pointer; text-decoration: none; font: inherit; font-size: 14px;
      }
      .print-bar .primary { background: #2563eb; color: white; border-color: #2563eb; }
    }
    @media print { .print-bar { display: none; } .page { padding: 0; } }

    table { border-collapse: collapse; width: 100%; }
    .header-tbl td { vertical-align: middle; padding: 2mm; }
    .header-tbl .brand-cell { width: 50mm; }
    .header-tbl .brand-text { font-size: 14pt; font-weight: bold; color: #1e3a8a; letter-spacing: 1px; }
    .header-tbl .brand-tag { font-size: 8pt; font-style: italic; color: #b45309; }
    .header-tbl .title-cell { text-align: center; }
    .header-tbl .title-vn { font-size: 13pt; font-weight: bold; }
    .header-tbl .title-en { font-size: 10pt; font-style: italic; }
    .header-tbl .meta-cell {
      width: 55mm; border: 1px solid #000; font-size: 8.5pt;
    }
    .header-tbl .meta-cell table { width: 100%; }
    .header-tbl .meta-cell td { border: 1px solid #000; padding: 1mm 2mm; }
    .header-tbl .meta-cell td.k { width: 26mm; font-weight: bold; }

    .info-tbl { margin-top: 3mm; border: 1px solid #000; }
    .info-tbl td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: middle; }
    .info-tbl .section-head {
      background: #fef9c3; font-weight: bold; font-style: italic; font-size: 9pt;
    }
    .info-tbl .k { width: 24mm; font-weight: bold; font-style: italic; }
    .info-tbl .v { min-height: 4mm; }

    .items-tbl { margin-top: 3mm; font-size: 8.5pt; }
    .items-tbl thead {
      background: #fef9c3; font-style: italic; font-weight: bold; font-size: 8pt;
    }
    .items-tbl th, .items-tbl td {
      border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top;
    }
    .items-tbl th { text-align: center; }
    .items-tbl td.num { text-align: right; }
    .items-tbl td.center { text-align: center; }
    .items-tbl .totals-row td { font-weight: bold; }

    .feedback-tbl { margin-top: 3mm; border: 1px solid #000; }
    .feedback-tbl td { border: 1px solid #000; padding: 1.5mm 2mm; }
    .feedback-tbl .section-head { background: #fef9c3; font-style: italic; font-weight: bold; }
    .feedback-content { min-height: 10mm; }
    .feedback-cb { font-family: monospace; font-size: 10pt; margin-right: 2mm; }

    .vendors-tbl { margin-top: 3mm; }
    .vendors-tbl th, .vendors-tbl td { border: 1px solid #000; padding: 1.5mm 2mm; }
    .vendors-tbl thead { background: #fef9c3; font-style: italic; font-weight: bold; }

    .sig-tbl { margin-top: 3mm; }
    .sig-tbl td {
      border: 1px solid #000; padding: 2mm; vertical-align: top;
      text-align: center; width: 33.33%;
    }
    .sig-tbl .sig-role { font-weight: bold; font-style: italic; }
    .sig-img { height: 20mm; margin: 1mm auto; display: block; max-width: 40mm; object-fit: contain; }
    .sig-img-ph { height: 20mm; }
    .sig-name { font-weight: bold; margin-top: 1mm; }
    .sig-date { font-size: 8pt; font-style: italic; color: #555; }

    .small-italic { font-size: 8pt; font-style: italic; color: #555; }
  </style>
</head>
<body>
  <div class="print-bar">
    <a href="/p/${proposal.id}">← Quay lại phiếu</a>
    <button class="primary" onclick="window.print()">🖨 In phiếu</button>
  </div>
  <div class="page">

    <!-- HEADER: brand + title + meta box -->
    <table class="header-tbl">
      <tr>
        <td class="brand-cell">
          <div class="brand-text">AN VIET PHAT GROUP</div>
          <div class="brand-tag">Together growing strong &amp; success</div>
        </td>
        <td class="title-cell">
          <div class="title-vn">PHIẾU ĐỀ XUẤT MUA HÀNG</div>
          <div class="title-en">PURCHASE REQUEST FORM</div>
        </td>
        <td class="meta-cell">
          <table>
            <tr><td class="k">Mã kiểm soát</td><td>AVPG-IC-P4-F1</td></tr>
            <tr><td class="k">Số sửa đổi</td><td>02</td></tr>
            <tr><td class="k">Ngày ban hành</td><td>20/05/2020</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- 2 cột: thông tin người đề nghị + thông tin KSNB -->
    <table class="info-tbl">
      <tr>
        <td colspan="2" class="section-head">THÔNG TIN DO NGƯỜI ĐỀ NGHỊ / FILLED BY REQUESTER</td>
        <td colspan="2" class="section-head">THÔNG TIN DO PHÒNG KIỂM SOÁT NỘI BỘ / FILLED BY INTERNAL CONTROL DEPARTMENT</td>
      </tr>
      <tr>
        <td class="k">Số PR/<i>PR number</i>:</td><td class="v">${code}</td>
        <td class="k">Người nhận/<i>Received by</i>:</td><td class="v">&nbsp;</td>
      </tr>
      <tr>
        <td class="k">Người đề nghị/<i>Requester</i>:</td><td class="v">${proposerName}</td>
        <td class="k">Ngày nhận/<i>Received date</i>:</td><td class="v">&nbsp;</td>
      </tr>
      <tr>
        <td class="k">Ngày/<i>Date</i>:</td><td class="v">${vnDisplay(submittedAt)}</td>
        <td class="k">Ngày đến hạn/<i>Due date</i>:</td><td class="v">&nbsp;</td>
      </tr>
      <tr>
        <td class="k">Phòng ban/<i>Dept</i>:</td><td class="v">${proposerDept}</td>
        <td colspan="2"></td>
      </tr>
      <tr>
        <td class="k">Ngày YC giao/<i>Date of delivery request</i>:</td><td class="v">${deliveryDate}</td>
        <td colspan="2"></td>
      </tr>
    </table>

    <!-- Bảng items 12 cột -->
    <table class="items-tbl">
      <thead>
        <tr>
          <th style="width:8mm">Stt<br><i>No.</i></th>
          <th style="width:16mm">Mã vật tư</th>
          <th>Tên hàng<br><i>(Items)</i></th>
          <th style="width:22mm">Hình Ảnh<br><i>(Image)</i></th>
          <th>Đặc Điểm Kỹ Thuật<br><i>(Specification)</i></th>
          <th style="width:12mm">Đơn vị<br><i>(Unit)</i></th>
          <th style="width:14mm">SL tồn<br><i>(Q'ty in stock)</i></th>
          <th style="width:14mm">SL mua<br><i>(Q'ty purchased)</i></th>
          <th style="width:20mm">Đơn Giá<br><i>(Unit Price)</i></th>
          <th style="width:22mm">Thành Tiền<br><i>(Price)</i></th>
          <th style="width:20mm">Note</th>
          <th style="width:28mm">Mục đích<br><i>(Purpose)</i></th>
        </tr>
      </thead>
      <tbody>
        ${items.length > 0
          ? items.map(
              (it, i) => html`
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>-</td>
                  <td>${(it.item_name as string) ?? (it.content as string) ?? ''}</td>
                  <td></td>
                  <td>${(it.spec as string) ?? ''}</td>
                  <td class="center">${(it.unit as string) ?? ''}</td>
                  <td class="num">${it.qty_stock != null ? formatVnd(Number(it.qty_stock)) : ''}</td>
                  <td class="num">${it.qty_buy != null ? formatVnd(Number(it.qty_buy)) : ''}</td>
                  <td class="num">${it.unit_price != null ? formatVnd(Number(it.unit_price)) : ''}</td>
                  <td class="num">${it.line_total != null ? formatVnd(Number(it.line_total)) : ''}</td>
                  <td></td>
                  <td>${(it.purpose as string) ?? ''}</td>
                </tr>
              `,
            )
          : html`<tr><td colspan="12" style="text-align:center; font-style:italic; color:#888;">(Chưa có hạng mục)</td></tr>`}
        <tr class="totals-row">
          <td colspan="9" style="text-align:right;">Thuế VAT ${vatRate}%/<i>${vatRate}% VAT Tax</i></td>
          <td class="num">${formatVnd(vatAmount)} VND</td>
          <td colspan="2"></td>
        </tr>
        <tr class="totals-row">
          <td colspan="9" style="text-align:right;">Tổng Thành Tiền/<i>Total Price</i> (VND)</td>
          <td class="num">${formatVnd(totalAmount)} VND</td>
          <td colspan="2"></td>
        </tr>
        <tr>
          <td colspan="12" class="small-italic">
            (*): Giá trên chỉ mang tính chất tham khảo và chưa thuế VAT/<i>The above prices are for reference only and not not including VAT tax.</i>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- EN feedback -->
    <table class="feedback-tbl">
      <tr><td colspan="2" class="section-head">THÔNG TIN PHẢN HỒI TỪ PHÒNG KỸ THUẬT CÔNG NGHỆ / FEEDBACK INFORMATION FROM ENGINEERING DEPARTMENT</td></tr>
      <tr>
        <td style="width:50%">
          <span class="feedback-cb">${engineeringRequired ? '☑' : '☐'}</span>
          Cần làm việc trực tiếp với Nhà cung cấp
        </td>
        <td>
          <span class="feedback-cb">${engineeringRequired ? '☐' : '☑'}</span>
          Không cần làm việc với Nhà cung cấp
        </td>
      </tr>
      <tr><td colspan="2" class="feedback-content">${reason ? html`<b>Nội dung đề xuất:</b> ${title}<br/><b>Lý do:</b> ${reason}` : '&nbsp;'}</td></tr>
      <tr>
        <td><b>Kiểm Tra/<i>Checked By</i></b></td>
        <td><b>Phê Duyệt/<i>Approved By</i></b></td>
      </tr>
      <tr style="height: 18mm">
        <td style="text-align:center; vertical-align:middle;">
          ${managerApproval?.signature_data_url
            ? html`<img class="sig-img" src="${managerApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-ph"></div>`}
          <div>${managerApproval?.actor_name ?? ''}</div>
          ${managerApproval ? html`<div class="sig-date">Ngày/Date: ${vnDisplay(managerApproval.acted_at)}</div>` : ''}
        </td>
        <td style="text-align:center; vertical-align:middle;">
          ${bodApproval?.signature_data_url
            ? html`<img class="sig-img" src="${bodApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-ph"></div>`}
          <div>${bodApproval?.actor_name ?? ''}</div>
          ${bodApproval ? html`<div class="sig-date">Ngày/Date: ${vnDisplay(bodApproval.acted_at)}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- Vendors -->
    <table class="vendors-tbl">
      <thead>
        <tr>
          <td colspan="4" class="section-head" style="background:#fef9c3;">NHÀ CUNG CẤP ĐỀ NGHỊ / RECOMMENDED SUPPLIER BY REQUESTER</td>
        </tr>
        <tr>
          <th style="width:10mm">Stt<br><i>No.</i></th>
          <th>NCC đề nghị<br><i>(Suggested vendors)</i></th>
          <th>Địa chỉ &amp; số điện thoại<br><i>(Address &amp; contact numbers)</i></th>
          <th style="width:40mm">Người liên hệ<br><i>(Contact person)</i></th>
        </tr>
      </thead>
      <tbody>
        ${[sv1, sv2, sv3].map(
          (v, i) => html`
            <tr>
              <td class="center">${i + 1}</td>
              <td colspan="3">${v || '&nbsp;'}</td>
            </tr>
          `,
        )}
      </tbody>
    </table>

    <!-- 3 chữ ký cuối -->
    <table class="sig-tbl">
      <tr>
        <td><div class="sig-role">Đề Xuất/<i>Requested By</i></div></td>
        <td><div class="sig-role">Kiểm Tra/<i>Checked By</i></div></td>
        <td><div class="sig-role">Phê Duyệt/<i>Approved By</i></div></td>
      </tr>
      <tr style="height: 22mm">
        <td>
          ${proposerSignature
            ? html`<img class="sig-img" src="${proposerSignature}" alt="signature" />`
            : html`<div class="sig-img-ph"></div>`}
          <div class="sig-name">${proposerName}</div>
          <div class="sig-date">Ngày/Date: ${vnDisplay(submittedAt)}</div>
        </td>
        <td>
          ${managerApproval?.signature_data_url
            ? html`<img class="sig-img" src="${managerApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-ph"></div>`}
          <div class="sig-name">${managerApproval?.actor_name ?? ''}</div>
          ${managerApproval
            ? html`<div class="sig-date">Ngày/Date: ${vnDisplay(managerApproval.acted_at)}</div>`
            : ''}
        </td>
        <td>
          ${bodApproval?.signature_data_url
            ? html`<img class="sig-img" src="${bodApproval.signature_data_url}" alt="signature" />`
            : html`<div class="sig-img-ph"></div>`}
          <div class="sig-name">${bodApproval?.actor_name ?? ''}</div>
          ${bodApproval
            ? html`<div class="sig-date">Ngày/Date: ${vnDisplay(bodApproval.acted_at)}</div>`
            : ''}
        </td>
      </tr>
    </table>

  </div>
</body>
</html>`;
}

// Print view — render HTML A4 cho phiếu đề xuất theo template HR-10.
// User mở /p/:id/print → Ctrl+P để in hoặc save PDF.

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { vnDisplay } from '../lib/time';

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

type ProposalRow = Record<string, unknown>;
type ItemRow = Record<string, unknown>;
type ApprovalRow = {
  step: 'manager' | 'bod' | 'ksnb' | string;
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

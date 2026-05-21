// Email templates — HTML table-based để compat Outlook desktop.
// Tham chiếu workflow-phase1.md mục 4.

import type { Bindings } from '../types';
import type { NotificationEvent } from './notifications';
import { vnDisplay } from './time';

type ProposalRow = {
  id: number;
  code: string | null;
  status: string;
  proposer_name: string;
  proposer_dept: string;
  title: string;
  reason: string;
  required_time: string;
  manager_name: string | null;
  manager_acted_at: string | null;
  bod_name: string | null;
  bod_acted_at: string | null;
  rejected_reason: string | null;
  completed_at: string | null;
};

type ApprovalRow = {
  step: string;
  actor_name: string;
  action: string;
  comment: string | null;
  acted_at: string;
};

export type RenderedEmail = { subject: string; html: string };

// HTML escape — chống XSS từ user-content (title, reason, comment).
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(s: string | null | undefined): string {
  return esc(s).replace(/\n/g, '<br>');
}

function proposalUrl(env: Bindings, id: number): string {
  return `${env.APP_BASE_URL}/p/${id}`;
}

// Layout chung — giảm duplication.
function wrap(env: Bindings, title: string, innerHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;">
          <strong style="font-size:14px;color:#1f2937;">📋 AVPG · Phiếu Đề Xuất</strong>
        </td></tr>
        <tr><td style="padding:24px;font-size:14px;line-height:1.6;">
          <h2 style="margin:0 0 16px 0;font-size:18px;color:#111827;">${esc(title)}</h2>
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
          Email tự động · vui lòng không reply · ${esc(env.NO_REPLY_MAILBOX)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function infoTable(rows: Array<[string, string]>): string {
  const tr = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:#6b7280;width:140px;vertical-align:top;">${esc(k)}</td>
        <td style="padding:6px 0;color:#111827;">${v /* allow inline html */}</td>
      </tr>`,
    )
    .join('');
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;">${tr}</table>`;
}

function button(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px 0;"><tr><td style="background:#2563eb;border-radius:6px;">
    <a href="${esc(url)}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${esc(label)}</a>
  </td></tr></table>`;
}

// ---------- Render từng template ----------

function renderSubmitted(env: Bindings, p: ProposalRow): RenderedEmail {
  const subject = `[AVPG] Phiếu đề xuất ${p.code} cần bạn duyệt`;
  const inner = `
    <p>Kính gửi <strong>${esc(p.manager_name ?? '')}</strong>,</p>
    <p>Anh/chị có 1 phiếu đề xuất mới cần duyệt:</p>
    ${infoTable([
      ['Mã phiếu', `<code>${esc(p.code ?? '')}</code>`],
      ['Người đề nghị', `${esc(p.proposer_name)} (${esc(p.proposer_dept)})`],
      ['Nội dung', esc(p.title)],
      ['Thời gian', esc(p.required_time)],
    ])}
    <div style="margin-top:16px;padding:12px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:4px;">
      <div style="color:#6b7280;font-size:12px;margin-bottom:4px;">Lý do</div>
      <div>${nl2br(p.reason)}</div>
    </div>
    ${button('Mở phiếu để duyệt', proposalUrl(env, p.id))}
  `;
  return { subject, html: wrap(env, 'Phiếu mới cần duyệt', inner) };
}

function renderManagerApproved(
  env: Bindings,
  p: ProposalRow,
  managerComment: string | null,
): RenderedEmail {
  const subject = `[AVPG] Phiếu ${p.code} đã qua TP — chờ BGĐ duyệt`;
  const inner = `
    <p>Kính gửi <strong>${esc(p.bod_name ?? '')}</strong>,</p>
    <p>Phiếu đề xuất sau đã được Trưởng phòng duyệt, kính chuyển BGĐ:</p>
    ${infoTable([
      ['Mã phiếu', `<code>${esc(p.code ?? '')}</code>`],
      ['Đề xuất', esc(p.title)],
      ['Người đề nghị', `${esc(p.proposer_name)} (${esc(p.proposer_dept)})`],
      [
        'TP đã duyệt',
        `${esc(p.manager_name ?? '')}${p.manager_acted_at ? ` <span style="color:#9ca3af">(${esc(vnDisplay(p.manager_acted_at))})</span>` : ''}`,
      ],
      ['Ý kiến TP', managerComment ? esc(managerComment) : '<span style="color:#9ca3af">(không có)</span>'],
    ])}
    ${button('Mở phiếu để duyệt', proposalUrl(env, p.id))}
  `;
  return { subject, html: wrap(env, 'Phiếu chờ BGĐ duyệt', inner) };
}

// Phase 1: bod_approved chỉ còn dùng cho group telegram informational notify.
// Email template giữ để future-proof (nếu thêm KSNB email list sau).
function renderBodApproved(env: Bindings, p: ProposalRow): RenderedEmail {
  const subject = `[AVPG] Phiếu ${p.code} đã duyệt xong`;
  const inner = `
    <p>Phiếu đề xuất sau đã được duyệt xong end-to-end:</p>
    ${infoTable([
      ['Mã phiếu', `<code>${esc(p.code ?? '')}</code>`],
      ['Đề xuất', esc(p.title)],
      ['Người đề nghị', `${esc(p.proposer_name)} (${esc(p.proposer_dept)})`],
      ['TP duyệt', esc(p.manager_name ?? '')],
      [
        'BGĐ duyệt',
        `${esc(p.bod_name ?? '')}${p.bod_acted_at ? ` <span style="color:#9ca3af">(${esc(vnDisplay(p.bod_acted_at))})</span>` : ''}`,
      ],
    ])}
    ${button('Mở phiếu', proposalUrl(env, p.id))}
  `;
  return { subject, html: wrap(env, 'Phiếu đã duyệt xong', inner) };
}

function renderCompleted(env: Bindings, p: ProposalRow): RenderedEmail {
  const subject = `[AVPG] Phiếu ${p.code} của bạn đã được duyệt`;
  const inner = `
    <p><strong>${esc(p.proposer_name)}</strong>,</p>
    <p>Phiếu đề xuất "<strong>${esc(p.title)}</strong>" của bạn đã được duyệt xong.</p>
    ${infoTable([
      ['Mã phiếu', `<code>${esc(p.code ?? '')}</code>`],
      [
        'TP duyệt',
        `${esc(p.manager_name ?? '')} <span style="color:#9ca3af">(${esc(vnDisplay(p.manager_acted_at))})</span>`,
      ],
      [
        'BGĐ duyệt',
        `${esc(p.bod_name ?? '')} <span style="color:#9ca3af">(${esc(vnDisplay(p.bod_acted_at))})</span>`,
      ],
    ])}
    ${button('Xem chi tiết phiếu', proposalUrl(env, p.id))}
  `;
  return { subject, html: wrap(env, 'Phiếu đã được duyệt', inner) };
}

function renderRejected(
  env: Bindings,
  p: ProposalRow,
  rejector: ApprovalRow | undefined,
): RenderedEmail {
  const stepLabel =
    rejector?.step === 'manager'
      ? 'Trưởng phòng'
      : rejector?.step === 'bod'
        ? 'Ban Giám đốc'
        : '(không xác định)';
  const subject = `[AVPG] Phiếu ${p.code} bị từ chối`;
  const inner = `
    <p><strong>${esc(p.proposer_name)}</strong>,</p>
    <p>Phiếu đề xuất của bạn đã bị từ chối tại bước <strong>${esc(stepLabel)}</strong>:</p>
    ${infoTable([
      ['Mã phiếu', `<code>${esc(p.code ?? '')}</code>`],
      ['Đề xuất', esc(p.title)],
      [
        'Người từ chối',
        `${esc(rejector?.actor_name ?? '')}${rejector ? ` <span style="color:#9ca3af">(${esc(vnDisplay(rejector.acted_at))})</span>` : ''}`,
      ],
    ])}
    <div style="margin-top:16px;padding:12px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:4px;">
      <div style="color:#991b1b;font-size:12px;margin-bottom:4px;font-weight:600;">Lý do từ chối</div>
      <div>${nl2br(p.rejected_reason)}</div>
    </div>
    <p style="margin-top:16px;color:#6b7280;font-size:13px;">Bạn có thể tạo phiếu mới nếu cần đề xuất lại.</p>
    ${button('Xem phiếu', proposalUrl(env, p.id))}
  `;
  return { subject, html: wrap(env, 'Phiếu bị từ chối', inner) };
}

// ---------- Dispatcher ----------

export async function renderEmail(
  env: Bindings,
  event: NotificationEvent,
  proposalId: number,
): Promise<RenderedEmail> {
  const p = await env.DB.prepare(
    `SELECT id, code, status, proposer_name, proposer_dept, title, reason, required_time,
            manager_name, manager_acted_at, bod_name, bod_acted_at,
            rejected_reason, completed_at
       FROM proposals WHERE id = ?1`,
  )
    .bind(proposalId)
    .first<ProposalRow>();
  if (!p) throw new Error(`Proposal ${proposalId} không tồn tại`);

  switch (event) {
    case 'submitted':
      return renderSubmitted(env, p);
    case 'manager_approved': {
      const a = await env.DB.prepare(
        `SELECT step, actor_name, action, comment, acted_at FROM approvals
          WHERE proposal_id = ?1 AND step = 'manager' AND action = 'approve'
          ORDER BY acted_at DESC LIMIT 1`,
      )
        .bind(proposalId)
        .first<ApprovalRow>();
      return renderManagerApproved(env, p, a?.comment ?? null);
    }
    case 'bod_approved':
      return renderBodApproved(env, p);
    case 'completed':
      return renderCompleted(env, p);
    case 'rejected': {
      const a = await env.DB.prepare(
        `SELECT step, actor_name, action, comment, acted_at FROM approvals
          WHERE proposal_id = ?1 AND action = 'reject' ORDER BY acted_at DESC LIMIT 1`,
      )
        .bind(proposalId)
        .first<ApprovalRow>();
      return renderRejected(env, p, a ?? undefined);
    }
  }
}

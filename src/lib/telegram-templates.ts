// Telegram message templates — text + inline buttons.
// Tham chiếu workflow-phase1.md mục 5.2 (format DM). P2.1: thêm badge mua hàng + total.

import type { Bindings } from '../types';
import type { NotificationEvent } from './notifications';
import type { InlineKeyboard } from './telegram';
import { formatVnd } from './pr-math';
import { tgEsc } from './telegram';

type ProposalRow = {
  id: number;
  code: string | null;
  proposal_type: 'general' | 'purchase';
  proposer_name: string;
  proposer_dept: string;
  title: string;
  required_time: string;
  manager_name: string | null;
  engineering_name: string | null;
  ic_name: string | null;
  bod_name: string | null;
  total_amount: number | null;
  rejected_reason: string | null;
};

// Prefix line cho PR — show badge + total. Empty string nếu general.
function prMeta(p: ProposalRow): string {
  if (p.proposal_type !== 'purchase') return '';
  let s = `🛒 <b>Mua hàng</b>`;
  if (p.total_amount != null) s += ` · ${formatVnd(p.total_amount)} VND`;
  return s + '\n';
}

export type RenderedTelegram = {
  text: string;
  replyMarkup?: { inline_keyboard: InlineKeyboard };
};

function detailUrl(env: Bindings, id: number): string {
  return `${env.APP_BASE_URL}/p/${id}`;
}

function detailButtonRow(env: Bindings, id: number): InlineKeyboard[number] {
  return [{ text: '📄 Xem chi tiết', url: detailUrl(env, id) }];
}

export async function renderTelegram(
  env: Bindings,
  event: NotificationEvent,
  proposalId: number,
  opts: { withActionButtons: boolean },
): Promise<RenderedTelegram> {
  const p = await env.DB.prepare(
    `SELECT id, code, proposal_type, proposer_name, proposer_dept, title, required_time,
            manager_name, engineering_name, ic_name, bod_name,
            total_amount, rejected_reason
       FROM proposals WHERE id = ?1`,
  )
    .bind(proposalId)
    .first<ProposalRow>();
  if (!p) throw new Error(`Proposal ${proposalId} không tồn tại`);

  switch (event) {
    case 'submitted': {
      const text =
        `🔔 <b>Phiếu ${p.proposal_type === 'purchase' ? 'mua hàng ' : ''}mới cần duyệt</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}` +
        (p.proposal_type === 'general' && p.required_time ? `\n⏱ ${tgEsc(p.required_time)}` : '');
      return { text, replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] } };
    }
    case 'manager_approved': {
      // PR: sau TP có thể là EN hoặc IC. General: chờ BGĐ.
      const headerLabel =
        p.proposal_type === 'purchase' ? 'Phiếu mua hàng chờ duyệt tiếp' : 'Phiếu chờ BGĐ duyệt';
      const text =
        `🔔 <b>${headerLabel}</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `✓ TP duyệt: ${tgEsc(p.manager_name)}`;
      return { text, replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] } };
    }
    case 'engineering_approved': {
      const text =
        `🔔 <b>Phiếu mua hàng chờ BGĐ duyệt</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `✓ TP: ${tgEsc(p.manager_name)}\n` +
        `✓ EN: ${tgEsc(p.engineering_name)}`;
      return { text, replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] } };
    }
    case 'ic_approved': {
      const text =
        `🔔 <b>Phiếu mua hàng chờ BGĐ duyệt</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `✓ TP: ${tgEsc(p.manager_name)}` +
        (p.engineering_name ? `\n✓ EN: ${tgEsc(p.engineering_name)}` : '') +
        `\n✓ IC: ${tgEsc(p.ic_name)}`;
      return { text, replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] } };
    }
    case 'bod_approved': {
      // Phase 1: dùng cho group KSNB informational notify khi phiếu hoàn thành
      const text =
        `✅ <b>Phiếu ${p.proposal_type === 'purchase' ? 'mua hàng ' : ''}đã duyệt xong</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `✓ TP: ${tgEsc(p.manager_name)}\n` +
        `✓ BGĐ: ${tgEsc(p.bod_name)}`;
      return {
        text,
        replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] },
      };
    }
    case 'completed': {
      const text =
        `✅ <b>Phiếu của bạn đã hoàn thành</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `📝 ${tgEsc(p.title)}`;
      return {
        text,
        replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] },
      };
    }
    case 'rejected': {
      const text =
        `❌ <b>Phiếu bị từ chối</b>\n\n` +
        prMeta(p) +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `📝 ${tgEsc(p.title)}\n\n` +
        `<b>Lý do:</b>\n${tgEsc(p.rejected_reason ?? '')}`;
      return {
        text,
        replyMarkup: { inline_keyboard: [detailButtonRow(env, p.id)] },
      };
    }
  }
}

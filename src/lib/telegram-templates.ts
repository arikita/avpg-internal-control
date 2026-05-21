// Telegram message templates — text + inline buttons.
// Tham chiếu workflow-phase1.md mục 5.2 (format DM).

import type { Bindings } from '../types';
import type { NotificationEvent } from './notifications';
import type { InlineKeyboard } from './telegram';
import { tgEsc } from './telegram';

type ProposalRow = {
  id: number;
  code: string | null;
  proposer_name: string;
  proposer_dept: string;
  title: string;
  required_time: string;
  manager_name: string | null;
  bod_name: string | null;
  rejected_reason: string | null;
};

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

function actionButtonRow(id: number): InlineKeyboard[number] {
  return [
    { text: '✅ Duyệt', callback_data: `act:approve:${id}` },
    { text: '❌ Từ chối', callback_data: `act:reject:${id}` },
  ];
}

export async function renderTelegram(
  env: Bindings,
  event: NotificationEvent,
  proposalId: number,
  opts: { withActionButtons: boolean },
): Promise<RenderedTelegram> {
  const p = await env.DB.prepare(
    `SELECT id, code, proposer_name, proposer_dept, title, required_time,
            manager_name, bod_name, rejected_reason
       FROM proposals WHERE id = ?1`,
  )
    .bind(proposalId)
    .first<ProposalRow>();
  if (!p) throw new Error(`Proposal ${proposalId} không tồn tại`);

  switch (event) {
    case 'submitted': {
      const text =
        `🔔 <b>Phiếu đề xuất mới cần duyệt</b>\n\n` +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `⏱ ${tgEsc(p.required_time)}`;
      const kb: InlineKeyboard = opts.withActionButtons
        ? [actionButtonRow(p.id), detailButtonRow(env, p.id)]
        : [detailButtonRow(env, p.id)];
      return { text, replyMarkup: { inline_keyboard: kb } };
    }
    case 'manager_approved': {
      const text =
        `🔔 <b>Phiếu chờ BGĐ duyệt</b>\n\n` +
        `📋 <code>${tgEsc(p.code)}</code>\n` +
        `👤 ${tgEsc(p.proposer_name)} — ${tgEsc(p.proposer_dept)}\n` +
        `📝 ${tgEsc(p.title)}\n` +
        `✓ TP duyệt: ${tgEsc(p.manager_name)}`;
      const kb: InlineKeyboard = opts.withActionButtons
        ? [actionButtonRow(p.id), detailButtonRow(env, p.id)]
        : [detailButtonRow(env, p.id)];
      return { text, replyMarkup: { inline_keyboard: kb } };
    }
    case 'bod_approved': {
      // Phase 1: dùng cho group KSNB informational notify khi phiếu hoàn thành
      const text =
        `✅ <b>Phiếu đề xuất đã duyệt xong</b>\n\n` +
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

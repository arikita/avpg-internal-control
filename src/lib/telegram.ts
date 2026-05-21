// Telegram Bot API wrappers. Doc: https://core.telegram.org/bots/api

import type { Bindings } from '../types';

const API_BASE = 'https://api.telegram.org';

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];
export type ReplyMarkup = { inline_keyboard: InlineKeyboard } | { remove_keyboard: true };

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description: string };

async function call<T>(env: Bindings, method: string, payload: unknown): Promise<TelegramResponse<T>> {
  const res = await fetch(`${API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export type SendMessageArgs = {
  chatId: string | number;
  text: string;
  replyMarkup?: ReplyMarkup;
  // Markdown-style 'MarkdownV2' yêu cầu escape nhiều ký tự — Phase 1 dùng HTML.
  parseMode?: 'HTML' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
};

export async function sendMessage(
  env: Bindings,
  args: SendMessageArgs,
): Promise<TelegramResponse<{ message_id: number }>> {
  return call(env, 'sendMessage', {
    chat_id: args.chatId,
    text: args.text,
    parse_mode: args.parseMode ?? 'HTML',
    reply_markup: args.replyMarkup,
    disable_web_page_preview: args.disableWebPagePreview ?? true,
  });
}

export type EditMessageTextArgs = {
  chatId: string | number;
  messageId: number;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  replyMarkup?: ReplyMarkup;
};

export async function editMessageText(
  env: Bindings,
  args: EditMessageTextArgs,
): Promise<TelegramResponse<unknown>> {
  return call(env, 'editMessageText', {
    chat_id: args.chatId,
    message_id: args.messageId,
    text: args.text,
    parse_mode: args.parseMode ?? 'HTML',
    reply_markup: args.replyMarkup,
  });
}

export async function answerCallbackQuery(
  env: Bindings,
  callbackId: string,
  text?: string,
  showAlert = false,
): Promise<TelegramResponse<unknown>> {
  return call(env, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
    show_alert: showAlert,
  });
}

// HTML escape — Telegram HTML mode chỉ cần escape <, >, &.
export function tgEsc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

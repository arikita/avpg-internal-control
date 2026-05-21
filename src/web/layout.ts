// HTML layout shell — Tailwind + Alpine CDN. Render server-side bằng hono/html.

import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import type { SessionUser } from '../types';

// hono/html trả union sync/async tuỳ embedded values.
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

type LayoutOpts = {
  title: string;
  user?: SessionUser | null | undefined;
  body: Html | string;
  bodyClass?: string;
};

export async function page({ title, user, body, bodyClass = 'bg-slate-50' }: LayoutOpts): Promise<HtmlEscapedString> {
  const resolvedBody = typeof body === 'string' ? body : await body;
  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · AVPG · Phiếu Đề Xuất</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%22.9em%22 font-size=%2222%22>📋</text></svg>" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body class="${bodyClass} text-slate-800 min-h-screen flex flex-col">
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 font-semibold text-slate-900">
        <span class="text-xl">📋</span>
        <span>AVPG · Phiếu Đề Xuất</span>
      </a>
      <nav class="flex items-center gap-4 text-sm">
        ${user
          ? html`
              <a href="/app" class="text-slate-600 hover:text-slate-900">Dashboard</a>
              <a href="/p/new" class="text-slate-600 hover:text-slate-900">Tạo phiếu</a>
              <span class="text-slate-400">|</span>
              <span class="text-slate-600">${user.name}</span>
              <form method="post" action="/auth/logout" class="inline">
                <button type="submit" class="text-slate-500 hover:text-red-600">Đăng xuất</button>
              </form>
            `
          : html`<a href="/auth/login" class="text-blue-600 hover:underline">Đăng nhập M365</a>`}
      </nav>
    </div>
  </header>
  <main class="flex-1">
    <div class="max-w-6xl mx-auto px-4 py-6">
      ${resolvedBody}
    </div>
  </main>
  <footer class="border-t border-slate-200 bg-white">
    <div class="max-w-6xl mx-auto px-4 py-3 text-xs text-slate-400 flex justify-between">
      <span>© AVPG · Hệ thống quy trình nội bộ</span>
      <span>Phase 1</span>
    </div>
  </footer>
</body>
</html>`;
}

// Helper render badge cho status.
export function statusBadge(status: string): Html {
  const map: Record<string, { label: string; cls: string }> = {
    draft:             { label: 'Nháp',           cls: 'bg-slate-100 text-slate-700' },
    submitted:         { label: 'Chờ TP duyệt',   cls: 'bg-amber-100 text-amber-800' },
    manager_approved:  { label: 'Chờ BGĐ duyệt',  cls: 'bg-blue-100 text-blue-800' },
    bod_approved:      { label: 'Chờ KSNB',       cls: 'bg-indigo-100 text-indigo-800' },
    completed:         { label: 'Hoàn thành',     cls: 'bg-emerald-100 text-emerald-800' },
    rejected:          { label: 'Từ chối',        cls: 'bg-rose-100 text-rose-800' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700' };
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}">${m.label}</span>`;
}

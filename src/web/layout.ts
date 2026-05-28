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
  // noChrome: bỏ header/footer + container — dùng cho trang landing full-bleed.
  noChrome?: boolean;
};

export async function page({ title, user, body, bodyClass = 'bg-slate-50', noChrome = false }: LayoutOpts): Promise<HtmlEscapedString> {
  const resolvedBody = typeof body === 'string' ? body : await body;
  const chrome = noChrome
    ? html`${resolvedBody}`
    : html`
  <header class="bg-gradient-to-r from-blue-950 via-blue-900 to-blue-800 text-white shadow-sm">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="text-xl">📋</span>
        <span class="flex flex-col leading-tight">
          <span class="text-[10px] tracking-[0.3em] text-yellow-400 font-semibold">AN VIỆT PHÁT GROUP</span>
          <span class="font-semibold text-white">Phiếu Đề Xuất</span>
        </span>
      </a>
      <nav class="flex items-center gap-4 text-sm">
        ${user
          ? html`
              <a href="/app" class="text-blue-100 hover:text-yellow-400 transition">Dashboard</a>
              <a href="/p/new" class="text-blue-100 hover:text-yellow-400 transition">Tạo phiếu</a>
              ${user.isAdmin
                ? html`<div class="relative" x-data="{ o: false }">
                    <button @click="o=!o" class="text-blue-100 hover:text-yellow-400 transition">Quản trị ▾</button>
                    <div x-show="o" x-cloak @click.outside="o=false"
                      class="absolute right-0 mt-2 w-48 bg-white text-slate-700 rounded-md shadow-lg ring-1 ring-slate-200 py-1 z-50">
                      <a href="/admin/approvers" class="block px-3 py-2 text-sm hover:bg-blue-50">Người duyệt</a>
                      <a href="/admin/audit" class="block px-3 py-2 text-sm hover:bg-blue-50">Nhật ký duyệt</a>
                    </div>
                  </div>`
                : ''}
              <span class="text-blue-300/50">|</span>
              <span class="text-blue-100">${user.name}</span>
              <form method="post" action="/auth/logout" class="inline">
                <button type="submit" class="text-blue-200 hover:text-red-300 transition">Đăng xuất</button>
              </form>
            `
          : html`<a href="/auth/login" class="text-yellow-400 hover:underline">Đăng nhập M365</a>`}
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
      <span>© 2026 An Việt Phát Group · Hệ thống quy trình nội bộ</span>
      <span>Phase 1</span>
    </div>
  </footer>`;

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
  ${chrome}
</body>
</html>`;
}

// Helper render badge cho status.
export function statusBadge(status: string): Html {
  const map: Record<string, { label: string; cls: string }> = {
    draft:             { label: 'Nháp',           cls: 'bg-slate-100 text-slate-700' },
    submitted:         { label: 'Chờ TP duyệt',   cls: 'bg-amber-100 text-amber-800' },
    manager_approved:  { label: 'Đã qua TP',      cls: 'bg-blue-100 text-blue-800' },
    en_approved:       { label: 'Đã qua EN',      cls: 'bg-indigo-100 text-indigo-800' },
    ic_approved:       { label: 'Chờ BGĐ duyệt',  cls: 'bg-violet-100 text-violet-800' },
    completed:         { label: 'Đã duyệt',       cls: 'bg-emerald-100 text-emerald-800' },
    rejected:          { label: 'Từ chối',        cls: 'bg-rose-100 text-rose-800' },
    cancelled:         { label: 'Đã huỷ',         cls: 'bg-slate-200 text-slate-600' },
    // bod_approved: state cũ trước khi bỏ KSNB workflow. Phiếu legacy vẫn render generic.
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700' };
  return html`<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}">${m.label}</span>`;
}

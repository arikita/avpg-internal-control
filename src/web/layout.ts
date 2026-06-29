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
  // wide: nới container rộng hơn (trang nhiều cột, vd bảng công nợ HĐ NCC).
  wide?: boolean;
};

export async function page({ title, user, body, bodyClass = 'bg-background text-foreground', noChrome = false, wide = false }: LayoutOpts): Promise<HtmlEscapedString> {
  const resolvedBody = typeof body === 'string' ? body : await body;
  const containerW = wide ? 'max-w-screen-2xl' : 'max-w-6xl';
  const chrome = noChrome
    ? html`${resolvedBody}`
    : html`
  <header class="bg-card/95 backdrop-blur border-b border-border text-foreground shadow-sm sticky top-0 z-40">
    <div class="${containerW} mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="flex items-center gap-3">
        <span class="text-xl">📋</span>
        <span class="flex flex-col leading-tight">
          <span class="text-[10px] tracking-[0.3em] text-[#C5A622] font-semibold">AN VIỆT PHÁT GROUP</span>
          <span class="font-semibold text-foreground">Phiếu Đề Xuất</span>
        </span>
      </a>
      <nav class="flex items-center gap-4 text-sm">
        ${user
          ? html`
              <a href="/app" class="text-muted-foreground hover:text-foreground transition">Dashboard</a>
              <a href="/p/new" class="text-muted-foreground hover:text-foreground transition">Tạo phiếu</a>
              ${user.deptCode?.toUpperCase() === 'IT'
                ? html`<a href="/payments" class="text-muted-foreground hover:text-foreground transition">Đề nghị TT</a>`
                : ''}
              <a href="/invoices" class="text-muted-foreground hover:text-foreground transition">Hóa đơn NCC</a>
              ${user.isAdmin
                ? html`<div class="relative" x-data="{ o: false }">
                    <button @click="o=!o" class="text-muted-foreground hover:text-foreground transition">Quản trị ▾</button>
                    <div x-show="o" x-cloak @click.outside="o=false"
                      class="absolute right-0 mt-2 w-48 bg-card text-foreground rounded-md shadow-lg ring-1 ring-border py-1 z-50">
                      <a href="/admin/approvers" class="block px-3 py-2 text-sm hover:bg-muted">Người duyệt</a>
                      <a href="/admin/audit" class="block px-3 py-2 text-sm hover:bg-muted">Nhật ký duyệt</a>
                      <a href="/invoices/admin/buyer-map" class="block px-3 py-2 text-sm hover:bg-muted">Map nhà máy (HĐ)</a>
                    </div>
                  </div>`
                : ''}
              <div x-data="inboxBell()" class="relative">
                <button @click="open=!open" class="relative flex items-center text-muted-foreground hover:text-foreground transition pt-1" title="Thông báo">
                  <span class="text-lg">🔔</span>
                  <span x-show="unread>0" x-cloak x-text="unread>9?'9+':unread"
                    class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] leading-none rounded-full px-1 py-0.5 min-w-[16px] text-center"></span>
                </button>
                <div x-show="open" x-cloak @click.outside="open=false"
                  class="absolute right-0 mt-2 w-80 bg-card text-foreground rounded-md shadow-lg ring-1 ring-border z-50">
                  <div class="flex items-center justify-between px-3 py-2 border-b border-border">
                    <span class="text-sm font-semibold">Thông báo</span>
                    <button @click="markAll()" x-show="unread>0" class="text-xs text-[#C5A622] hover:underline">Đánh dấu đã đọc</button>
                  </div>
                  <div class="max-h-96 overflow-auto">
                    <template x-if="items.length===0">
                      <div class="px-3 py-6 text-center text-sm text-muted-foreground">Chưa có thông báo</div>
                    </template>
                    <template x-for="it in items" :key="it.id">
                      <a href="#" @click.prevent="openItem(it)" class="block px-3 py-2 border-b border-border hover:bg-muted"
                        :class="!it.read_at ? 'bg-primary/10' : ''">
                        <div class="flex items-start gap-2">
                          <span class="mt-1 w-2 h-2 rounded-full shrink-0" :class="!it.read_at ? 'bg-primary' : 'bg-transparent'"></span>
                          <div class="min-w-0">
                            <div class="text-sm font-medium text-foreground" x-text="it.title"></div>
                            <div class="text-xs text-muted-foreground" x-text="it.body"></div>
                            <div class="text-[11px] text-muted-foreground/80" x-text="fmt(it.created_at)"></div>
                          </div>
                        </div>
                      </a>
                    </template>
                  </div>
                </div>
                <!-- Toast nổi góc dưới phải (position:fixed nên thoát khỏi header) -->
                <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
                  <template x-for="t in toasts" :key="t.id">
                    <div class="pointer-events-auto bg-card text-foreground rounded-lg shadow-xl ring-1 ring-border p-3 flex items-start gap-2">
                      <span class="text-lg">🖊️</span>
                      <div class="min-w-0 flex-1 cursor-pointer" @click="openItem(t)">
                        <div class="text-sm font-semibold text-foreground" x-text="t.title"></div>
                        <div class="text-xs text-muted-foreground" x-text="t.body"></div>
                      </div>
                      <button @click.stop="dismiss(t.id)" class="text-muted-foreground hover:text-foreground text-sm leading-none">✕</button>
                    </div>
                  </template>
                </div>
              </div>
              <span class="text-border">|</span>
              <span class="text-foreground">${user.name}</span>
              <form method="post" action="/auth/logout" class="inline">
                <button type="submit" class="text-muted-foreground hover:text-red-500 transition">Đăng xuất</button>
              </form>
            `
          : html`<a href="/auth/login" class="text-[#C5A622] hover:underline">Đăng nhập M365</a>`}
      </nav>
    </div>
  </header>
  <main class="flex-1">
    <div class="${containerW} mx-auto px-4 py-6">
      ${resolvedBody}
    </div>
  </main>
  <footer class="border-t border-border bg-card">
    <div class="${containerW} mx-auto px-4 py-3 text-xs text-muted-foreground flex justify-between">
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
  <script>
    // Design system dùng chung (đồng bộ với trang login / template sign). Semantic colors trỏ
    // tới CSS vars để tự đổi theo dark/light. Mọi trang tham chiếu bg-background/foreground/card/
    // border/muted/primary thay vì hard-code slate/blue.
    tailwind.config = {
      darkMode: 'media',
      theme: {
        extend: {
          colors: {
            background: 'hsl(var(--bg))',
            foreground: 'hsl(var(--fg))',
            card: 'hsl(var(--card))',
            'card-foreground': 'hsl(var(--card-fg))',
            muted: 'hsl(var(--muted))',
            'muted-foreground': 'hsl(var(--muted-fg))',
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-fg))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-fg))' },
          },
        },
      },
    };
  </script>
  <style type="text/tailwindcss">
    /* Tokens lấy từ trang sign (Documenso). Dark theo prefers-color-scheme. */
    :root {
      --bg: 0 0% 100%;            --fg: 222.2 47.4% 11.2%;
      --card: 0 0% 100%;          --card-fg: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;     --muted-fg: 215.4 16.3% 46.9%;
      --border: 214.3 31.8% 91.4%; --input: 214.3 31.8% 91.4%;
      --primary: 49 74% 53%;      --primary-fg: 49 74% 10%;
      --accent: 210 40% 96.1%;    --accent-fg: 222.2 47.4% 11.2%;
      --ring: 49 74% 53%;         --link: 42 70% 34%;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: 0 0% 14.9%;          --fg: 0 0% 97%;
        --card: 0 0% 14.9%;        --card-fg: 0 0% 95%;
        --muted: 0 0% 23.4%;       --muted-fg: 0 0% 75%;
        --border: 0 0% 27.9%;      --input: 0 0% 27.9%;
        --primary: 49 74% 53%;     --primary-fg: 49 74% 10%;
        --accent: 0 0% 23.4%;      --accent-fg: 0 0% 95%;
        --ring: 49 74% 53%;        --link: 49 74% 62%;
      }
    }
    @layer components {
      .av-card { @apply rounded-xl border border-border bg-card shadow-sm; }
      .av-btn-primary { @apply inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50; }
      .av-btn-secondary { @apply inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted; }
      .av-input { @apply w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background; }
    }
    /* Form controls native theo token (fix input nền trắng ở dark; light giữ nguyên trắng). */
    @layer base {
      input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
      textarea, select {
        background-color: hsl(var(--bg));
        color: hsl(var(--fg));
        border-color: hsl(var(--border));
      }
      input::placeholder, textarea::placeholder { color: hsl(var(--muted-fg)); opacity: 1; }
    }
    /* ===== Re-skin on-tone cho class literal cũ (light + dark) — ưu tiên tầng dùng chung =====
       Dùng attribute selector [class*=] để né lỗi escape '\:' trong template literal. */
    [class*="text-blue-"] { color: hsl(var(--link)) !important; }
    [class*="bg-blue-9"], [class*="bg-blue-8"], [class*="bg-blue-7"], [class*="bg-blue-6"] { background-color: hsl(var(--primary)) !important; color: hsl(var(--primary-fg)) !important; }
    [class*="from-blue-"] { background-image: none !important; background-color: hsl(var(--primary)) !important; color: hsl(var(--primary-fg)) !important; }
    [class*="bg-blue-50"], [class*="bg-blue-100"] { background-color: hsl(var(--accent)) !important; }
    [class*="border-blue-"] { border-color: hsl(var(--border)) !important; }
    [class*="ring-blue-"] { --tw-ring-color: hsl(var(--ring)) !important; }
    /* Header bảng/khối nền gradient slate → phẳng muted (tự flip theo dark) */
    [class*="from-slate-50"], [class*="from-slate-100"] { background-image: none !important; background-color: hsl(var(--muted)) !important; }
    /* ===== Dark: lật bề mặt/chữ neutral (slate/white) sang tối ===== */
    @media (prefers-color-scheme: dark) {
      [class*="bg-white"] { background-color: hsl(var(--card)) !important; }
      [class*="bg-slate-50"] { background-color: hsl(0 0% 11%) !important; }
      [class*="bg-slate-100"] { background-color: hsl(0 0% 18%) !important; }
      [class*="bg-slate-200"] { background-color: hsl(0 0% 24%) !important; }
      .text-slate-900, .text-slate-800, .text-slate-700 { color: hsl(0 0% 95%) !important; }
      .text-slate-600, .text-slate-500 { color: hsl(0 0% 72%) !important; }
      .text-slate-400 { color: hsl(0 0% 58%) !important; }
      [class*="border-slate-"] { border-color: hsl(var(--border)) !important; }
      [class*="ring-slate-"] { --tw-ring-color: hsl(var(--border)) !important; }
      .divide-slate-200 > :not([hidden]) ~ :not([hidden]) { border-color: hsl(var(--border)) !important; }
      [class*="hover:bg-slate-"]:hover, [class*="hover:bg-blue-"]:hover { background-color: hsl(0 0% 20%) !important; }
    }
  </style>
  <script>
    // Chuông thông báo in-app: poll /notifications/inbox, hiện badge + bật toast khi có cái mới.
    window.inboxBell = function () {
      return {
        open: false,
        unread: 0,
        items: [],
        toasts: [],
        baseline: null, // id lớn nhất đã thấy lúc nạp trang — tránh toast lại tồn đọng cũ
        init() {
          this.poll();
          setInterval(() => this.poll(), 20000);
          document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
        },
        async poll() {
          try {
            const r = await fetch('/notifications/inbox', { headers: { accept: 'application/json' } });
            if (!r.ok) return;
            const d = await r.json();
            this.unread = d.unread || 0;
            this.items = d.items || [];
            const maxId = this.items.length ? this.items[0].id : 0;
            if (this.baseline === null) {
              this.baseline = maxId; // lần poll đầu: lập mốc, không toast tồn đọng
            } else if (maxId > this.baseline) {
              const fresh = this.items.filter((i) => i.id > this.baseline).reverse();
              for (const it of fresh) this.pushToast(it);
              this.baseline = maxId;
            }
          } catch (e) {}
        },
        pushToast(it) {
          this.toasts.push(it);
          setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== it.id); }, 9000);
        },
        dismiss(id) { this.toasts = this.toasts.filter((t) => t.id !== id); },
        async openItem(it) {
          try { await fetch('/notifications/inbox/' + it.id + '/read', { method: 'POST' }); } catch (e) {}
          if (it.link) window.location.href = it.link;
        },
        async markAll() {
          try { await fetch('/notifications/inbox/read-all', { method: 'POST' }); } catch (e) {}
          this.unread = 0;
          this.items = this.items.map((i) => Object.assign({}, i, { read_at: i.read_at || 'x' }));
        },
        fmt(ts) {
          try {
            const d = new Date(ts);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
          } catch (e) { return ''; }
        },
      };
    };
  </script>
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

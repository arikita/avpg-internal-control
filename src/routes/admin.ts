// Admin routes — Phase 1 đơn giản: chỉ user có email trong KSNB_TELEGRAM_CHAT_ID
// KHÔNG hợp lý làm role gate. Tạm dùng env ADMIN_EMAILS (csv) — để khi cần.
// Hiện tại: cho mọi user đã login chạy /admin/notify/run để tiện debug.

import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppEnv } from '../types';
import { requireAdmin } from '../middleware/auth';
import { runNotificationQueue } from '../lib/notifications';
import { renderEmail } from '../lib/email-templates';
import { badRequest, notFound } from '../lib/errors';
import { graphSearchUsers } from '../lib/graph';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAdmin);

// Trigger queue ngay lập tức.
adminRoutes.post('/notify/run', async (c) => {
  const result = await runNotificationQueue(c.env);
  return c.json({ ok: true, result });
});

// Preview template — render html cho 1 event + proposal_id, không gửi.
// /admin/notify/preview?event=submitted&id=1
adminRoutes.get('/notify/preview', async (c) => {
  const event = c.req.query('event') as
    | 'submitted'
    | 'manager_approved'
    | 'engineering_approved'
    | 'ic_approved'
    | 'bod_approved'
    | 'completed'
    | 'rejected'
    | undefined;
  const id = Number(c.req.query('id'));
  if (!event || !id) throw notFound('Thiếu event hoặc id');
  const { subject, html } = await renderEmail(c.env, event, id);
  return c.html(`<!-- subject: ${subject} -->\n${html}`);
});

// Liệt kê notifications gần nhất (debug).
adminRoutes.get('/notify/list', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, proposal_id, channel, event, recipient, status, attempts, error,
            provider_msg_id, created_at, sent_at
       FROM notifications ORDER BY id DESC LIMIT 50`,
  ).all();
  return c.json({ notifications: res.results ?? [] });
});

// ---------- Audit log (non-repudiation Tầng 1) ----------
type AuditRow = {
  id: number;
  event_time: string;
  event_type: string;
  actor_email: string;
  actor_name: string;
  actor_user_id: string | null;
  proposal_id: number | null;
  step: string | null;
  action: string | null;
  channel: string;
  ip: string | null;
  user_agent: string | null;
  session_ref: string | null;
  telegram_chat_id: string | null;
  detail: string | null;
};

async function queryAudit(
  env: AppEnv['Bindings'],
  opts: { proposal?: number; actor?: string; limit: number },
): Promise<AuditRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  let n = 0;
  if (opts.proposal != null && !Number.isNaN(opts.proposal)) {
    conds.push(`proposal_id = ?${++n}`);
    params.push(opts.proposal);
  }
  if (opts.actor) {
    conds.push(`LOWER(actor_email) LIKE ?${++n}`);
    params.push(`%${opts.actor.toLowerCase()}%`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(opts.limit);
  const sql =
    `SELECT id, event_time, event_type, actor_email, actor_name, actor_user_id, proposal_id,
            step, action, channel, ip, user_agent, session_ref, telegram_chat_id, detail
       FROM audit_events ${where} ORDER BY id DESC LIMIT ?${++n}`;
  const res = await env.DB.prepare(sql)
    .bind(...params)
    .all<AuditRow>();
  return res.results ?? [];
}

function parseAuditQuery(c: { req: { query: (k: string) => string | undefined } }) {
  const proposalRaw = c.req.query('proposal') ?? '';
  const actor = c.req.query('actor') ?? '';
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 100));
  return {
    proposalRaw,
    actor,
    limit,
    proposal: proposalRaw ? Number(proposalRaw) : undefined,
  };
}

// JSON — /admin/audit/list?proposal=42&actor=abc&limit=100
adminRoutes.get('/audit/list', async (c) => {
  const q = parseAuditQuery(c);
  const events = await queryAudit(c.env, {
    proposal: q.proposal,
    actor: q.actor || undefined,
    limit: q.limit,
  });
  return c.json({ events });
});

// HTML viewer — /admin/audit?proposal=42&actor=abc
adminRoutes.get('/audit', async (c) => {
  const q = parseAuditQuery(c);
  const rows = await queryAudit(c.env, {
    proposal: q.proposal,
    actor: q.actor || undefined,
    limit: q.limit,
  });
  return c.html(auditPage(rows, { proposal: q.proposalRaw, actor: q.actor, limit: q.limit }));
});

function auditPage(rows: AuditRow[], f: { proposal: string; actor: string; limit: number }) {
  const fmtDetail = (d: string | null): string => {
    if (!d) return '';
    try {
      return JSON.stringify(JSON.parse(d));
    } catch {
      return d;
    }
  };
  return html`<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Audit log phê duyệt — AVPG</title>
<style>
  body{font:13px/1.5 system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#0f172a;background:#f8fafc}
  h1{font-size:18px;margin:0 0 12px}
  form{margin:0 0 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  label{display:flex;flex-direction:column;font-size:11px;color:#64748b;gap:2px}
  input{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}
  button{padding:7px 14px;border:0;border-radius:6px;background:#1e3a8a;color:#fff;font:inherit;cursor:pointer}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
  th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #f1f5f9;vertical-align:top}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
  td.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;color:#334155}
  .a-approve{color:#047857;font-weight:600}
  .a-reject{color:#be123c;font-weight:600}
  .ch{font-size:11px;padding:1px 6px;border-radius:999px;background:#e0e7ff;color:#3730a3}
  .empty{padding:30px;text-align:center;color:#94a3b8;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
  a{color:#1d4ed8;text-decoration:none}
</style></head>
<body>
  <nav style="display:flex;gap:14px;font-size:13px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0">
    <a href="/app" style="color:#64748b;text-decoration:none">← Về app</a>
    <a href="/admin/approvers" style="color:#1d4ed8;text-decoration:none">Người duyệt</a>
    <a href="/admin/audit" style="color:#1d4ed8;font-weight:600;text-decoration:none">Nhật ký duyệt</a>
  </nav>
  <h1>📜 Audit log phê duyệt</h1>
  <form method="get" action="/admin/audit">
    <label>Mã phiếu (id)<input type="number" name="proposal" value="${f.proposal}" placeholder="vd 42" /></label>
    <label>Email người duyệt<input type="text" name="actor" value="${f.actor}" placeholder="một phần email" /></label>
    <label>Số dòng<input type="number" name="limit" value="${String(f.limit)}" min="1" max="500" /></label>
    <button type="submit">Lọc</button>
  </form>
  ${rows.length === 0
    ? html`<div class="empty">Không có bản ghi.</div>`
    : html`<table>
    <thead><tr>
      <th>#</th><th>Thời điểm (UTC)</th><th>Hành động</th><th>Người duyệt</th><th>Bước</th>
      <th>Phiếu</th><th>Kênh</th><th>IP</th><th>Phiên</th><th>User-Agent</th><th>Chi tiết</th>
    </tr></thead>
    <tbody>
      ${rows.map(
        (r) => html`<tr>
        <td class="mono">${r.id}</td>
        <td class="mono">${r.event_time}</td>
        <td class="${r.action === 'reject' ? 'a-reject' : 'a-approve'}">${r.action ?? r.event_type}</td>
        <td>${r.actor_name}<br /><span class="mono">${r.actor_email}</span></td>
        <td>${r.step ?? ''}</td>
        <td>${r.proposal_id != null ? html`<a href="/p/${r.proposal_id}">#${r.proposal_id}</a>` : ''}</td>
        <td><span class="ch">${r.channel}</span></td>
        <td class="mono">${r.ip ?? ''}${r.telegram_chat_id ? html` · tg:${r.telegram_chat_id}` : ''}</td>
        <td class="mono">${r.session_ref ?? ''}</td>
        <td class="mono" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.user_agent ?? ''}">${r.user_agent ?? ''}</td>
        <td class="mono">${fmtDetail(r.detail)}</td>
      </tr>`,
      )}
    </tbody>
  </table>`}
  <p style="color:#94a3b8;margin-top:10px">${String(rows.length)} bản ghi · giờ UTC · IP lấy từ CF-Connecting-IP</p>
</body></html>`;
}

// ---------- Cấu hình người duyệt (approvers) ----------
const MEMBER_TABLES: Record<string, string> = {
  bod: 'bod_members',
  engineering: 'engineering_members',
  ic: 'ic_members',
};

// Data cho trang: phòng + TP hiện tại, và 3 nhóm member.
adminRoutes.get('/approvers/data', async (c) => {
  const depts = await c.env.DB.prepare(
    `SELECT d.code, d.full_name,
            (SELECT m.user_email FROM department_managers m
              WHERE m.dept_code = d.code AND m.is_active = 1 ORDER BY m.id ASC LIMIT 1) AS mgr_email,
            (SELECT m.user_name FROM department_managers m
              WHERE m.dept_code = d.code AND m.is_active = 1 ORDER BY m.id ASC LIMIT 1) AS mgr_name
       FROM departments d WHERE d.is_active = 1 ORDER BY d.code`,
  ).all();
  const members = async (t: string) =>
    (
      await c.env.DB.prepare(
        `SELECT id, user_email, user_name FROM ${t} WHERE is_active = 1 ORDER BY routing_order ASC, id ASC`,
      ).all()
    ).results ?? [];
  return c.json({
    departments: depts.results ?? [],
    bod: await members('bod_members'),
    engineering: await members('engineering_members'),
    ic: await members('ic_members'),
  });
});

// Search user từ M365 (Graph).
adminRoutes.get('/users/search', async (c) => {
  const users = await graphSearchUsers(c.env, c.req.query('q') ?? '');
  return c.json({ users });
});

// Gán/đổi TP cho 1 phòng (deactivate active cũ → insert mới, giữ history).
adminRoutes.post('/approvers/manager', async (c) => {
  const body = await c.req.json<{ dept_code?: string; email?: string; name?: string }>();
  const deptCode = (body.dept_code ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim();
  if (!deptCode || !email || !name) throw badRequest('Thiếu dept_code/email/name');
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE department_managers SET is_active = 0 WHERE dept_code = ?1 AND is_active = 1`,
    ).bind(deptCode),
    c.env.DB.prepare(
      `INSERT INTO department_managers (dept_code, user_email, user_name, is_active) VALUES (?1, ?2, ?3, 1)`,
    ).bind(deptCode, email, name),
  ]);
  return c.json({ ok: true });
});

// Thêm member BGĐ/EN/IC (upsert active theo user_email UNIQUE).
adminRoutes.post('/approvers/member', async (c) => {
  const body = await c.req.json<{ role?: string; email?: string; name?: string }>();
  const table = MEMBER_TABLES[body.role ?? ''];
  const email = (body.email ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim();
  if (!table) throw badRequest('role không hợp lệ');
  if (!email || !name) throw badRequest('Thiếu email/name');
  await c.env.DB.prepare(
    `INSERT INTO ${table} (user_email, user_name, is_active) VALUES (?1, ?2, 1)
     ON CONFLICT(user_email) DO UPDATE SET is_active = 1, user_name = excluded.user_name`,
  )
    .bind(email, name)
    .run();
  return c.json({ ok: true });
});

// Gỡ (deactivate) — kind = 'manager' | 'bod' | 'engineering' | 'ic'.
adminRoutes.post('/approvers/remove', async (c) => {
  const body = await c.req.json<{ kind?: string; id?: number }>();
  const id = Number(body.id);
  if (!id) throw badRequest('Thiếu id');
  const table = body.kind === 'manager' ? 'department_managers' : MEMBER_TABLES[body.kind ?? ''];
  if (!table) throw badRequest('kind không hợp lệ');
  await c.env.DB.prepare(`UPDATE ${table} SET is_active = 0 WHERE id = ?1`)
    .bind(id)
    .run();
  return c.json({ ok: true });
});

// Trang HTML quản lý approver.
adminRoutes.get('/approvers', (c) => c.html(approversPage()));

function approversPage() {
  return html`<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cấu hình người duyệt — AVPG</title>
<script src="https://cdn.tailwindcss.com"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.8/dist/cdn.min.js"></script>
<style>[x-cloak]{display:none!important}</style>
</head>
<body class="bg-slate-50 text-slate-900 p-6" x-data="approvers()" x-init="load()">
  <nav class="flex gap-4 text-sm mb-4 pb-3 border-b border-slate-200">
    <a href="/app" class="text-slate-500 hover:underline">← Về app</a>
    <a href="/admin/approvers" class="text-blue-700 font-semibold hover:underline">Người duyệt</a>
    <a href="/admin/audit" class="text-blue-700 hover:underline">Nhật ký duyệt</a>
  </nav>
  <h1 class="text-lg font-semibold mb-1">👥 Cấu hình người duyệt</h1>
  <p class="text-sm text-slate-500 mb-5">Gán Trưởng phòng cho từng phòng + thành viên BGĐ / Kỹ thuật / KSNB. Tìm người trực tiếp từ M365.</p>

  <div x-show="picker.open" x-cloak class="fixed inset-0 bg-black/30 flex items-start justify-center pt-24 z-50" @click.self="picker.open=false">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-4">
      <div class="text-sm font-medium mb-2" x-text="picker.title"></div>
      <input x-model="picker.q" @input.debounce.300ms="search()" type="text"
        placeholder="Gõ tên hoặc email (≥2 ký tự)…" class="w-full px-3 py-2 border border-slate-300 rounded text-sm" />
      <div class="mt-2 max-h-72 overflow-auto divide-y divide-slate-100">
        <template x-for="u in picker.results" :key="u.email">
          <button @click="choose(u)" class="w-full text-left px-2 py-2 hover:bg-blue-50 rounded">
            <div class="text-sm font-medium" x-text="u.name"></div>
            <div class="text-xs text-slate-500" x-text="u.email"></div>
          </button>
        </template>
        <div x-show="picker.busy" class="text-sm text-slate-400 py-3 text-center">Đang tìm…</div>
        <div x-show="!picker.busy && picker.q.length>=2 && picker.results.length===0" class="text-sm text-slate-400 py-3 text-center">Không thấy ai khớp.</div>
      </div>
      <button @click="picker.open=false" class="mt-3 text-sm text-slate-500">Đóng</button>
    </div>
  </div>

  <div x-show="loading" class="text-sm text-slate-500">Đang tải…</div>

  <div x-show="!loading" class="space-y-6">
    <section class="bg-white border border-slate-200 rounded-lg p-4">
      <h2 class="text-sm font-semibold mb-3">Trưởng phòng (theo phòng)</h2>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-slate-500"><th class="py-1">Phòng</th><th>Trưởng phòng hiện tại</th><th class="w-24"></th></tr></thead>
        <tbody>
          <template x-for="d in departments" :key="d.code">
            <tr class="border-t border-slate-100">
              <td class="py-2"><span class="font-mono text-xs" x-text="d.code"></span> · <span x-text="d.full_name"></span></td>
              <td><span x-show="d.mgr_email" x-text="(d.mgr_name||'')+' ('+(d.mgr_email||'')+')'"></span><span x-show="!d.mgr_email" class="text-rose-500">— chưa gán —</span></td>
              <td><button @click="openPicker('manager', d.code, 'TP phòng '+d.code)" class="text-blue-700 hover:underline">Đổi/Gán</button></td>
            </tr>
          </template>
          <tr x-show="departments.length===0"><td colspan="3" class="py-3 text-slate-400">Chưa có phòng nào (seed bảng departments trước).</td></tr>
        </tbody>
      </table>
    </section>

    <template x-for="grp in groups" :key="grp.role">
      <section class="bg-white border border-slate-200 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold" x-text="grp.label"></h2>
          <button @click="openPicker(grp.role, null, 'Thêm '+grp.label)" class="text-sm text-blue-700 hover:underline">+ Thêm</button>
        </div>
        <ul class="text-sm divide-y divide-slate-100">
          <template x-for="m in grp.items" :key="m.id">
            <li class="flex items-center justify-between py-2">
              <span x-text="m.user_name+' ('+m.user_email+')'"></span>
              <button @click="removeMember(grp.role, m.id)" class="text-rose-600 hover:underline text-xs">Gỡ</button>
            </li>
          </template>
          <li x-show="grp.items.length===0" class="py-2 text-slate-400">— chưa có ai —</li>
        </ul>
        <p class="text-xs text-slate-400 mt-2">Phiếu được route tới người đầu danh sách.</p>
      </section>
    </template>
  </div>

  <script>
    function approvers() {
      return {
        loading: true,
        departments: [],
        groups: [
          { role: 'bod', label: 'BGĐ (BOD)', items: [] },
          { role: 'engineering', label: 'Kỹ thuật (EN)', items: [] },
          { role: 'ic', label: 'KSNB (IC)', items: [] },
        ],
        picker: { open: false, kind: '', dept: null, title: '', q: '', results: [], busy: false },
        async load() {
          this.loading = true;
          try {
            const d = await fetch('/admin/approvers/data').then(function (r) { return r.json(); });
            this.departments = d.departments || [];
            this.groups[0].items = d.bod || [];
            this.groups[1].items = d.engineering || [];
            this.groups[2].items = d.ic || [];
          } catch (e) { alert('Lỗi tải: ' + e.message); }
          finally { this.loading = false; }
        },
        openPicker(kind, dept, title) {
          this.picker = { open: true, kind: kind, dept: dept, title: title, q: '', results: [], busy: false };
        },
        async search() {
          const q = this.picker.q.trim();
          if (q.length < 2) { this.picker.results = []; return; }
          this.picker.busy = true;
          try {
            const r = await fetch('/admin/users/search?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); });
            this.picker.results = r.users || [];
          } catch (e) { this.picker.results = []; }
          finally { this.picker.busy = false; }
        },
        async choose(u) {
          try {
            if (this.picker.kind === 'manager') {
              await this._post('/admin/approvers/manager', { dept_code: this.picker.dept, email: u.email, name: u.name });
            } else {
              await this._post('/admin/approvers/member', { role: this.picker.kind, email: u.email, name: u.name });
            }
            this.picker.open = false;
            await this.load();
          } catch (e) { alert('Lỗi: ' + e.message); }
        },
        async removeMember(role, id) {
          if (!confirm('Gỡ người này khỏi danh sách duyệt?')) return;
          try { await this._post('/admin/approvers/remove', { kind: role, id: id }); await this.load(); }
          catch (e) { alert('Lỗi: ' + e.message); }
        },
        async _post(url, body) {
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
          return r.json();
        },
      };
    }
  </script>
</body></html>`;
}

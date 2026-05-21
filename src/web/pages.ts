// Web pages — render HTML server-side. Tất cả interactive bằng Alpine.

import { html } from 'hono/html';
import { page, statusBadge, type Html } from './layout';
import type { SessionUser } from '../types';

// ---------- Landing ----------
export function landingPage(user: SessionUser | null) {
  const body = user
    ? html`<script>window.location.href='/app';</script>
        <p class="text-slate-500">Đang chuyển hướng…</p>`
    : html`
        <div class="max-w-xl mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
          <h1 class="text-2xl font-semibold mb-2">Phiếu Đề Xuất</h1>
          <p class="text-slate-600 mb-6">
            Hệ thống quy trình đề xuất & phê duyệt nội bộ AVPG.<br />
            Đăng nhập bằng tài khoản M365 của bạn để bắt đầu.
          </p>
          <a href="/auth/login"
             class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded">
             Đăng nhập M365
          </a>
          <p class="text-xs text-slate-400 mt-6">
            Chưa được gán phòng ban? Liên hệ KSNB để được hỗ trợ.
          </p>
        </div>
      `;
  return page({ title: 'Trang chủ', user, body });
}

// ---------- App dashboard ----------
export function appPage(user: SessionUser) {
  const isManager = true; // UI luôn render; backend filter bằng email
  void isManager;
  const body = html`
    <div x-data="dashboard()" x-init="load()" class="space-y-4">
      <div class="flex justify-between items-center">
        <h1 class="text-xl font-semibold">Hộp phiếu</h1>
        <div class="flex items-center gap-2">
          <button @click="openTelegram()" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">
            <span x-show="!telegramLinked">📱 Liên kết Telegram</span>
            <span x-show="telegramLinked" class="text-emerald-700">📱 Đã link Telegram</span>
          </button>
          <a href="/p/new" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded">
            + Tạo phiếu mới
          </a>
        </div>
      </div>

      <div x-show="tgModal" x-cloak @click.self="tgModal=false"
        class="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
          <h2 class="text-lg font-semibold">Liên kết Telegram</h2>
          <ol class="text-sm text-slate-600 space-y-2 list-decimal pl-5">
            <li>Mở bot Telegram của AVPG (anh KSNB cung cấp username bot).</li>
            <li>Gửi lệnh: <code class="bg-slate-100 px-2 py-0.5 rounded">/start</code> nếu lần đầu.</li>
            <li>Copy token bên dưới rồi gửi: <code class="bg-slate-100 px-2 py-0.5 rounded">/link &lt;token&gt;</code></li>
          </ol>
          <div x-show="tgToken" class="bg-slate-50 border border-slate-200 rounded p-3 font-mono text-center text-lg" x-text="tgToken"></div>
          <div x-show="tgToken" class="text-xs text-slate-500 text-center">Token có hiệu lực 10 phút.</div>
          <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button @click="tgModal=false" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Đóng</button>
            <button @click="genToken()" :disabled="tgBusy"
              class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50">
              <span x-text="tgToken ? 'Tạo token mới' : 'Tạo token'"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="border-b border-slate-200">
        <nav class="-mb-px flex gap-6 text-sm">
          <template x-for="t in tabs" :key="t.key">
            <button @click="setTab(t.key)"
              :class="tab === t.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'"
              class="border-b-2 py-2 px-1 font-medium">
              <span x-text="t.label"></span>
            </button>
          </template>
        </nav>
      </div>

      <div x-show="loading" class="text-slate-500 text-sm">Đang tải…</div>

      <div x-show="!loading && proposals.length === 0" class="text-slate-400 text-sm py-8 text-center">
        Không có phiếu nào.
      </div>

      <div x-show="!loading && proposals.length > 0" class="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="text-left px-4 py-2 font-medium">Mã phiếu</th>
              <th class="text-left px-4 py-2 font-medium">Nội dung</th>
              <th class="text-left px-4 py-2 font-medium">Người đề nghị</th>
              <th class="text-left px-4 py-2 font-medium">Phòng</th>
              <th class="text-left px-4 py-2 font-medium">Trạng thái</th>
              <th class="text-left px-4 py-2 font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            <template x-for="p in proposals" :key="p.id">
              <tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  @click="goto(p.id)">
                <td class="px-4 py-2 font-mono text-xs" x-text="p.code || '(chưa submit)'"></td>
                <td class="px-4 py-2" x-text="p.title"></td>
                <td class="px-4 py-2 text-slate-600" x-text="p.proposer_name"></td>
                <td class="px-4 py-2 text-slate-600" x-text="p.proposer_dept"></td>
                <td class="px-4 py-2" x-html="badge(p.status)"></td>
                <td class="px-4 py-2 text-slate-500 text-xs" x-text="fmt(p.updated_at)"></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <script>
      function dashboard() {
        return {
          tab: 'mine',
          loading: false,
          proposals: [],
          telegramLinked: false,
          tgModal: false,
          tgToken: '',
          tgBusy: false,
          tabs: [
            { key: 'mine',           label: 'Phiếu của tôi' },
            { key: 'manager_inbox',  label: 'Tôi cần duyệt (TP)' },
            { key: 'bod_inbox',      label: 'Tôi cần duyệt (BGĐ)' },
            { key: 'ksnb_inbox',     label: 'Chờ KSNB hoàn thiện' },
          ],
          async load() {
            this.loading = true;
            try {
              const [pr, tg] = await Promise.all([
                fetch('/api/proposals?scope=' + this.tab).then(r => r.json()),
                fetch('/api/me/telegram-status').then(r => r.json()),
              ]);
              this.proposals = pr.proposals || [];
              this.telegramLinked = !!tg.linked;
            } catch (e) {
              alert('Lỗi tải dữ liệu: ' + e.message);
            } finally {
              this.loading = false;
            }
          },
          setTab(k) { this.tab = k; this.load(); },
          openTelegram() { this.tgModal = true; this.tgToken = ''; },
          async genToken() {
            this.tgBusy = true;
            try {
              const r = await fetch('/api/me/link-token', { method: 'POST' });
              const j = await r.json();
              this.tgToken = j.token;
            } catch (e) {
              alert('Lỗi: ' + e.message);
            } finally {
              this.tgBusy = false;
            }
          },
          goto(id) { window.location.href = '/p/' + id; },
          fmt(iso) {
            if (!iso) return '';
            const d = new Date(iso);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset() + 420); // VN time
            const pad = n => String(n).padStart(2,'0');
            return pad(d.getDate()) + '/' + pad(d.getMonth()+1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
          },
          badge(status) {
            const map = {
              draft:            ['Nháp',          'bg-slate-100 text-slate-700'],
              submitted:        ['Chờ TP duyệt',  'bg-amber-100 text-amber-800'],
              manager_approved: ['Chờ BGĐ duyệt', 'bg-blue-100 text-blue-800'],
              bod_approved:     ['Chờ KSNB',      'bg-indigo-100 text-indigo-800'],
              completed:        ['Hoàn thành',    'bg-emerald-100 text-emerald-800'],
              rejected:         ['Từ chối',       'bg-rose-100 text-rose-800'],
            };
            const m = map[status] || [status, 'bg-slate-100 text-slate-700'];
            return '<span class="inline-block px-2 py-0.5 rounded text-xs font-medium ' + m[1] + '">' + m[0] + '</span>';
          },
        };
      }
    </script>
  `;
  return page({ title: 'Hộp phiếu', user, body });
}

// ---------- New proposal form ----------
export function newProposalPage(user: SessionUser) {
  const body = html`
    <div x-data="proposalForm()" class="max-w-3xl mx-auto">
      <h1 class="text-xl font-semibold mb-4">Tạo phiếu đề xuất mới</h1>

      <form @submit.prevent="submit()" class="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label class="block text-slate-600 mb-1">Người đề nghị</label>
            <div class="px-3 py-2 bg-slate-50 rounded border border-slate-200">${user.name}</div>
          </div>
          <div>
            <label class="block text-slate-600 mb-1">Phòng ban</label>
            <div class="px-3 py-2 bg-slate-50 rounded border border-slate-200">${user.deptCode ?? '(chưa gán)'}</div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Nội dung đề xuất <span class="text-rose-600">*</span></label>
          <input x-model="form.title" type="text" required maxlength="200"
            class="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Lý do đề nghị <span class="text-rose-600">*</span></label>
          <textarea x-model="form.reason" required rows="3"
            class="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Diễn giải (tuỳ chọn)</label>
          <textarea x-model="form.explanation" rows="3"
            class="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Thời gian cần thực hiện <span class="text-rose-600">*</span></label>
          <input x-model="form.required_time" type="text" required placeholder="VD: trước 15/06/2026"
            class="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-slate-700">Danh sách hạng mục</label>
            <button type="button" @click="addItem()" class="text-blue-600 hover:text-blue-700 text-sm">+ Thêm dòng</button>
          </div>
          <div class="overflow-hidden border border-slate-200 rounded">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-600">
                <tr>
                  <th class="text-left px-3 py-2 w-12">STT</th>
                  <th class="text-left px-3 py-2">Nội dung</th>
                  <th class="text-left px-3 py-2">Ghi chú</th>
                  <th class="w-10"></th>
                </tr>
              </thead>
              <tbody>
                <template x-for="(it, i) in form.items" :key="i">
                  <tr class="border-t border-slate-100">
                    <td class="px-3 py-2 text-center" x-text="String(i+1).padStart(2,'0')"></td>
                    <td class="px-2 py-1"><input x-model="it.content" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                    <td class="px-2 py-1"><input x-model="it.note" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                    <td class="px-2 py-1 text-center">
                      <button type="button" @click="form.items.splice(i,1)" class="text-rose-500 hover:text-rose-700">✕</button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-slate-200">
          <a href="/app" class="text-slate-500 hover:text-slate-700 text-sm">← Huỷ</a>
          <div class="flex gap-2">
            <button type="button" @click="save(false)" :disabled="busy"
              class="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-50">
              Lưu nháp
            </button>
            <button type="submit" :disabled="busy"
              class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50">
              <span x-text="busy ? 'Đang gửi…' : 'Gửi duyệt'"></span>
            </button>
          </div>
        </div>
      </form>
    </div>

    <script>
      function proposalForm() {
        return {
          busy: false,
          form: {
            title: '', reason: '', explanation: '', required_time: '',
            items: [{ content: '', note: '' }],
          },
          addItem() { this.form.items.push({ content: '', note: '' }); },
          payload() {
            return {
              title: this.form.title,
              reason: this.form.reason,
              explanation: this.form.explanation || null,
              required_time: this.form.required_time,
              items: this.form.items
                .filter(it => (it.content || '').trim())
                .map((it, idx) => ({ seq: idx + 1, content: it.content.trim(), note: (it.note || '').trim() || null })),
            };
          },
          async save(thenSubmit) {
            this.busy = true;
            try {
              const r = await fetch('/api/proposals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.payload()),
              });
              if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
              const j = await r.json();
              if (thenSubmit) {
                const s = await fetch('/api/proposals/' + j.proposal.id + '/submit', { method: 'POST' });
                if (!s.ok) throw new Error((await s.json()).error || 'Lỗi submit');
              }
              window.location.href = '/p/' + j.proposal.id;
            } catch (e) {
              alert(e.message); this.busy = false;
            }
          },
          submit() { this.save(true); },
        };
      }
    </script>
  `;
  return page({ title: 'Tạo phiếu', user, body });
}

// ---------- Proposal detail ----------
export function proposalDetailPage(
  user: SessionUser,
  proposal: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  approvals: Array<Record<string, unknown>>,
) {
  const isOwner = proposal.proposer_user_id === user.id;
  const isManagerOf = proposal.manager_email && (proposal.manager_email as string).toLowerCase() === user.email.toLowerCase();
  const isBodOf = proposal.bod_email && (proposal.bod_email as string).toLowerCase() === user.email.toLowerCase();
  const status = proposal.status as string;

  const canSubmit = isOwner && status === 'draft';
  const canManagerAct = isManagerOf && status === 'submitted';
  const canBodAct = isBodOf && status === 'manager_approved';
  const canKsnbComplete = status === 'bod_approved'; // Phase 1: tạm cho mọi user đã login

  const itemsHtml = items.length
    ? html`
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="text-left px-3 py-2 w-12">STT</th>
              <th class="text-left px-3 py-2">Nội dung</th>
              <th class="text-left px-3 py-2">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(
              (it, i) => html`
                <tr class="border-t border-slate-100">
                  <td class="px-3 py-2 text-center">${String(i + 1).padStart(2, '0')}</td>
                  <td class="px-3 py-2">${it.content as string}</td>
                  <td class="px-3 py-2 text-slate-500">${(it.note as string) ?? ''}</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      `
    : html`<p class="text-slate-400 text-sm px-3 py-3">Không có hạng mục.</p>`;

  const approvalsHtml = approvals.length
    ? html`<ul class="space-y-3">
        ${approvals.map((a) => {
          const stepLabel: Record<string, string> = {
            manager: 'Trưởng phòng',
            bod: 'BGĐ',
            ksnb: 'KSNB',
          };
          const actionCls =
            a.action === 'approve' ? 'text-emerald-700' : 'text-rose-700';
          const actionLabel = a.action === 'approve' ? '✓ Duyệt' : '✗ Từ chối';
          return html`
            <li class="border-l-2 border-slate-200 pl-3">
              <div class="text-sm">
                <span class="font-medium ${actionCls}">${actionLabel}</span>
                <span class="text-slate-500"> · ${stepLabel[a.step as string] ?? a.step} · ${a.actor_name}</span>
              </div>
              ${a.comment
                ? html`<div class="text-sm text-slate-600 mt-0.5 italic">"${a.comment as string}"</div>`
                : ''}
              <div class="text-xs text-slate-400">${a.acted_at as string}</div>
            </li>
          `;
        })}
      </ul>`
    : html`<p class="text-slate-400 text-sm">Chưa có hành động duyệt nào.</p>`;

  const actionBar: Html = ((): Html => {
    if (canSubmit) {
      return html`
        <div class="flex gap-2">
          <button @click="action('submit')" :disabled="busy"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50">
            Gửi duyệt
          </button>
          <a href="/p/${String(proposal.id)}/edit" class="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">
            Sửa
          </a>
        </div>`;
    }
    if (canManagerAct || canBodAct) {
      const role = canManagerAct ? 'manager-action' : 'bod-action';
      return html`
        <div class="space-y-2" x-data="{ rejectMode: false, comment: '' }">
          <template x-if="!rejectMode">
            <div class="flex gap-2">
              <button @click="$root._do('${role}', 'approve', '')" :disabled="busy"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium disabled:opacity-50">
                ✓ Duyệt
              </button>
              <button @click="rejectMode = true"
                class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium">
                ✗ Từ chối
              </button>
            </div>
          </template>
          <template x-if="rejectMode">
            <div class="space-y-2">
              <textarea x-model="comment" rows="2" placeholder="Lý do từ chối…"
                class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
              <div class="flex gap-2">
                <button @click="comment.trim() && $root._do('${role}', 'reject', comment)" :disabled="busy"
                  class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium disabled:opacity-50">
                  Xác nhận từ chối
                </button>
                <button @click="rejectMode = false; comment = ''"
                  class="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">
                  Huỷ
                </button>
              </div>
            </div>
          </template>
        </div>`;
    }
    if (canKsnbComplete) {
      return html`
        <button @click="action('ksnb-complete')" :disabled="busy"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium disabled:opacity-50">
          Hoàn thiện hồ sơ
        </button>`;
    }
    return html`<p class="text-sm text-slate-400">Không có hành động khả dụng cho bạn.</p>`;
  })();

  const body = html`
    <div x-data="detail(${proposal.id})" class="max-w-3xl mx-auto space-y-4">
      <div class="flex items-center justify-between">
        <a href="/app" class="text-sm text-slate-500 hover:text-slate-700">← Hộp phiếu</a>
        ${statusBadge(status)}
      </div>

      <div class="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="text-xs text-slate-500">Mã phiếu</div>
            <div class="text-lg font-mono">${(proposal.code as string) ?? '(chưa submit)'}</div>
          </div>
          <div class="text-right text-xs text-slate-500">
            <div>Tạo: ${proposal.created_at as string}</div>
            ${proposal.submitted_at ? html`<div>Gửi: ${proposal.submitted_at as string}</div>` : ''}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><div class="text-slate-500">Người đề nghị</div><div>${proposal.proposer_name as string}</div></div>
          <div><div class="text-slate-500">Phòng</div><div>${proposal.proposer_dept as string}</div></div>
          ${proposal.manager_name ? html`<div><div class="text-slate-500">TP duyệt</div><div>${proposal.manager_name as string}</div></div>` : ''}
          ${proposal.bod_name ? html`<div><div class="text-slate-500">BGĐ duyệt</div><div>${proposal.bod_name as string}</div></div>` : ''}
        </div>

        <div>
          <div class="text-xs text-slate-500 mb-1">Nội dung đề xuất</div>
          <div class="font-medium">${proposal.title as string}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500 mb-1">Lý do</div>
          <div class="whitespace-pre-wrap">${proposal.reason as string}</div>
        </div>
        ${proposal.explanation
          ? html`<div><div class="text-xs text-slate-500 mb-1">Diễn giải</div><div class="whitespace-pre-wrap">${proposal.explanation as string}</div></div>`
          : ''}
        <div>
          <div class="text-xs text-slate-500 mb-1">Thời gian cần thực hiện</div>
          <div>${proposal.required_time as string}</div>
        </div>

        <div>
          <div class="text-xs text-slate-500 mb-1">Hạng mục</div>
          <div class="border border-slate-200 rounded overflow-hidden">${itemsHtml}</div>
        </div>

        ${proposal.rejected_reason
          ? html`<div class="bg-rose-50 border border-rose-200 rounded p-3 text-sm">
              <div class="font-medium text-rose-700">Lý do từ chối</div>
              <div class="text-rose-700 whitespace-pre-wrap">${proposal.rejected_reason as string}</div>
            </div>`
          : ''}
      </div>

      <div class="bg-white border border-slate-200 rounded-lg p-6">
        <h2 class="text-sm font-semibold mb-3">Lịch sử duyệt</h2>
        ${approvalsHtml}
      </div>

      <div class="bg-white border border-slate-200 rounded-lg p-6">
        <h2 class="text-sm font-semibold mb-3">Hành động</h2>
        ${actionBar}
      </div>
    </div>

    <script>
      function detail(id) {
        return {
          id,
          busy: false,
          async action(kind) {
            this._do(kind, null, null);
          },
          async _do(endpoint, act, comment) {
            this.busy = true;
            try {
              const body = act === null ? null : JSON.stringify({ action: act, comment });
              const r = await fetch('/api/proposals/' + this.id + '/' + endpoint, {
                method: 'POST',
                headers: body ? { 'Content-Type': 'application/json' } : {},
                body,
              });
              if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
              window.location.reload();
            } catch (e) {
              alert(e.message); this.busy = false;
            }
          },
        };
      }
    </script>
  `;

  return page({ title: (proposal.code as string) ?? 'Phiếu', user, body });
}


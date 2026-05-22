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
export type DashboardRoleInfo = {
  isManager: boolean;
  isBod: boolean;
  pendingManager: number;
  pendingBod: number;
};

export function appPage(user: SessionUser, role: DashboardRoleInfo) {
  // Inline literals — chỉ bool/number, không cần escape JSON.
  const args = `${role.isManager}, ${role.isBod}, ${role.pendingManager}, ${role.pendingBod}`;
  const body = html`
    <div x-data="dashboard(${args})" x-init="load()" class="space-y-4">
      <div class="flex justify-between items-center">
        <h1 class="text-xl font-semibold">Hộp phiếu</h1>
        <div class="flex items-center gap-2">
          <button @click="openSettings()" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">
            ⚙️ Cài đặt
          </button>
          <a href="/p/new" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded">
            + Tạo phiếu mới
          </a>
        </div>
      </div>

      <div x-show="settingsModal" x-cloak @click.self="settingsModal=false"
        class="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-0 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div class="px-6 pt-5 border-b border-slate-200">
            <div class="flex justify-between items-center mb-3">
              <h2 class="text-lg font-semibold">Cài đặt cá nhân</h2>
              <button @click="settingsModal=false" class="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <nav class="flex gap-4 text-sm -mb-px">
              <button @click="settingsTab='telegram'"
                :class="settingsTab==='telegram' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
                class="border-b-2 py-2 font-medium">📱 Telegram</button>
              <button @click="settingsTab='signature'"
                :class="settingsTab==='signature' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
                class="border-b-2 py-2 font-medium">✍️ Chữ ký</button>
            </nav>
          </div>

          <!-- Tab Telegram -->
          <div x-show="settingsTab==='telegram'" class="p-6 space-y-4">
            <div class="text-sm">
              Trạng thái:
              <span x-show="telegramLinked" class="text-emerald-700 font-medium">✓ Đã liên kết</span>
              <span x-show="!telegramLinked" class="text-slate-500">Chưa liên kết</span>
            </div>
            <ol class="text-sm text-slate-600 space-y-1 list-decimal pl-5">
              <li>Mở bot Telegram <a href="https://t.me/avpg_request_bot" target="_blank" class="text-blue-600 hover:underline">@avpg_request_bot</a>.</li>
              <li>Gửi <code class="bg-slate-100 px-1 rounded">/start</code> nếu lần đầu.</li>
              <li>Copy token bên dưới rồi gửi: <code class="bg-slate-100 px-1 rounded">/link &lt;token&gt;</code></li>
            </ol>
            <div x-show="tgToken" class="bg-slate-50 border border-slate-200 rounded p-3 font-mono text-center text-lg" x-text="tgToken"></div>
            <div x-show="tgToken" class="text-xs text-slate-500 text-center">Token có hiệu lực 10 phút.</div>
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button @click="genToken()" :disabled="tgBusy"
                class="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50">
                <span x-text="tgToken ? 'Tạo token mới' : 'Tạo token'"></span>
              </button>
            </div>
          </div>

          <!-- Tab Chữ ký -->
          <div x-show="settingsTab==='signature'" class="p-6 space-y-4">
            <p class="text-sm text-slate-600">
              Chữ ký (PNG/JPG ≤200KB) sẽ tự động chèn vào phiếu in khi anh đề xuất hoặc duyệt phiếu.
              Tip: chụp/scan chữ ký trên giấy trắng, crop nền trắng để xuất hiện đẹp.
            </p>
            <div x-show="sigBusy" class="text-sm text-slate-500">Đang xử lý…</div>

            <div x-show="!sigBusy && sigDataUrl" class="space-y-3">
              <div class="text-xs text-slate-500">Chữ ký hiện tại:</div>
              <div class="border border-slate-200 rounded p-4 flex items-center justify-center bg-slate-50">
                <img :src="sigDataUrl" alt="signature" class="max-h-32 max-w-full" />
              </div>
            </div>

            <div x-show="!sigBusy && !sigDataUrl" class="border border-dashed border-slate-300 rounded p-6 text-center text-sm text-slate-400">
              Chưa upload chữ ký.
            </div>

            <div class="space-y-2">
              <label class="block">
                <span class="text-sm text-slate-700">Upload chữ ký mới:</span>
                <input type="file" accept="image/png,image/jpeg" @change="uploadSig($event)" :disabled="sigBusy"
                  class="block mt-1 w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              </label>
              <button x-show="sigDataUrl" @click="deleteSig()" :disabled="sigBusy"
                class="text-sm text-rose-600 hover:text-rose-700">Xoá chữ ký</button>
            </div>
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
              class="border-b-2 py-2 px-1 font-medium inline-flex items-center gap-1.5">
              <span x-text="t.label"></span>
              <span x-show="t.count > 0"
                class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold leading-none"
                x-text="t.count"></span>
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
      function dashboard(isManager, isBod, pendingManager, pendingBod) {
        return {
          tab: 'mine',
          loading: false,
          proposals: [],
          isManager, isBod, pendingManager, pendingBod,
          tabs: [],
          // settings modal
          settingsModal: false,
          settingsTab: 'telegram',
          // telegram tab
          telegramLinked: false,
          tgToken: '',
          tgBusy: false,
          // signature tab
          sigDataUrl: null,
          sigBusy: false,
          init() { this.rebuildTabs(); },
          rebuildTabs() {
            const arr = [{ key: 'mine', label: 'Phiếu của tôi', count: 0 }];
            if (this.isManager) {
              arr.push({ key: 'manager_inbox', label: 'Tôi cần duyệt (TP)', count: this.pendingManager });
            }
            if (this.isBod) {
              arr.push({ key: 'bod_inbox', label: 'Tôi cần duyệt (BGĐ)', count: this.pendingBod });
            }
            this.tabs = arr;
          },
          async load() {
            this.loading = true;
            try {
              const [pr, tg, counts] = await Promise.all([
                fetch('/api/proposals?scope=' + this.tab).then(r => r.json()),
                fetch('/api/me/telegram-status').then(r => r.json()),
                fetch('/api/me/inbox-counts').then(r => r.json()),
              ]);
              this.proposals = pr.proposals || [];
              this.telegramLinked = !!tg.linked;
              this.isManager = !!counts.isManager;
              this.isBod = !!counts.isBod;
              this.pendingManager = counts.pendingManager || 0;
              this.pendingBod = counts.pendingBod || 0;
              this.rebuildTabs();
            } catch (e) {
              alert('Lỗi tải dữ liệu: ' + e.message);
            } finally {
              this.loading = false;
            }
          },
          setTab(k) { this.tab = k; this.load(); },
          async openSettings() {
            this.settingsModal = true;
            this.tgToken = '';
            // Refresh signature state mỗi lần mở
            try {
              const r = await fetch('/api/me/signature');
              const j = await r.json();
              this.sigDataUrl = j.dataUrl;
            } catch (e) { /* ignore */ }
          },
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
          async uploadSig(ev) {
            const file = ev.target.files && ev.target.files[0];
            if (!file) return;
            if (file.size > 200 * 1024) {
              alert('File vượt 200KB. Vui lòng resize/crop trước khi upload.');
              ev.target.value = '';
              return;
            }
            this.sigBusy = true;
            try {
              const fd = new FormData();
              fd.append('file', file);
              const r = await fetch('/api/me/signature', { method: 'POST', body: fd });
              if (!r.ok) throw new Error((await r.json()).error || 'Lỗi upload');
              // Reload to get fresh dataUrl
              const s = await fetch('/api/me/signature').then(r => r.json());
              this.sigDataUrl = s.dataUrl;
            } catch (e) {
              alert(e.message);
            } finally {
              this.sigBusy = false;
              ev.target.value = '';
            }
          },
          async deleteSig() {
            if (!confirm('Xoá chữ ký?')) return;
            this.sigBusy = true;
            try {
              const r = await fetch('/api/me/signature', { method: 'DELETE' });
              if (!r.ok) throw new Error('Lỗi xoá');
              this.sigDataUrl = null;
            } catch (e) {
              alert(e.message);
            } finally {
              this.sigBusy = false;
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
              completed:        ['Đã duyệt',      'bg-emerald-100 text-emerald-800'],
              rejected:         ['Từ chối',       'bg-rose-100 text-rose-800'],
              cancelled:        ['Đã huỷ',        'bg-slate-200 text-slate-600'],
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

// ---------- Proposal form (new + edit dùng chung) ----------
type ExistingProposal = {
  id: number;
  title: string;
  reason: string;
  explanation: string | null;
  required_time: string;
  items: Array<{ content: string; note: string | null }>;
};

export function proposalFormPage(user: SessionUser, existing?: ExistingProposal) {
  const isEdit = !!existing;
  const title = isEdit ? `Sửa phiếu #${existing.id}` : 'Tạo phiếu đề xuất mới';
  const initJson = JSON.stringify(
    existing
      ? {
          title: existing.title,
          reason: existing.reason,
          explanation: existing.explanation ?? '',
          required_time: existing.required_time,
          items:
            existing.items.length > 0
              ? existing.items.map((it) => ({ content: it.content, note: it.note ?? '' }))
              : [{ content: '', note: '' }],
        }
      : null,
  );
  const cancelHref = isEdit ? `/p/${existing.id}` : '/app';

  const body = html`
    <div x-data="proposalForm(${initJson}, ${isEdit ? `'${existing.id}'` : 'null'})" class="max-w-3xl mx-auto">
      <h1 class="text-xl font-semibold mb-4">${title}</h1>

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
          <a href="${cancelHref}" class="text-slate-500 hover:text-slate-700 text-sm">← Huỷ</a>
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
      function proposalForm(initial, editId) {
        return {
          busy: false,
          editId: editId,
          form: initial || {
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
              let id;
              if (this.editId) {
                const r = await fetch('/api/proposals/' + this.editId, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(this.payload()),
                });
                if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
                id = this.editId;
              } else {
                const r = await fetch('/api/proposals', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(this.payload()),
                });
                if (!r.ok) throw new Error((await r.json()).error || 'Lỗi');
                id = (await r.json()).proposal.id;
              }
              if (thenSubmit) {
                const s = await fetch('/api/proposals/' + id + '/submit', { method: 'POST' });
                if (!s.ok) throw new Error((await s.json()).error || 'Lỗi submit');
              }
              window.location.href = '/p/' + id;
            } catch (e) {
              alert(e.message); this.busy = false;
            }
          },
          submit() { this.save(true); },
        };
      }
    </script>
  `;
  return page({ title: isEdit ? 'Sửa phiếu' : 'Tạo phiếu', user, body });
}

// Aliases để giữ backward-compat với routes/web.ts
export function newProposalPage(user: SessionUser) {
  return proposalFormPage(user);
}
export function editProposalPage(user: SessionUser, existing: ExistingProposal) {
  return proposalFormPage(user, existing);
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
  // Sửa: cho phép khi phiếu chưa có phê duyệt (draft/submitted) hoặc bị từ chối.
  const canEdit = isOwner && ['draft', 'submitted', 'rejected'].includes(status);
  // Huỷ: chỉ khi chưa có phê duyệt nào (draft hoặc submitted).
  const canCancel = isOwner && ['draft', 'submitted'].includes(status);
  const canManagerAct = isManagerOf && status === 'submitted';
  const canBodAct = isBodOf && status === 'manager_approved';

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
    // Owner-side actions. Approver-side (TP/BGĐ) handled riêng bên dưới vì có reject UI.
    if (!canManagerAct && !canBodAct && (canSubmit || canEdit || canCancel)) {
      return html`
        <div class="flex flex-wrap gap-2">
          ${canSubmit
            ? html`<button @click="action('submit')" :disabled="busy"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50">
                Gửi duyệt
              </button>`
            : ''}
          ${canEdit
            ? html`<a href="/p/${String(proposal.id)}/edit"
                class="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">
                Sửa phiếu
              </a>`
            : ''}
          ${canCancel
            ? html`<button @click="cancelProposal()" :disabled="busy"
                class="px-4 py-2 border border-rose-300 text-rose-700 rounded text-sm hover:bg-rose-50 disabled:opacity-50">
                Huỷ phiếu
              </button>`
            : ''}
        </div>`;
    }
    if (canManagerAct || canBodAct) {
      const role = canManagerAct ? 'manager-action' : 'bod-action';
      // Không nested x-data: dùng trực tiếp rejectMode/comment từ detail() scope
      // ($root trong nested x-data trỏ về inner scope, không thấy _do → bug click silent)
      return html`
        <div class="space-y-2">
          <div class="flex gap-2" x-show="!rejectMode">
            <button @click="_do('${role}', 'approve', '')" :disabled="busy"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium disabled:opacity-50">
              ✓ Duyệt
            </button>
            <button @click="rejectMode = true"
              class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium">
              ✗ Từ chối
            </button>
          </div>
          <div class="space-y-2" x-show="rejectMode" x-cloak>
            <textarea x-model="comment" rows="2" placeholder="Lý do từ chối…"
              class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
            <div class="flex gap-2">
              <button @click="comment.trim() && _do('${role}', 'reject', comment)" :disabled="busy"
                class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium disabled:opacity-50">
                Xác nhận từ chối
              </button>
              <button @click="rejectMode = false; comment = ''"
                class="px-4 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50">
                Huỷ
              </button>
            </div>
          </div>
        </div>`;
    }
    return html`<p class="text-sm text-slate-400">Không có hành động khả dụng cho bạn.</p>`;
  })();

  const body = html`
    <div x-data="detail(${proposal.id})" class="max-w-3xl mx-auto space-y-4">
      <div class="flex items-center justify-between">
        <a href="/app" class="text-sm text-slate-500 hover:text-slate-700">← Hộp phiếu</a>
        <div class="flex items-center gap-3">
          ${statusBadge(status)}
          <a href="/p/${String(proposal.id)}/print" target="_blank"
            class="text-sm text-blue-600 hover:text-blue-700 hover:underline">
            🖨 In phiếu
          </a>
        </div>
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
          rejectMode: false,
          comment: '',
          async action(kind) {
            this._do(kind, null, null);
          },
          async cancelProposal() {
            if (!confirm('Huỷ phiếu này? Hành động không thể hoàn tác.')) return;
            this._do('cancel', null, null);
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


// Web pages — render HTML server-side. Tất cả interactive bằng Alpine.

import { html } from 'hono/html';
import { page, statusBadge, type Html } from './layout';
import type { SessionUser } from '../types';

// ---------- Landing ----------
export function landingPage(user: SessionUser | null) {
  if (user) {
    return page({
      title: 'Trang chủ',
      user,
      body: html`<script>window.location.href='/app';</script>
        <p class="text-slate-500">Đang chuyển hướng…</p>`,
    });
  }

  const features: Array<{ title: string; desc: string }> = [
    { title: 'Tạo phiếu online', desc: 'Đề xuất nhanh qua web — không phải in giấy' },
    { title: 'Duyệt 2 cấp', desc: 'Trưởng phòng → Ban Giám đốc, auto routing' },
    { title: 'In phiếu HR-10', desc: 'Có chữ ký TP/BGĐ tự động, đúng biểu mẫu' },
    { title: 'Thông báo realtime', desc: 'Email + Telegram khi có phiếu mới' },
  ];

  const body = html`
    <div class="min-h-screen flex">
      <!-- Left: blue panel -->
      <div class="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white p-12 flex-col justify-between relative overflow-hidden">
        <!-- Subtle diagonal pattern -->
        <div class="absolute inset-0 opacity-10" style="background-image: repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 22px);"></div>

        <div class="relative z-10 max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
          <!-- Logo placeholder — anh upload logo AVPG sau thì thay vào -->
          <div class="text-center mb-8">
            <p class="text-sm tracking-[0.3em] text-yellow-400 font-semibold">AN VIỆT PHÁT GROUP</p>
          </div>

          <!-- Title -->
          <h1 class="text-3xl font-bold text-center leading-tight">
            Phiếu Đề Xuất<br>
            <span class="text-yellow-400">An Việt Phát Group</span>
          </h1>

          <!-- Subtitle -->
          <p class="text-center text-blue-100 mt-4 mb-10 leading-relaxed">
            Hệ thống quy trình đề xuất &amp; phê duyệt nội bộ, áp dụng cho toàn bộ nhân viên các công ty thành viên tập đoàn.
          </p>

          <!-- Icons row -->
          <div class="flex justify-center gap-6 mb-8 text-yellow-400">
            <svg viewBox="0 0 24 24" class="w-12 h-12" fill="currentColor"><path d="M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm-1 16l-4-4 1.4-1.4L11 14.2l5.6-5.6L18 10l-7 7z"/></svg>
            <svg viewBox="0 0 24 24" class="w-12 h-12" fill="currentColor"><path d="M12 1L2 6v2h20V6L12 1zm-8 9v8H2v2h20v-2h-2v-8h-2v8h-3v-8h-2v8h-2v-8H9v8H6v-8H4z"/></svg>
            <svg viewBox="0 0 24 24" class="w-12 h-12" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          </div>

          <!-- Feature cards 2x2 -->
          <div class="grid grid-cols-2 gap-3">
            ${features.map(
              (f) => html`
                <div class="bg-blue-800/40 border border-blue-700/50 rounded-lg p-3 text-center backdrop-blur-sm">
                  <div class="text-yellow-400 text-sm font-semibold flex items-center justify-center gap-1.5 mb-1">
                    <svg viewBox="0 0 20 20" class="w-4 h-4" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                    <span>${f.title}</span>
                  </div>
                  <div class="text-xs text-blue-100/80 leading-snug">${f.desc}</div>
                </div>
              `,
            )}
          </div>
        </div>

        <div class="relative z-10 text-center text-xs text-blue-200/70">© 2026 An Việt Phát Group</div>
      </div>

      <!-- Right: white login panel -->
      <div class="w-full lg:w-1/2 bg-white flex items-center justify-center p-8">
        <div class="max-w-md w-full">
          <!-- Logo placeholder — anh upload logo AVPG sau thì thay vào -->
          <div class="text-center mb-8">
            <p class="text-xs tracking-[0.3em] text-yellow-600 font-semibold">AN VIỆT PHÁT GROUP</p>
            <p class="text-[10px] text-slate-400 italic mt-1">Together growing strong &amp; success</p>
          </div>

          <h2 class="text-3xl font-bold text-center text-slate-900 mb-2">Đăng nhập</h2>
          <p class="text-slate-500 text-center text-sm mb-8 leading-relaxed">
            Vui lòng đăng nhập bằng tài khoản M365 của anh/chị<br>
            để truy cập hệ thống Phiếu Đề Xuất.
          </p>

          <a href="/auth/login"
             class="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white font-semibold py-3 rounded-lg shadow-md transition">
            <svg viewBox="0 0 23 23" class="w-5 h-5"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="12" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="12" width="10" height="10" fill="#00A4EF"/><rect x="12" y="12" width="10" height="10" fill="#FFB900"/></svg>
            <span>Đăng nhập M365</span>
          </a>

          <p class="text-xs text-slate-400 text-center mt-8 leading-relaxed">
            Bằng việc đăng nhập, anh/chị đồng ý tuân thủ chính sách<br>
            bảo mật thông tin của An Việt Phát Group.
          </p>
          <p class="text-xs text-slate-400 text-center mt-3">
            Chưa được gán phòng ban? Liên hệ quản trị hệ thống để được hỗ trợ.
          </p>
        </div>
      </div>
    </div>
  `;
  return page({ title: 'Đăng nhập', user, body, bodyClass: 'bg-white', noChrome: true });
}

// ---------- App dashboard ----------
export type DashboardRoleInfo = {
  isManager: boolean;
  isBod: boolean;
  isEngineering: boolean;
  isIc: boolean;
  pendingManager: number;
  pendingBod: number;
  pendingEngineering: number;
  pendingIc: number;
};

export function appPage(user: SessionUser, role: DashboardRoleInfo) {
  // Inline literals — chỉ bool/number, không cần escape JSON.
  const args =
    `${role.isManager}, ${role.isBod}, ${role.isEngineering}, ${role.isIc}, ` +
    `${role.pendingManager}, ${role.pendingBod}, ${role.pendingEngineering}, ${role.pendingIc}`;
  const body = html`
    <div x-data="dashboard(${args})" x-init="load()" class="space-y-5">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Hộp phiếu</h1>
          <p class="text-sm text-slate-500 mt-0.5">Quản lý phiếu đề xuất của anh/chị và phiếu cần duyệt</p>
        </div>
        <div class="flex items-center gap-2">
          <button @click="openSettings()" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">
            ⚙️ Cài đặt
          </button>
          <a href="/p/new" class="bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition">
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
                :class="settingsTab==='telegram' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-700'"
                class="border-b-2 py-2 font-medium">📱 Telegram</button>
              <button @click="settingsTab='signature'"
                :class="settingsTab==='signature' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-700'"
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
              <li>Mở bot Telegram <a href="https://t.me/avpg_request_bot" target="_blank" class="text-blue-900 hover:underline">@avpg_request_bot</a>.</li>
              <li>Gửi <code class="bg-slate-100 px-1 rounded">/start</code> nếu lần đầu.</li>
              <li>Copy token bên dưới rồi gửi: <code class="bg-slate-100 px-1 rounded">/link &lt;token&gt;</code></li>
            </ol>
            <div x-show="tgToken" class="bg-slate-50 border border-slate-200 rounded p-3 font-mono text-center text-lg" x-text="tgToken"></div>
            <div x-show="tgToken" class="text-xs text-slate-500 text-center">Token có hiệu lực 10 phút.</div>
            <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button @click="genToken()" :disabled="tgBusy"
                class="px-4 py-1.5 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white text-sm rounded disabled:opacity-50">
                <span x-text="tgToken ? 'Tạo token mới' : 'Tạo token'"></span>
              </button>
            </div>
          </div>

          <!-- Tab Chữ ký -->
          <div x-show="settingsTab==='signature'" class="p-6 space-y-4">
            <p class="text-sm text-slate-600">
              Upload ảnh chữ ký — hệ thống tự động <b>xóa nền, làm nét, đổi sang mực xanh</b> và lưu PNG nền trong suốt để chèn vào phiếu in.
              Tip: chụp/scan chữ ký viết trên <b>giấy trắng</b>, nét rõ; ảnh điện thoại cỡ lớn cũng được (tự thu nhỏ).
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
                ? 'border-blue-900 text-blue-900'
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

      <div x-show="!loading && proposals.length === 0"
        class="bg-white border-2 border-dashed border-slate-200 rounded-xl py-16 text-center">
        <div class="text-5xl mb-3 opacity-50">📭</div>
        <div class="text-slate-500 text-sm">Không có phiếu nào ở mục này.</div>
      </div>

      <div x-show="!loading && proposals.length > 0" class="bg-white rounded-xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <table class="w-full">
          <thead class="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border-b-2 border-slate-200">
            <tr>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Mã phiếu</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Nội dung</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Người đề nghị</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Phòng</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Trạng thái</th>
              <th class="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Cập nhật</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <template x-for="p in proposals" :key="p.id">
              <tr class="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  @click="goto(p.id)">
                <td class="px-4 py-3.5 font-mono text-xs font-semibold text-blue-900 group-hover:text-blue-700"
                    x-text="p.code || '— nháp —'"></td>
                <td class="px-4 py-3.5 font-medium text-slate-900" x-text="p.title"></td>
                <td class="px-4 py-3.5 text-sm text-slate-600" x-text="p.proposer_name"></td>
                <td class="px-4 py-3.5 text-sm text-slate-600" x-text="p.proposer_dept"></td>
                <td class="px-4 py-3.5" x-html="badge(p.status)"></td>
                <td class="px-4 py-3.5 text-slate-500 text-xs whitespace-nowrap" x-text="fmt(p.updated_at)"></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <script>
      // ----- Xử lý ảnh chữ ký phía client (Canvas) -----
      // Pen-ink xanh bút bi royal #1A3E8C — đổi 3 số RGB nếu muốn màu mực khác.
      var SIG_INK = { r: 26, g: 62, b: 140 };
      var SIG_EDGE_BAND = 28;     // dải chuyển tiếp (anti-alias) ngay dưới ngưỡng nền tự dò
      var SIG_ALPHA_FLOOR = 45;   // alpha tính ra < ngưỡng này -> ép 0 (xoá viền mờ/nhiễu)
      var SIG_MAX_DIM = 1000;     // thu cạnh dài nhất về <= giá trị này
      var SIG_MIN_DIM = 480;      // sàn khi phải hạ độ phân giải để giảm dung lượng
      var SIG_MAX_BYTES = 300 * 1024; // PNG ra phải <= ngưỡng này (khớp giới hạn server)
      var SIG_TRIM_A = 0;         // sau khi nền về trong suốt, mọi alpha>0 là "có mực" -> crop sát nét

      function sigLoadViaImg(file) {
        return new Promise(function (resolve, reject) {
          var url = URL.createObjectURL(file);
          var img = new Image();
          img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
          img.src = url;
        });
      }
      function sigLoadBitmap(file) {
        if (window.createImageBitmap) {
          return createImageBitmap(file, { imageOrientation: 'from-image' })
            .catch(function () { return sigLoadViaImg(file); });
        }
        return sigLoadViaImg(file);
      }

      // Otsu: tự dò ngưỡng luminance tách nét (tối) khỏi nền (sáng) cho RIÊNG từng ảnh.
      function sigOtsu(hist, total) {
        var sum = 0, i;
        for (i = 0; i < 256; i++) sum += i * hist[i];
        var sumB = 0, wB = 0, wF = 0, best = -1, t = 127, mB, mF, v;
        for (i = 0; i < 256; i++) {
          wB += hist[i];
          if (wB === 0) continue;
          wF = total - wB;
          if (wF === 0) break;
          sumB += i * hist[i];
          mB = sumB / wB;          // mean lớp tối
          mF = (sum - sumB) / wF;  // mean lớp sáng
          v = wB * wF * (mB - mF) * (mB - mF); // between-class variance
          if (v > best) { best = v; t = i; }
        }
        return t;
      }

      // Trả về Blob PNG: nền trong suốt, mực xanh, đã làm nét + crop sát nét.
      async function processSignatureImage(file, maxDim) {
        maxDim = maxDim || SIG_MAX_DIM;
        var src = await sigLoadBitmap(file);
        var sw = src.width, sh = src.height;
        if (!sw || !sh) throw new Error('Ảnh rỗng');
        var scale = Math.min(1, maxDim / Math.max(sw, sh));
        var w = Math.max(1, Math.round(sw * scale));
        var h = Math.max(1, Math.round(sh * scale));

        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        // Nền trắng trước (ảnh PNG trong suốt -> coi như giấy trắng), rồi vẽ ảnh lên.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(src, 0, 0, w, h);
        if (src.close) src.close();

        var imgd = ctx.getImageData(0, 0, w, h);
        var d = imgd.data;
        var npx = w * h;

        // Pass 1: histogram luminance -> tự dò ngưỡng nền (Otsu). Vì ngưỡng tính theo CHÍNH ảnh
        // nên nền xám / ảnh chụp tối vẫn bị xoá (vùng sáng tương đối luôn thành nền).
        var hist = new Array(256);
        for (var k = 0; k < 256; k++) hist[k] = 0;
        for (var p = 0; p < npx; p++) {
          var o = p * 4;
          hist[(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) | 0]++;
        }
        var t = sigOtsu(hist, npx);
        // mean lớp tối (< t) = vị trí mực thật. Đặt mốc "đặc" giữa mean-mực và ngưỡng nền:
        // Otsu hay rơi sát đỉnh cụm tối, nếu chỉ trừ một dải cố định thì bulk nét sẽ bị mờ.
        var dSum = 0, dCnt = 0;
        for (var k2 = 0; k2 < t; k2++) { dSum += k2 * hist[k2]; dCnt += hist[k2]; }
        var inkMean = dCnt ? (dSum / dCnt) : Math.max(0, t - SIG_EDGE_BAND);
        var transAt = t;                       // lum >= t -> nền -> trong suốt
        var solidAt = (inkMean + t) / 2;        // lum <= solidAt -> nét đặc
        if (transAt - solidAt < 1) solidAt = transAt - 1;
        var rampSpan = (transAt - solidAt) || 1;

        // Pass 2: gán alpha theo ngưỡng tự dò, ép mực xanh, dò bbox để crop.
        var minX = w, minY = h, maxX = -1, maxY = -1;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            var i = (y * w + x) * 4;
            var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            var a;
            if (lum >= transAt) a = 0;                             // nền -> trong suốt
            else if (lum <= solidAt) a = 255;                      // nét đậm -> đục
            else a = Math.round(255 * (transAt - lum) / rampSpan); // viền nét: alpha mượt
            if (a < SIG_ALPHA_FLOOR) a = 0;                        // xoá viền mờ/nhiễu sát ngưỡng
            d[i] = SIG_INK.r; d[i + 1] = SIG_INK.g; d[i + 2] = SIG_INK.b; d[i + 3] = a;
            if (a > SIG_TRIM_A) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        ctx.putImageData(imgd, 0, 0);

        // Crop về bounding box của nét + chừa lề nhỏ. Không thấy mực -> giữ nguyên khung.
        var out = cv;
        if (maxX >= minX && maxY >= minY) {
          var pad = Math.max(4, Math.round(Math.max(w, h) * 0.02));
          var cx = Math.max(0, minX - pad);
          var cy = Math.max(0, minY - pad);
          var cw = Math.min(w, maxX + pad + 1) - cx;
          var ch = Math.min(h, maxY + pad + 1) - cy;
          var cropped = document.createElement('canvas');
          cropped.width = cw; cropped.height = ch;
          cropped.getContext('2d').drawImage(cv, cx, cy, cw, ch, 0, 0, cw, ch);
          out = cropped;
        }

        var blob = await new Promise(function (resolve) { out.toBlob(resolve, 'image/png'); });
        if (!blob) throw new Error('Không tạo được PNG');
        // Còn nặng thì hạ độ phân giải rồi thử lại, tránh vượt giới hạn server.
        if (blob.size > SIG_MAX_BYTES && maxDim > SIG_MIN_DIM) {
          return processSignatureImage(file, Math.max(SIG_MIN_DIM, Math.round(maxDim * 0.8)));
        }
        return blob;
      }

      function dashboard(isManager, isBod, isEngineering, isIc, pendingManager, pendingBod, pendingEngineering, pendingIc) {
        return {
          tab: 'mine',
          loading: false,
          proposals: [],
          isManager, isBod, isEngineering, isIc,
          pendingManager, pendingBod, pendingEngineering, pendingIc,
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
            if (this.isEngineering) {
              arr.push({ key: 'engineering_inbox', label: 'Tôi cần duyệt (EN)', count: this.pendingEngineering });
            }
            if (this.isIc) {
              arr.push({ key: 'ic_inbox', label: 'Tôi cần duyệt (IC)', count: this.pendingIc });
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
              this.isEngineering = !!counts.isEngineering;
              this.isIc = !!counts.isIc;
              this.pendingManager = counts.pendingManager || 0;
              this.pendingBod = counts.pendingBod || 0;
              this.pendingEngineering = counts.pendingEngineering || 0;
              this.pendingIc = counts.pendingIc || 0;
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
            // Ảnh gốc có thể là ảnh chụp điện thoại vài MB — sẽ tự thu nhỏ khi xử lý.
            if (file.size > 20 * 1024 * 1024) {
              alert('Ảnh quá lớn (>20MB). Chụp/scan lại nhỏ hơn giúp anh.');
              ev.target.value = '';
              return;
            }
            this.sigBusy = true;
            try {
              // Tự xử lý: xóa nền trắng, làm nét, ép mực xanh, xuất PNG nền trong suốt.
              const png = await processSignatureImage(file);
              if (png.size > 300 * 1024) {
                throw new Error('Ảnh sau xử lý vẫn quá nặng — nền nhiều nhiễu/bóng. Hãy chụp/scan chữ ký trên giấy trắng, đủ sáng, ít bóng.');
              }
              const fd = new FormData();
              fd.append('file', png, 'signature.png');
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
            // manager_approved label hiển thị chung "Chờ bước kế tiếp" vì
            // PR + general phân nhánh khác nhau sau bước này.
            const map = {
              draft:            ['Nháp',          'bg-slate-100 text-slate-700 ring-slate-200'],
              submitted:        ['Chờ TP duyệt',  'bg-amber-100 text-amber-800 ring-amber-200'],
              manager_approved: ['Đã qua TP',     'bg-blue-100 text-blue-800 ring-blue-200'],
              en_approved:      ['Đã qua EN',     'bg-indigo-100 text-indigo-800 ring-indigo-200'],
              ic_approved:      ['Chờ BGĐ duyệt', 'bg-violet-100 text-violet-800 ring-violet-200'],
              completed:        ['Đã duyệt',      'bg-emerald-100 text-emerald-800 ring-emerald-200'],
              rejected:         ['Từ chối',       'bg-rose-100 text-rose-800 ring-rose-200'],
              cancelled:        ['Đã huỷ',        'bg-slate-200 text-slate-600 ring-slate-300'],
            };
            const m = map[status] || [status, 'bg-slate-100 text-slate-700 ring-slate-200'];
            return '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ' + m[1] + '">' + m[0] + '</span>';
          },
        };
      }
    </script>
  `;
  return page({ title: 'Hộp phiếu', user, body });
}

// ---------- Proposal form (new + edit dùng chung) ----------
export type ExistingProposalGeneral = {
  id: number;
  proposal_type: 'general';
  title: string;
  reason: string;
  explanation: string | null;
  required_time: string;
  items: Array<{ content: string; note: string | null }>;
};

export type ExistingProposalPurchase = {
  id: number;
  proposal_type: 'purchase';
  title: string;
  reason: string;
  explanation: string | null;
  engineering_required: number;
  delivery_date: string | null;
  suggested_vendor_1: string | null;
  suggested_vendor_2: string | null;
  suggested_vendor_3: string | null;
  vat_rate: number;
  items: Array<{
    item_name: string | null;
    spec: string | null;
    unit: string | null;
    qty_stock: number | null;
    qty_buy: number | null;
    unit_price: number | null;
    purpose: string | null;
  }>;
};

export type ExistingProposal = ExistingProposalGeneral | ExistingProposalPurchase;

export function proposalFormPage(user: SessionUser, existing?: ExistingProposal) {
  const isEdit = !!existing;
  const title = isEdit ? `Sửa phiếu #${existing.id}` : 'Tạo phiếu đề xuất mới';
  const cancelHref = isEdit ? `/p/${existing.id}` : '/app';

  // initial state cho Alpine. Mỗi type có shape riêng.
  let initialState: Record<string, unknown>;
  if (existing && existing.proposal_type === 'purchase') {
    initialState = {
      proposal_type: 'purchase',
      title: existing.title,
      reason: existing.reason,
      explanation: existing.explanation ?? '',
      delivery_date: existing.delivery_date ?? '',
      engineering_required: existing.engineering_required === 1,
      suggested_vendor_1: existing.suggested_vendor_1 ?? '',
      suggested_vendor_2: existing.suggested_vendor_2 ?? '',
      suggested_vendor_3: existing.suggested_vendor_3 ?? '',
      vat_rate: existing.vat_rate ?? 10,
      pr_items:
        existing.items.length > 0
          ? existing.items.map((it) => ({
              item_name: it.item_name ?? '',
              spec: it.spec ?? '',
              unit: it.unit ?? '',
              qty_stock: it.qty_stock ?? 0,
              qty_buy: it.qty_buy ?? 0,
              unit_price: it.unit_price ?? 0,
              purpose: it.purpose ?? '',
            }))
          : [
              {
                item_name: '',
                spec: '',
                unit: '',
                qty_stock: 0,
                qty_buy: 0,
                unit_price: 0,
                purpose: '',
              },
            ],
      items: [{ content: '', note: '' }],
      required_time: '',
    };
  } else if (existing) {
    initialState = {
      proposal_type: 'general',
      title: existing.title,
      reason: existing.reason,
      explanation: existing.explanation ?? '',
      required_time: existing.required_time,
      items:
        existing.items.length > 0
          ? existing.items.map((it) => ({ content: it.content, note: it.note ?? '' }))
          : [{ content: '', note: '' }],
      pr_items: [
        { item_name: '', spec: '', unit: '', qty_stock: 0, qty_buy: 0, unit_price: 0, purpose: '' },
      ],
      delivery_date: '',
      engineering_required: false,
      suggested_vendor_1: '',
      suggested_vendor_2: '',
      suggested_vendor_3: '',
      vat_rate: 10,
    };
  } else {
    initialState = null as unknown as Record<string, unknown>;
  }
  const initJson = JSON.stringify(initialState);

  const body = html`
    <div x-data="proposalForm(${initJson}, ${isEdit ? `'${existing.id}'` : 'null'})"
      :class="form.proposal_type==='purchase' ? 'max-w-6xl' : 'max-w-3xl'"
      class="mx-auto">
      <h1 class="text-xl font-semibold mb-4">${title}</h1>

      <form @submit.prevent="submit()" class="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
        ${isEdit
          ? ''
          : html`
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">Loại phiếu</label>
                <div class="flex gap-3">
                  <label class="flex-1 flex items-center gap-2 px-3 py-2 border rounded cursor-pointer"
                    :class="form.proposal_type==='general' ? 'border-blue-700 bg-blue-50' : 'border-slate-300'">
                    <input type="radio" value="general" x-model="form.proposal_type" />
                    <span class="text-sm font-medium">Đề xuất chung</span>
                  </label>
                  <label class="flex-1 flex items-center gap-2 px-3 py-2 border rounded cursor-pointer"
                    :class="form.proposal_type==='purchase' ? 'border-blue-700 bg-blue-50' : 'border-slate-300'">
                    <input type="radio" value="purchase" x-model="form.proposal_type" />
                    <span class="text-sm font-medium">🛒 Đề xuất mua hàng</span>
                  </label>
                </div>
              </div>
            `}

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

        <!-- GENERAL form -->
        <div x-show="form.proposal_type==='general'" class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">
              Thời gian cần thực hiện
              <span class="text-slate-400 font-normal text-xs">(không bắt buộc, định dạng DD/MM/YYYY)</span>
            </label>
            <input x-model="form.required_time" type="text" placeholder="VD: 15/06/2026"
              inputmode="numeric" maxlength="10"
              :class="requiredTimeError ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500' : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'"
              class="w-full px-3 py-2 border rounded focus:ring-2 outline-none" />
            <p x-show="requiredTimeError" class="text-xs text-rose-600 mt-1" x-text="requiredTimeError"></p>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-slate-700">Danh sách hạng mục</label>
              <button type="button" @click="addItem()" class="text-blue-900 hover:text-blue-700 text-sm">+ Thêm dòng</button>
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
        </div>

        <!-- PURCHASE form -->
        <div x-show="form.proposal_type==='purchase'" class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">
                Ngày cần giao
                <span class="text-slate-400 font-normal text-xs">(tuỳ chọn — DD/MM/YYYY)</span>
              </label>
              <input x-model="form.delivery_date" type="text" placeholder="VD: 30/06/2026"
                inputmode="numeric" maxlength="10"
                :class="deliveryDateError ? 'border-rose-500 focus:ring-rose-500 focus:border-rose-500' : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'"
                class="w-full px-3 py-2 border rounded focus:ring-2 outline-none" />
              <p x-show="deliveryDateError" class="text-xs text-rose-600 mt-1" x-text="deliveryDateError"></p>
            </div>
            <div class="flex items-end">
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" x-model="form.engineering_required" class="w-4 h-4" />
                <span>Cần phòng EN (kỹ thuật) xem xét spec</span>
              </label>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-slate-700">Danh sách hàng mua</label>
              <button type="button" @click="addPrItem()" class="text-blue-900 hover:text-blue-700 text-sm">+ Thêm dòng</button>
            </div>
            <div class="overflow-x-auto border border-slate-200 rounded">
              <table class="w-full text-sm">
                <thead class="bg-slate-50 text-slate-600">
                  <tr>
                    <th class="text-left px-2 py-2 w-10">STT</th>
                    <th class="text-left px-2 py-2 min-w-[160px]">Tên hàng *</th>
                    <th class="text-left px-2 py-2 min-w-[120px]">Spec</th>
                    <th class="text-left px-2 py-2 w-20">ĐVT</th>
                    <th class="text-left px-2 py-2 w-20">SL tồn</th>
                    <th class="text-left px-2 py-2 w-20">SL mua *</th>
                    <th class="text-left px-2 py-2 w-28">Đơn giá *</th>
                    <th class="text-right px-2 py-2 w-32">Thành tiền</th>
                    <th class="text-left px-2 py-2 min-w-[140px]">Mục đích</th>
                    <th class="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  <template x-for="(it, i) in form.pr_items" :key="i">
                    <tr class="border-t border-slate-100">
                      <td class="px-2 py-1 text-center" x-text="String(i+1).padStart(2,'0')"></td>
                      <td class="px-1 py-1"><input x-model="it.item_name" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                      <td class="px-1 py-1"><input x-model="it.spec" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                      <td class="px-1 py-1"><input x-model="it.unit" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                      <td class="px-1 py-1"><input x-model.number="it.qty_stock" type="number" min="0" class="w-full px-2 py-1 border border-slate-200 rounded text-right" /></td>
                      <td class="px-1 py-1"><input x-model.number="it.qty_buy" type="number" min="0" class="w-full px-2 py-1 border border-slate-200 rounded text-right" /></td>
                      <td class="px-1 py-1"><input type="text" inputmode="numeric"
                        :value="fmtVnd(it.unit_price)"
                        @focus="$event.target.value = it.unit_price || ''"
                        @input="it.unit_price = parseVnd($event.target.value)"
                        @blur="it.unit_price = parseVnd($event.target.value); $event.target.value = fmtVnd(it.unit_price)"
                        class="w-full px-2 py-1 border border-slate-200 rounded text-right" /></td>
                      <td class="px-2 py-1 text-right font-medium text-slate-700" x-text="fmtVnd((+it.qty_buy||0) * (+it.unit_price||0))"></td>
                      <td class="px-1 py-1"><input x-model="it.purpose" class="w-full px-2 py-1 border border-slate-200 rounded" /></td>
                      <td class="px-1 py-1 text-center">
                        <button type="button" @click="form.pr_items.splice(i,1)" class="text-rose-500 hover:text-rose-700">✕</button>
                      </td>
                    </tr>
                  </template>
                </tbody>
                <tfoot class="bg-slate-50">
                  <tr><td colspan="7" class="px-2 py-1.5 text-right text-slate-600">Cộng tiền hàng</td>
                    <td class="px-2 py-1.5 text-right font-medium" x-text="fmtVnd(prTotals.subtotal) + ' VND'"></td>
                    <td colspan="2"></td></tr>
                  <tr><td colspan="7" class="px-2 py-1.5 text-right text-slate-600">
                      VAT
                      <select x-model.number="form.vat_rate" class="border border-slate-300 rounded px-1.5 py-0.5 text-sm ml-1">
                        <option value="0">0%</option>
                        <option value="8">8%</option>
                        <option value="10">10%</option>
                      </select>
                    </td>
                    <td class="px-2 py-1.5 text-right font-medium" x-text="fmtVnd(prTotals.vat) + ' VND'"></td>
                    <td colspan="2"></td></tr>
                  <tr class="border-t border-slate-200"><td colspan="7" class="px-2 py-1.5 text-right font-semibold">Tổng cộng (đã VAT)</td>
                    <td class="px-2 py-1.5 text-right font-bold text-blue-900" x-text="fmtVnd(prTotals.total) + ' VND'"></td>
                    <td colspan="2"></td></tr>
                </tfoot>
              </table>
            </div>

            <div x-show="prTotals.total >= 5000000" x-cloak
              class="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
              ⚠️ <b>Hàng ≥ 5tr</b>: theo QD1 Điều 8, BẮT BUỘC kèm 3 báo giá từ 3 NCC khác nhau.
              Phiên bản P2.1 chỉ cảnh báo — P2.3 sẽ thêm chức năng upload file báo giá.
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Nhà cung cấp đề nghị (tối đa 3)</label>
            <div class="space-y-2">
              <textarea x-model="form.suggested_vendor_1" rows="2" placeholder="NCC 1: tên — sđt — người liên hệ"
                class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
              <textarea x-model="form.suggested_vendor_2" rows="2" placeholder="NCC 2 (tuỳ chọn)"
                class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
              <textarea x-model="form.suggested_vendor_3" rows="2" placeholder="NCC 3 (tuỳ chọn)"
                class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
            </div>
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
              class="px-5 py-2 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white rounded text-sm font-medium disabled:opacity-50">
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
            proposal_type: 'general',
            title: '', reason: '', explanation: '', required_time: '',
            items: [{ content: '', note: '' }],
            // PR
            delivery_date: '',
            engineering_required: false,
            suggested_vendor_1: '',
            suggested_vendor_2: '',
            suggested_vendor_3: '',
            vat_rate: 10,
            pr_items: [{ item_name: '', spec: '', unit: '', qty_stock: 0, qty_buy: 0, unit_price: 0, purpose: '' }],
          },
          fmtVnd(n) {
            if (n == null || isNaN(+n)) return '0';
            return (+n).toLocaleString('vi-VN');
          },
          parseVnd(s) {
            return Number(String(s || '').replace(/\\D/g, '')) || 0;
          },
          get requiredTimeError() {
            const s = (this.form.required_time || '').trim();
            if (!s) return '';
            const m = s.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
            if (!m) return 'Định dạng phải là DD/MM/YYYY (VD: 15/06/2026)';
            const d = +m[1], mo = +m[2], y = +m[3];
            if (y < 1900 || y > 2100) return 'Năm phải trong khoảng 1900–2100';
            if (mo < 1 || mo > 12) return 'Tháng không hợp lệ';
            const dim = new Date(y, mo, 0).getDate();
            if (d < 1 || d > dim) return 'Ngày không hợp lệ trong tháng ' + mo;
            return '';
          },
          get deliveryDateError() {
            const s = (this.form.delivery_date || '').trim();
            if (!s) return '';
            const m = s.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
            if (!m) return 'Định dạng phải là DD/MM/YYYY';
            const d = +m[1], mo = +m[2], y = +m[3];
            if (y < 1900 || y > 2100) return 'Năm phải trong khoảng 1900–2100';
            if (mo < 1 || mo > 12) return 'Tháng không hợp lệ';
            const dim = new Date(y, mo, 0).getDate();
            if (d < 1 || d > dim) return 'Ngày không hợp lệ trong tháng ' + mo;
            return '';
          },
          get prTotals() {
            const subtotal = (this.form.pr_items || []).reduce((s, it) => {
              const q = +it.qty_buy || 0, p = +it.unit_price || 0;
              return s + Math.round(q * p);
            }, 0);
            let rate = +this.form.vat_rate;
            if (rate !== 0 && rate !== 8 && rate !== 10) rate = 10;
            const vat = Math.round(subtotal * rate / 100);
            return { subtotal, vat, total: subtotal + vat };
          },
          addItem() { this.form.items.push({ content: '', note: '' }); },
          addPrItem() {
            this.form.pr_items.push({ item_name: '', spec: '', unit: '', qty_stock: 0, qty_buy: 0, unit_price: 0, purpose: '' });
          },
          payload() {
            const base = {
              proposal_type: this.form.proposal_type,
              title: this.form.title,
              reason: this.form.reason,
              explanation: this.form.explanation || null,
            };
            if (this.form.proposal_type === 'purchase') {
              return Object.assign(base, {
                delivery_date: (this.form.delivery_date || '').trim() || null,
                engineering_required: !!this.form.engineering_required,
                suggested_vendor_1: (this.form.suggested_vendor_1 || '').trim() || null,
                suggested_vendor_2: (this.form.suggested_vendor_2 || '').trim() || null,
                suggested_vendor_3: (this.form.suggested_vendor_3 || '').trim() || null,
                vat_rate: this.form.vat_rate,
                items: this.form.pr_items
                  .filter(it => (it.item_name || '').trim())
                  .map((it, idx) => ({
                    seq: idx + 1,
                    item_name: (it.item_name || '').trim(),
                    spec: (it.spec || '').trim() || null,
                    unit: (it.unit || '').trim() || null,
                    qty_stock: +it.qty_stock || 0,
                    qty_buy: +it.qty_buy || 0,
                    unit_price: +it.unit_price || 0,
                    purpose: (it.purpose || '').trim() || null,
                  })),
              });
            }
            return Object.assign(base, {
              required_time: (this.form.required_time || '').trim() || null,
              items: this.form.items
                .filter(it => (it.content || '').trim())
                .map((it, idx) => ({ seq: idx + 1, content: it.content.trim(), note: (it.note || '').trim() || null })),
            });
          },
          async save(thenSubmit) {
            if (this.form.proposal_type === 'general' && this.requiredTimeError) {
              alert(this.requiredTimeError); return;
            }
            if (this.form.proposal_type === 'purchase' && this.deliveryDateError) {
              alert(this.deliveryDateError); return;
            }
            if (this.form.proposal_type === 'purchase') {
              const valid = (this.form.pr_items || []).filter(it => (it.item_name || '').trim());
              if (!valid.length) { alert('Phiếu mua hàng phải có ít nhất 1 hạng mục với Tên hàng'); return; }
              for (const it of valid) {
                if (!(+it.qty_buy > 0)) { alert('Hạng mục "' + it.item_name + '": SL mua phải > 0'); return; }
                if (!(+it.unit_price > 0)) { alert('Hạng mục "' + it.item_name + '": Đơn giá phải > 0'); return; }
              }
            }
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
  const userEmailLower = user.email.toLowerCase();
  const isManagerOf =
    proposal.manager_email && (proposal.manager_email as string).toLowerCase() === userEmailLower;
  const isEnOf =
    proposal.engineering_email &&
    (proposal.engineering_email as string).toLowerCase() === userEmailLower;
  const isIcOf =
    proposal.ic_email && (proposal.ic_email as string).toLowerCase() === userEmailLower;
  const isBodOf =
    proposal.bod_email && (proposal.bod_email as string).toLowerCase() === userEmailLower;
  const status = proposal.status as string;
  const proposalType = ((proposal.proposal_type as string) ?? 'general') as 'general' | 'purchase';
  const isPr = proposalType === 'purchase';
  const needEn = isPr && Number(proposal.engineering_required ?? 0) === 1;

  const canSubmit = isOwner && status === 'draft';
  const canEdit = isOwner && ['draft', 'submitted'].includes(status);
  const canCancel = isOwner && ['draft', 'submitted'].includes(status);
  const canManagerAct = isManagerOf && status === 'submitted';
  const canEngineeringAct = isPr && needEn && isEnOf && status === 'manager_approved';
  const canIcAct =
    isPr &&
    isIcOf &&
    ((!needEn && status === 'manager_approved') || (needEn && status === 'en_approved'));
  // BOD: general chờ ở manager_approved, PR chờ ở ic_approved.
  const canBodAct = isBodOf && ((!isPr && status === 'manager_approved') || (isPr && status === 'ic_approved'));

  const fmtVnd = (n: unknown): string => {
    if (n == null || isNaN(Number(n))) return '0';
    return Number(n).toLocaleString('vi-VN');
  };

  const itemsHtml = items.length
    ? isPr
      ? html`
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-600">
              <tr>
                <th class="text-left px-2 py-2 w-10">STT</th>
                <th class="text-left px-2 py-2">Tên hàng</th>
                <th class="text-left px-2 py-2">Spec</th>
                <th class="text-center px-2 py-2 w-16">ĐVT</th>
                <th class="text-right px-2 py-2 w-16">SL mua</th>
                <th class="text-right px-2 py-2 w-28">Đơn giá</th>
                <th class="text-right px-2 py-2 w-32">Thành tiền</th>
                <th class="text-left px-2 py-2">Mục đích</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(
                (it, i) => html`
                  <tr class="border-t border-slate-100">
                    <td class="px-2 py-2 text-center">${String(i + 1).padStart(2, '0')}</td>
                    <td class="px-2 py-2">${(it.item_name as string) ?? ''}</td>
                    <td class="px-2 py-2 text-slate-500">${(it.spec as string) ?? ''}</td>
                    <td class="px-2 py-2 text-center">${(it.unit as string) ?? ''}</td>
                    <td class="px-2 py-2 text-right">${fmtVnd(it.qty_buy)}</td>
                    <td class="px-2 py-2 text-right">${fmtVnd(it.unit_price)}</td>
                    <td class="px-2 py-2 text-right font-medium">${fmtVnd(it.line_total)}</td>
                    <td class="px-2 py-2 text-slate-500">${(it.purpose as string) ?? ''}</td>
                  </tr>
                `,
              )}
            </tbody>
            <tfoot class="bg-slate-50">
              <tr><td colspan="6" class="px-2 py-1.5 text-right text-slate-600">Cộng tiền hàng</td>
                <td class="px-2 py-1.5 text-right font-medium">${fmtVnd(proposal.subtotal)} VND</td><td></td></tr>
              <tr><td colspan="6" class="px-2 py-1.5 text-right text-slate-600">VAT ${String(proposal.vat_rate ?? 10)}%</td>
                <td class="px-2 py-1.5 text-right font-medium">${fmtVnd(proposal.vat_amount)} VND</td><td></td></tr>
              <tr class="border-t border-slate-200">
                <td colspan="6" class="px-2 py-1.5 text-right font-semibold">Tổng cộng (đã VAT)</td>
                <td class="px-2 py-1.5 text-right font-bold text-blue-900">${fmtVnd(proposal.total_amount)} VND</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        `
      : html`
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
            engineering: 'EN (Kỹ thuật)',
            ic: 'IC (KSNB)',
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

  const actionRole = canManagerAct
    ? 'manager-action'
    : canEngineeringAct
      ? 'engineering-action'
      : canIcAct
        ? 'ic-action'
        : canBodAct
          ? 'bod-action'
          : null;

  const actionBar: Html = ((): Html => {
    if (!actionRole && (canSubmit || canEdit || canCancel)) {
      return html`
        <div class="flex flex-wrap gap-2">
          ${canSubmit
            ? html`<button @click="action('submit')" :disabled="busy"
                class="px-4 py-2 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white rounded text-sm font-medium disabled:opacity-50">
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
    if (actionRole) {
      const approveLabel = canEngineeringAct
        ? '✓ Duyệt (EN)'
        : canIcAct
          ? '✓ Duyệt (IC)'
          : canBodAct
            ? '✓ Duyệt (BGĐ)'
            : '✓ Duyệt';
      return html`
        <div class="space-y-2">
          <textarea x-model="comment" rows="2" placeholder="Ghi chú / lý do (không bắt buộc)…"
            class="w-full px-3 py-2 border border-slate-300 rounded text-sm"></textarea>
          <div class="flex gap-2">
            <button @click="_do('${actionRole}', 'approve', comment)" :disabled="busy"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium disabled:opacity-50">
              ${approveLabel}
            </button>
            <button @click="confirm('Từ chối phiếu này? Phiếu sẽ bị huỷ và KHÔNG sửa lại được.') && _do('${actionRole}', 'reject', comment)" :disabled="busy"
              class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-medium disabled:opacity-50">
              ✗ Từ chối
            </button>
          </div>
        </div>`;
    }
    return html`<p class="text-sm text-slate-400">Không có hành động khả dụng cho bạn.</p>`;
  })();

  const typeBadge: Html = isPr
    ? html`<span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 ring-1 ring-orange-200">🛒 Mua hàng</span>`
    : html``;

  const vendorsHtml: Html = isPr
    ? html`
        <div>
          <div class="text-xs text-slate-500 mb-1">Nhà cung cấp đề nghị</div>
          <ul class="text-sm space-y-1">
            ${[proposal.suggested_vendor_1, proposal.suggested_vendor_2, proposal.suggested_vendor_3]
              .filter((v) => v && (v as string).trim())
              .map(
                (v, i) =>
                  html`<li class="border-l-2 border-slate-200 pl-2 whitespace-pre-wrap"><span class="text-slate-400 mr-1">${i + 1}.</span>${v as string}</li>`,
              )}
            ${![proposal.suggested_vendor_1, proposal.suggested_vendor_2, proposal.suggested_vendor_3].some(
              (v) => v && (v as string).trim(),
            )
              ? html`<li class="text-slate-400 italic">(chưa có)</li>`
              : ''}
          </ul>
        </div>`
    : html``;

  const body = html`
    <div x-data="detail(${proposal.id})" class="max-w-3xl mx-auto space-y-4">
      <div class="flex items-center justify-between">
        <a href="/app" class="text-sm text-slate-500 hover:text-slate-700">← Hộp phiếu</a>
        <div class="flex items-center gap-3">
          ${typeBadge}
          ${statusBadge(status)}
          <a href="/p/${String(proposal.id)}/print" target="_blank"
            class="text-sm text-blue-900 hover:text-blue-700 hover:underline">
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
          ${isPr && needEn && proposal.engineering_name ? html`<div><div class="text-slate-500">EN duyệt</div><div>${proposal.engineering_name as string}</div></div>` : ''}
          ${isPr && proposal.ic_name ? html`<div><div class="text-slate-500">IC duyệt</div><div>${proposal.ic_name as string}</div></div>` : ''}
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
        ${!isPr && proposal.required_time
          ? html`<div>
              <div class="text-xs text-slate-500 mb-1">Thời gian cần thực hiện</div>
              <div>${proposal.required_time as string}</div>
            </div>`
          : ''}
        ${isPr && proposal.delivery_date
          ? html`<div>
              <div class="text-xs text-slate-500 mb-1">Ngày cần giao</div>
              <div>${proposal.delivery_date as string}</div>
            </div>`
          : ''}
        ${isPr
          ? html`<div>
              <div class="text-xs text-slate-500 mb-1">Cần EN xem xét spec</div>
              <div>${needEn ? 'Có' : 'Không'}</div>
            </div>`
          : ''}

        <div>
          <div class="text-xs text-slate-500 mb-1">${isPr ? 'Danh sách hàng mua' : 'Hạng mục'}</div>
          <div class="border border-slate-200 rounded overflow-x-auto">${itemsHtml}</div>
        </div>

        ${vendorsHtml}

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


# WorkIT ↔ Documenso — Bridge ký điện tử cho "Đề nghị thanh toán"

Trạng thái: **DRAFT** (2026-07-09). Mục tiêu: thêm ký điện tử Documenso vào phiếu **Đề nghị thanh toán** của WorkIT **mà không sửa được server WorkIT** (ERP đóng, logic compiled trong `Workit*.dll`).

## 1. Vì sao phải bridge (không native)
- WorkIT = ASP.NET MVC **compiled**; module DNTT = `KeToan/dn` (grid Kendo generic + engine duyệt `quytrinh_pheduyet`, in bằng **Telerik Reporting** `reportdefault`). Tất cả logic trong DLL vendor → **không nhúng được API/webhook/ghi-ngược trạng thái** nếu không có workit.vn.
- Bề mặt DUY NHẤT ta chạm được: **front-end** (JS injection vào layout, như nút "Đề xuất" đã làm) + **dữ liệu phiếu có sẵn trong browser** (Kendo grid `dataItem`, và API same-origin `/api/ketoan/*` mà session người dùng gọi được).
- ⇒ Bridge = nút inject trong WorkIT → **browser (đang đăng nhập WorkIT) gom dữ liệu phiếu** → POST sang app internal-control (đằng sau Entra SSO) → app render PDF + chạy Documenso → theo dõi/ lưu PDF ký **ở app ta**. WorkIT KHÔNG biết trạng thái ký (khoảng trống chấp nhận được cho v1).

## 2. Sơ đồ luồng
```
[WorkIT /KeToan/dn]  người dùng chọn 1 phiếu → bấm "Ký Documenso" (nút inject)
      │ JS (session WorkIT): đọc dataItem {id, soct, ngayct, noidung, tongtien}
      │        + (tuỳ chọn) fetch chi tiết same-origin /api/ketoan/... {_idchungtu:id}
      ▼ auto-submit <form POST target=_blank>  (điều hướng top-level, không vướng CORS)
[dexuat.avpgtech.com] POST /integrations/workit/sign   (GATE bằng requireAuth Entra)
      │ 1. render PDF DNTT (Gotenberg + template) ← tái dùng renderPaymentPdf pattern
      │ 2. createSignedDocument(pdf, signers)   ← src/lib/documenso.ts DÙNG NGUYÊN
      │ 3. lưu documenso_envelope + documenso_signer (externalId = workit-<id>)
      │ 4. distributeDocument → gửi mail người ký
      ▼ redirect → trang trạng thái ký
[Documenso] người ký lần lượt → webhook DOCUMENT_* → /integrations/documenso/webhook
      │ branch externalId "workit-*" → cập nhật documenso_envelope, kéo PDF ký về FILES
      ▼ trang trạng thái hiển thị đã ký + tải PDF
```

## 3. Phía WorkIT — nút inject (front-end)
Chèn giống nút "Đề xuất": 1 file JS trong `Content\` + 1 dòng `<script>` trước `</body>` của layout đang chạy `Views\Shared\_eLayout22.cshtml`. Nút gắn vào **toolbar của grid `#grid_lietke`** (chỉ hiện khi đang ở module `dn`).

Selector thật đã xác minh từ `Modules\KeToan\Areas\KeToan\Views\dn\Index.cshtml`:
- Grid id = `grid_lietke`, model `chungtu_model`, key `.id` (`m.Id(p => p.id)`).
- Field dùng được trong `dataItem`: `id`, `soct`, `ngayct`, `noidung`, `tongtien`, `diengiai`.
- Chi tiết dòng nạp riêng qua API với `{_idchungtu: id}` (grid `grid_chitiet`).

`Content\avpg-workit-sign.js` (phác):
```js
(function () {
  var APP = "https://dexuat.avpgtech.com/integrations/workit/sign";
  function onDnPage() { return !!document.getElementById("grid_lietke"); }

  function addButton() {
    var grid = $("#grid_lietke").data("kendoGrid");
    if (!grid) return false;
    var bar = grid.wrapper.find(".k-grid-toolbar");
    if (!bar.length || bar.find("#avpg-sign-btn").length) return true;
    var btn = $('<a id="avpg-sign-btn" class="k-button k-button-icontext" href="#" '
            + 'style="margin-left:6px"><span class="k-icon k-i-lock"></span>Ký Documenso</a>');
    btn.on("click", function (e) {
      e.preventDefault();
      var row = grid.select();
      if (!row.length) { alert("Chọn 1 phiếu trước khi ký."); return; }
      var it = grid.dataItem(row);
      sendToApp({
        id: it.id, soct: it.soct,
        ngayct: it.ngayct, noidung: it.noidung || it.diengiai || "",
        tongtien: it.tongtien
        // TODO: kèm chi tiết dòng nếu cần — fetch same-origin /api/ketoan/... {_idchungtu: it.id}
      });
    });
    bar.append(btn);
    return true;
  }

  function sendToApp(payload) {
    var f = document.createElement("form");
    f.method = "POST"; f.action = APP; f.target = "_blank";
    var i = document.createElement("input");
    i.type = "hidden"; i.name = "workit_payload";
    i.value = JSON.stringify(payload);
    f.appendChild(i); document.body.appendChild(f); f.submit(); f.remove();
  }

  // grid nạp bất đồng bộ → chờ bằng MutationObserver (giống avpg-dexuat.js)
  var obs = new MutationObserver(function () { if (onDnPage()) addButton(); });
  obs.observe(document.body, { childList: true, subtree: true });
  if (onDnPage()) addButton();
})();
```
Chèn: `<script src="/Content/avpg-workit-sign.js?v=1"></script>` trước `</body>` trong `_eLayout22.cshtml` (backup file như lần trước). Caveat bảo trì y hệt nút Đề xuất (vendor update có thể ghi đè layout).

**Cần verify trên phiên web thật:** class toolbar chính xác (`.k-grid-toolbar` vs theme khác), có cần chờ event `dataBound`, và endpoint `/api/ketoan/*` lấy chi tiết dòng.

## 4. Phía app internal-control — tái dùng tối đa
### 4.1 Tái dùng NGUYÊN (không sửa) — `src/lib/documenso.ts`
- `createSignedDocument(env, {title, externalId, pdf, signers})` — `documenso.ts:50`. GENERIC, nhận PDF bất kỳ + người ký. Đặt `externalId = "workit-<id>"`.
- `distributeDocument` (`:131`), `downloadDocumentPdf` (`:142`), `getDocumentRecipients` (`:112`), `verifyWebhookSecret` (`:175`).
- Ràng buộc cert PAdES/TSP: signingOrder phải RIÊNG 1..N (tuần tự, không song song) — như DNTT nội bộ.

### 4.2 Render PDF — tái dùng pattern `src/lib/payment-pdf.ts`
- `renderPaymentPdf` (`payment-pdf.ts:13`) gọi Gotenberg từ HTML. Cho WorkIT: viết 1 template `workitPaymentPrint(payload)` (hoặc map payload → dạng `pr/items` rồi tái dùng `paymentPrintPage`). `countPdfPages` (`payment-pdf.ts:42`) dùng nguyên để đặt ô ký trang cuối.
- v1: render từ dữ liệu POST. v2 (tuỳ chọn): kéo đúng bản in Telerik của WorkIT (`reportdefault`) client-side rồi upload — để chữ ký nằm trên layout chính chủ.

### 4.3 DB — bảng generic (migration mới `00NN_documenso_generic.sql`)
Không nhét vào `payment_request` (WorkIT không có row đó). Tạo cặp bảng keyed theo external:
```sql
CREATE TABLE documenso_envelope (
  id                 bigserial PRIMARY KEY,
  source             text NOT NULL,          -- 'workit'
  external_id        text NOT NULL,          -- '<workit chungtu id>'
  title              text,                   -- soct
  documenso_document_id integer,
  documenso_envelope_id text,
  documenso_status   text,                   -- PENDING|COMPLETED|REJECTED|CANCELLED
  signed_pdf_key     text, signed_pdf_sha256 text,
  created_by         text, sign_sent_at text, signed_completed_at text,
  UNIQUE(source, external_id)
);
CREATE INDEX idx_docenv_docid ON documenso_envelope(documenso_document_id);
CREATE TABLE documenso_envelope_signer (
  id bigserial PRIMARY KEY,
  envelope_id bigint NOT NULL REFERENCES documenso_envelope(id) ON DELETE CASCADE,
  role text, sign_order int, recipient_id bigint, email text, name text, signed_at text
);
```

### 4.4 Route mới — `src/routes/integrations-workit.ts`
- `POST /integrations/workit/sign` **đằng sau requireAuth** (Entra) — người khởi tạo = user AVP đang đăng nhập (ghi `created_by`, chống forge; payload WorkIT chỉ là prefill).
  1. Parse `workit_payload`; kiểm tra chưa có envelope `('workit', id)`.
  2. Render PDF (4.2). `countPdfPages` → lastPage.
  3. Form chọn/ xác nhận người ký (prefill từ `src/lib/routing.ts` nếu resolve được; Kế toán/BOD nhập tay) — giống form send-sign của DNTT (`payments.ts:1181`).
  4. `createSignedDocument({title: soct, externalId: "workit-"+id, pdf, signers})` → lưu `documenso_envelope` + `documenso_envelope_signer` → `distributeDocument`.
  5. Redirect → `/integrations/workit/:id` (trang trạng thái ký + nút tải PDF ký).

### 4.5 Webhook — nhánh mới trong `src/routes/integrations-documenso.ts`
Hiện `POST /webhook` (`integrations-documenso.ts:50`) chỉ tra `payment_request.documenso_document_id`. Thêm nhánh:
- Sau khi verify secret + lấy `payload.id`: **thử `documenso_envelope WHERE documenso_document_id=?` trước**. Nếu khớp (source=workit) → cập nhật `documenso_envelope_signer.signed_at` theo recipient (match `recipient_id`, fallback email), set status; COMPLETED → `downloadDocumentPdf` → `FILES.put` → `signed_pdf_key/sha256`.
- Không khớp → rơi về path `payment_request` cũ (giữ nguyên).
- Webhook URL vẫn là public `https://dexuat.avpgtech.com/integrations/documenso/webhook` (Documenso chặn URL nội bộ), secret header `X-Documenso-Secret` — dùng lại cấu hình sẵn.

## 5. Người ký (signers)
WorkIT có chuỗi duyệt riêng (`quytrinh_pheduyet`) nhưng ta không đọc được config (trong DB SQL Server). v1: **form xác nhận người ký ở app ta** (prefill Trưởng BP/KSNB/BOD từ `routing.ts`, Kế toán nhập tay), giống DNTT nội bộ. v2: map chuỗi duyệt WorkIT nếu vendor/DB cho phép.

## 6. Việc còn phải verify runtime (cần 1 tài khoản WorkIT web)
1. Class toolbar thật của `#grid_lietke` + thời điểm gắn nút (dataBound).
2. Endpoint `/api/ketoan/*` lấy chi tiết dòng phiếu (nếu muốn PDF đầy đủ) — và có gọi được bằng session người dùng không.
3. (v2) Cách export bản in Telerik `reportdefault` ra PDF client-side.

## 7. Rollout / backout
- App: thuần thêm mới (bảng + route + nhánh webhook) — không đụng luồng DNTT nội bộ. Deploy như thường (commit → procsvr git pull + `docker compose up --build app`, migration tự chạy).
- WorkIT: chỉ 1 file JS + 1 dòng script trong layout; backout = xoá dòng script. Không sửa gì server-side WorkIT.
- **REMIND:** đóng SSH tạm trên hcm-hrsvr sau khi triển khai xong.
```
```

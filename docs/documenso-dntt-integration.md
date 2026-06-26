# Tích hợp Documenso vào DNTT — Kế hoạch triển khai

> Mục tiêu: chuyển Giấy Đề Nghị Thanh Toán (DNTT, mẫu `AVPG-AC-P1-F1`) từ **in giấy → ký
> TAY → bấm tay theo dõi 6 chặng** sang **ký điện tử qua Documenso self-host**, để hệ thống
> tự cập nhật tiến độ chặng theo sự kiện ký và lưu lại bản PDF đã ký có giá trị chống chối bỏ.

Trạng thái tài liệu: **DRAFT để duyệt** (2026-06-26). Chưa code gì cho tới khi chốt các "Quyết
định còn mở" ở §9.

---

## 1. Hiện trạng (đã có, KHÔNG làm lại)

### 1.1 Documenso (procsvr, compose project `documenso-prod`)
- Image tự build `avpg/documenso:2.13.0` (source `~/avpg-self-signed`), listen `:3000`.
- Public: `https://sign.anvietphatgroup.com` (Caddy + cloudflared tunnel riêng).
- DB riêng `postgres:15`; upload PDF lưu **trong DB Documenso** (`NEXT_PUBLIC_UPLOAD_TRANSPORT=database`).
- **SSO Entra (M365) đã bật**: OIDC trỏ tenant AVPG; `NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true`
  → **chỉ login bằng M365**. Người ký = đúng tài khoản công ty ⇒ định danh mạnh (đúng lựa chọn đã chốt).
- **Self-signed cert** `certs/cert.p12` đã mount (passphrase đã set) → ký PAdES, không cần CA (đã chốt).
- SMTP gửi mail mời ký qua `noreply@anvietenergy.com`.

> ⚠️ **Cần review trước khi production-grade** (không chặn tích hợp):
> - `NEXT_PRIVATE_OIDC_SKIP_VERIFY=true` → nên đổi `false` với Entra (IdP TLS hợp lệ). Chỉ giữ
>   `true` nếu setup fail verify, và khi đó nên tìm nguyên nhân thật.
> - `.env` chứa mật khẩu DB inline trong `NEXT_PRIVATE_DATABASE_URL` → **không commit** file này lên git.

### 1.2 Module DNTT (compose project `internal-control`)
- Bảng: `payment_request`, `payment_request_item`, `payment_request_stage_log` (append-only),
  `payment_counters`. (`db/postgres/0009_payment_requests.sql`, `0010_payment_mid_order.sql`)
- `current_stage` 0..5; `status` = draft|in_progress|paid|cancelled (suy từ stage, trừ cancelled).
- 6 chặng (`prStages()` trong `src/routes/payments.ts`):
  `0 Nhập → 1 Trưởng bộ phận ký → 2/3 KSNB & Kế toán ký (mid_order) → 4 BOD ký → 5 Đã thanh toán`.
- `mid_order` (`'ksnb'|'acct'|NULL`): bên nào nhận hồ sơ trước thì ký trước ở cặp 2-3.
- Hiện cập nhật chặng **thủ công** qua `POST /payments/:id/advance|revert`, ghi `audit_events`
  (`pr_advance`) + `payment_request_stage_log`.
- Resolver người duyệt sẵn có (`src/lib/routing.ts`): `getDeptManager(dept)`, `getActiveBod()`,
  `getActiveIc()` (KSNB, `KSNB_DEPT_CODE='INT'`), `getActiveEngineering()`.
  → **KHÔNG có resolver Kế toán** (xem §9.2).
- Lưu file: `src/lib/filestore.ts` (`FILES.put/get`, lưu `UPLOAD_DIR=/data/uploads`, trả `{key,sha256,size}`).
- Mount route ở `src/app.ts`: `app.route('/payments', paymentRoutes)`.

---

## 2. Quyết định nền đã chốt

| Hạng mục | Chốt |
|---|---|
| Self-host vs SaaS | **Self-host** (đã chạy trên procsvr) |
| Định danh người ký | **SSO Entra (M365)** |
| Cert | **Self-signed** (không CA). RFC 3161 timestamp = tùy chọn bổ sung sau |
| Mạng app ↔ Documenso | **Shared docker network `avpg-bridge`** (máy-nói-máy nội bộ; public hostname chỉ cho người ký mở trình duyệt) |
| Pilot | **DNTT trước** (không đụng workflow Đề Xuất/Mua hàng) |

---

## 3. Kiến trúc tích hợp

```
                       Người ký (Trưởng BP / KSNB / Kế toán / BOD)
                                   │  (mở link ký, login M365)
                                   ▼  https://sign.anvietphatgroup.com  (Caddy+tunnel)
┌──────────────────────────── procsvr (1 host) ─────────────────────────────┐
│                                                                            │
│  internal-control-app:8787 ──(A) POST /api/v2/envelope/* ──►  documenso:3000│
│         ▲                       http://documenso:3000                       │
│         │                                                                   │
│         └──(B) webhook  ◄────  http://app:8787/integrations/documenso/...   │
│              (DOCUMENT_*, RECIPIENT signed)                                  │
│                                                                            │
│  cả hai service join external network `avpg-bridge`                         │
└────────────────────────────────────────────────────────────────────────────┘
```

- **(A) app → Documenso**: tạo envelope từ PDF DNTT, set 4 người ký theo thứ tự, distribute.
- **(B) Documenso → app**: webhook báo từng người ký xong / hoàn tất → app tự đẩy `current_stage`.
- Người ký vẫn dùng **public hostname** `sign.anvietphatgroup.com` (link trong mail) — chỉ traffic
  máy-nói-máy mới đi qua `avpg-bridge`.

### 3.1 Mô hình envelope (Documenso v2)
1. `POST /api/v2/envelope/create` (multipart) — `payload.type=DOCUMENT`, `payload.title`, file PDF.
   Documenso **tự quét placeholder text trong PDF** và tạo field tại đó ⇒ ta nhúng anchor token vào
   ô chữ ký trong bản in để khỏi tính toạ độ tay (xem §6.3).
2. `POST /api/v2/envelope/recipient/create-many` — mảng `{email,name,role,signingOrder}`.
3. (nếu không dùng anchor) `…/field/create-many` — đặt field SIGNATURE theo page+toạ độ.
4. `POST /api/v2/envelope/distribute` — gửi mail mời ký.
5. Webhook `DOCUMENT_COMPLETED` → tải PDF đã ký về (download endpoint) → `FILES.put`.

> Tên endpoint v2 cần **đối chiếu OpenAPI của bản 2.13.0** tại `https://sign.anvietphatgroup.com`
> (hoặc `openapi.documenso.com`) khi code — đây là plan, không phải spec cứng.

---

## 4. Mapping 6 chặng DNTT ↔ Documenso

| Stage | Tên chặng | Documenso recipient | signingOrder | Nguồn email |
|---|---|---|---|---|
| 0 | Nhập | (người lập — xem §9.4) | — | creator (phiên đăng nhập) |
| 1 | Trưởng bộ phận ký | recipient #1 | 1 | `getDeptManager(dept_code)` |
| 2/3 | KSNB & Kế toán ký | recipient #2 + #3 | **2 (cùng order)** | `getActiveIc()` + Kế toán (§9.2) |
| 4 | BOD ký | recipient #4 | 3 | `getActiveBod()` |
| 5 | Đã thanh toán | (không phải người ký) | — | đánh dấu tay sau khi chi tiền |

### 4.1 Xử lý `mid_order` bằng signingOrder song song
Documenso cho 2 recipient **cùng `signingOrder`** ký song song (ai trước cũng được). Gán **KSNB và
Kế toán cùng `signingOrder=2`** ⇒ khớp đúng yêu cầu "bên nào nhận trước ký trước". Khi webhook báo
recipient nào ký xong trước ở nhóm này, app set `mid_order` tương ứng (`'ksnb'`/`'acct'`) — tức
`mid_order` **suy ra từ thực tế ký**, không cần người dùng chọn nút nữa.

### 4.2 Stage 5 (Đã thanh toán) giữ thủ công
Không có chữ ký ⇒ Documenso không phát sự kiện. Giữ nút "Đã thanh toán" hiện tại để kế toán đánh
dấu sau khi chi tiền. Webhook chỉ tự động hoá tới stage 4.

---

## 5. Thay đổi hạ tầng (procsvr — cần xác nhận trước khi apply)

1. Tạo network dùng chung: `docker network create avpg-bridge`.
2. `~/internal-control/docker-compose.yml`: thêm `avpg-bridge` (external) cho service `app`,
   network alias `app`.
3. `~/documenso-prod/docker-compose.yml`: thêm `avpg-bridge` (external) cho service `documenso`,
   network alias `documenso`.
4. Recreate cả hai (`docker compose up -d`) để nhận network mới (không cần `--build` chỉ để add network).
5. Kiểm chứng: từ container app `wget -qO- http://documenso:3000/...health...` ra 200; ngược lại
   Documenso ping được `http://app:8787`.

> ⚠️ Đây là 2 thay đổi trên **PROD**: theo kỷ luật procsvr sẽ **xin OK trước khi chạy**. Lưu ý
> `docker-compose.yml` của internal-control trên procsvr có sửa tại chỗ chưa commit (`--protocol
> http2`) → `git stash` trước khi pull, hoặc sửa trực tiếp file trên procsvr.

---

## 6. Thay đổi trong repo internal-control

### 6.1 DB — migration `db/postgres/0011_payment_documenso.sql`
Thêm vào `payment_request` (idempotent `ADD COLUMN IF NOT EXISTS`):
- `documenso_envelope_id text` — id envelope/document bên Documenso.
- `documenso_status text` — mirror trạng thái (sent|partially_signed|completed|rejected|cancelled).
- `signed_pdf_key text` — storage key bản PDF đã ký (qua `FILES.put`).
- `signed_pdf_sha256 text` — hash để anchor chống tamper (xem §8).
- `sign_sent_at text`, `signed_completed_at text`.

Bảng map recipient → chặng (để webhook biết ai ký ứng với stage nào):
```sql
CREATE TABLE IF NOT EXISTS payment_request_signer (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  pr_id         bigint NOT NULL REFERENCES payment_request(id) ON DELETE CASCADE,
  role          text NOT NULL,          -- manager | ksnb | acct | bod
  stage_index   integer NOT NULL,       -- 1 | (2|3) | 4
  recipient_id  bigint,                 -- id recipient bên Documenso
  email         text NOT NULL,
  name          text,
  signed_at     text
);
```

### 6.2 Client API — `src/lib/documenso.ts` (mới)
- Cấu hình qua env: `DOCUMENSO_BASE_URL` (=`http://documenso:3000`), `DOCUMENSO_API_KEY`,
  `DOCUMENSO_WEBHOOK_SECRET`.
- Hàm: `createEnvelopeFromPdf(pdfBytes, title)`, `addRecipients(envelopeId, recipients)`,
  `distribute(envelopeId)`, `downloadSignedPdf(envelopeId)`.
- Dùng `fetch` (chạy Node) — KHÔNG import `node:fs`; giữ tách bundle như filestore.

### 6.3 Sinh PDF DNTT để upload — **quyết định ở §9.1**
Bản in hiện là HTML (`src/web/payment-print.ts`). Documenso cần **PDF**. Khuyến nghị: thêm sidecar
**Gotenberg** (`docker` service riêng, Chromium HTML→PDF qua HTTP) vào `avpg-bridge` — đúng nguyên
tắc "không nhét native dep vào container app". Trong HTML in, đặt **anchor token vô hình** tại 4 ô
chữ ký (vd `:sig-manager:`, `:sig-ksnb:`, `:sig-acct:`, `:sig-bod:`) để Documenso auto-tạo field
SIGNATURE đúng chỗ (khỏi tính toạ độ; bền với bảng kê dài làm xô trang).

### 6.4 Route mới — `src/routes/integrations-documenso.ts` (mount NGOÀI session auth)
- `POST /integrations/documenso/webhook` — **không qua sessionMiddleware** (máy-nói-máy); xác thực
  bằng chữ ký/secret webhook (so HMAC từ `DOCUMENSO_WEBHOOK_SECRET`). Mount ở `src/app.ts` TRƯỚC
  middleware phiên, hoặc nhánh path riêng.
- Xử lý sự kiện:
  - `RECIPIENT … signed` (hoặc `DOCUMENT_SIGNED` per-recipient): tìm `payment_request_signer` theo
    `recipient_id`/email → set `signed_at`; nếu là nhóm KSNB/Kế toán và là người ký đầu → set
    `mid_order`; tính `current_stage` mới (= chặng kế của người vừa ký) → UPDATE + ghi
    `payment_request_stage_log(kind='advance')` + `logAudit('pr_advance', source='documenso')`.
  - `DOCUMENT_COMPLETED`: tải PDF ký về → `FILES.put` → lưu `signed_pdf_key/sha256`,
    `current_stage=4`, `signed_completed_at`. (Stage 5 vẫn tay.)
  - `DOCUMENT_REJECTED`/`CANCELLED`: ghi log, đưa phiếu về trạng thái phù hợp (không xoá vết).
- Idempotent: webhook có thể gửi lại ⇒ check `signed_at`/trạng thái trước khi áp.

### 6.5 Sửa `src/routes/payments.ts`
- Nút mới ở trang chi tiết phiếu (chỉ khi `status` cho phép): **"Gửi ký điện tử"** →
  sinh PDF → `createEnvelopeFromPdf` → `addRecipients` (4 người, signingOrder như §4) →
  ghi `payment_request_signer` → `distribute` → set `documenso_envelope_id`, `sign_sent_at`,
  `current_stage=1`.
- Khi đã có `documenso_envelope_id`: **ẩn/khoá nút advance/revert tay** (tránh lệch với Documenso);
  vẫn giữ nút "Đã thanh toán" (stage 5) và "Huỷ".
- Link tải bản PDF đã ký (`signed_pdf_key`) khi completed.
- Validate trước khi gửi: 4 email người ký đều resolve được (báo lỗi rõ nếu thiếu manager/BOD/Kế toán).

### 6.6 Wiring env — `src/lib/node-env.ts` + `.env`
Thêm `DOCUMENSO_BASE_URL`, `DOCUMENSO_API_KEY`, `DOCUMENSO_WEBHOOK_SECRET` (+ `GOTENBERG_URL` nếu §9.1 chọn Gotenberg).

---

## 7. Cấu hình phía Documenso (làm trong UI/admin)
1. Tạo **API key** (Settings → API) → đưa vào `DOCUMENSO_API_KEY` của app.
2. Tạo **Webhook** trỏ `http://app:8787/integrations/documenso/webhook`, chọn events
   `DOCUMENT_SENT/SIGNED/COMPLETED/REJECTED/CANCELLED`, set secret = `DOCUMENSO_WEBHOOK_SECRET`.
3. Đảm bảo email người ký (manager/KSNB/Kế toán/BOD) **trùng** với tài khoản M365 họ login —
   vì SSO Entra, Documenso match theo email.

---

## 8. Non-repudiation (liên hệ Tầng 3)
- Bản PDF đã ký (PAdES, self-signed) = artifact tamper-evident **nằm ngoài DB internal-control**.
- Lưu thêm `signed_pdf_sha256` trong `payment_request`; cân nhắc **anchor hash ra ngoài** (email
  tự gửi / sổ WORM) như kế hoạch Tầng 3 — đây mới là phần chống sửa ở mức admin, độc lập self/CA cert.
- Tuỳ chọn nâng cấp sau: bật **RFC 3161 timestamp** trên Documenso để neo *thời điểm ký* ra bên thứ ba.
- Giữ `audit_events` (`pr_advance`, thêm `source='documenso'`) song song.

---

## 9. Quyết định còn mở (cần chốt trước khi code)

### 9.1 Sinh PDF DNTT — chọn cách
- **(A) Gotenberg sidecar** *(khuyến nghị)* — service Chromium riêng trên `avpg-bridge`, app POST
  HTML nhận PDF. Sạch, không native dep trong app, tái dùng `payment-print.ts`.
- (B) Thư viện PDF thuần JS (pdf-lib/...) — phải dựng lại layout, tốn công, khó khớp mẫu giấy.
- (C) Tạo PDF phía client rồi upload — phụ thuộc trình duyệt người tạo, khó kiểm soát.

### 9.2 Nguồn email **Kế toán** (chưa có resolver)
Cần 1 trong: (a) bảng/cấu hình `accounting_members` giống `bod_members`; (b) thêm field cấu hình
"kế toán phụ trách"; (c) người tạo chọn tay khi gửi ký. → **Chốt cách lấy email Kế toán.**

### 9.3 Coexistence với luồng giấy
Cho phép phiếu cũ/đang chạy giấy giữ luồng tay; phiếu mới đi điện tử. Khi có envelope thì khoá nút
tay (§6.5). → Xác nhận có cần "fallback về giấy" giữa chừng không.

### 9.4 Ô "Người lập" trên mẫu (5 ô chữ ký, chỉ map 4 người ký)
Phương án: (a) creator là recipient đầu ký ngay (signingOrder 0); (b) để trống/điền tên không cần
chữ ký điện tử; (c) auto-điền tên người lập dạng text field readonly. → Chốt.

### 9.5 Phạm vi người dùng
Module DNTT đang giới hạn phòng **IT** (`PR_ALLOWED_DEPTS=['IT']`). Pilot ký điện tử chạy trong IT
trước rồi mở rộng? → Xác nhận.

---

## 10. Phân đợt triển khai
- **Đợt 0 — Hạ tầng**: tạo `avpg-bridge`, nối 2 compose, tạo API key + webhook, smoke-test
  app↔Documenso (curl/health). (Cần OK procsvr.)
- **Đợt 1 — Sinh PDF**: chốt §9.1; dựng đường HTML→PDF; verify bản PDF khớp mẫu in hiện tại.
- **Đợt 2 — Gửi ký**: migration 0011 + `documenso.ts` + nút "Gửi ký điện tử" + tạo envelope/recipients/distribute.
- **Đợt 3 — Webhook**: route webhook (verify secret) → tự đẩy chặng + set mid_order + tải PDF ký về + audit.
- **Đợt 4 — Hoàn thiện**: khoá nút tay khi có envelope, link tải PDF ký, xử lý reject/cancel, anchor hash (§8).
- **Đợt 5 — Mở rộng**: review `OIDC_SKIP_VERIFY`, RFC 3161 timestamp, mở phạm vi phòng (§9.5).

---

## 11. Checklist verify (mỗi đợt)
- [ ] app container resolve `http://documenso:3000` và ngược lại qua `avpg-bridge`.
- [ ] Tạo 1 phiếu DNTT test → "Gửi ký điện tử" → 4 mail mời ký tới đúng người (login M365 ký được).
- [ ] KSNB & Kế toán ký bất kỳ thứ tự → `mid_order` set đúng theo người ký trước.
- [ ] Mỗi lần ký → `current_stage` tự nhảy + có dòng `payment_request_stage_log` + `audit_events`.
- [ ] Hoàn tất → PDF đã ký tải về `FILES` được, `signed_pdf_sha256` lưu, mở verify được chữ ký PAdES.
- [ ] Webhook gửi lại (idempotent) không nhân đôi chặng.
- [ ] Reject/Cancel xử lý đúng, không mất vết.

---

## Nguồn tham khảo Documenso
- API reference: https://docs.documenso.com/developers/public-api/reference · OpenAPI: https://openapi.documenso.com/
- Webhooks: https://docs.documenso.com/developers/webhooks
- Embedding: https://documenso.com/blog/introducing-embedding
- Entra SSO self-host: https://docs.documenso.com/docs/users/organisations/single-sign-on/microsoft-entra-id
- Self-hosted signing/cert (PAdES): https://documenso.com/blog/introducing-self-hosted-signing-infrastructure-for-enterprise

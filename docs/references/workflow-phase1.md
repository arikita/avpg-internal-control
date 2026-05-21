# Phase 1 — Workflow Phiếu Đề Xuất

> Spec chi tiết quy trình duyệt phiếu đề xuất, kèm trigger notification email/Telegram, template tin nhắn, và edge cases.
>
> **Update 2026-05-21**: KSNB không còn vai trò workflow. BOD approve = final
> (status='completed' luôn). State machine còn 5 states. KSNB chỉ nhận telegram
> group informational notify.

---

## 1. State machine

```
                    ┌─────────────────────────────────┐
                    │            REJECTED             │
                    │ (terminal — phải tạo phiếu mới) │
                    └─────────────────────────────────┘
                          ▲           ▲           ▲
                          │ reject    │ reject    │ reject
                          │           │           │
   ┌─────┐  submit   ┌─────────┐  approve   ┌──────────────────┐  approve   ┌──────────────┐  complete   ┌───────────┐
   │draft│──────────▶│submitted│───────────▶│manager_approved  │───────────▶│ bod_approved │────────────▶│ completed │
   └─────┘           └─────────┘            └──────────────────┘            └──────────────┘             └───────────┘
       ▲                                                                                                       (terminal)
       │
       │ (chỉ proposer edit khi draft; sau submit không sửa được)
```

**6 trạng thái:**

| State | Mô tả | Ai có thể tác động |
|---|---|---|
| `draft` | Proposer đang soạn, chưa gửi | Proposer (edit/delete/submit) |
| `submitted` | Đã gửi, chờ Manager duyệt | Manager (approve/reject) |
| `manager_approved` | Manager đã duyệt, chờ BOD | BOD (approve/reject) |
| `bod_approved` | BOD đã duyệt, chờ KSNB hoàn thiện | KSNB (complete) |
| `completed` | KSNB đã lưu hồ sơ — terminal | (không) |
| `rejected` | Bị từ chối tại bước nào đó — terminal | (không) |

---

## 2. Transition table

| # | Từ state | Event | Đến state | Actor | Điều kiện | Side effects |
|---|---|---|---|---|---|---|
| 1 | (none) | create | `draft` | Proposer | User đã login M365, `dept_code` không null | Insert proposal row |
| 2 | `draft` | update | `draft` | Proposer (owner) | Trong cùng record proposer tạo | Update fields, items |
| 3 | `draft` | delete | (deleted) | Proposer (owner) | — | Hard delete + items CASCADE |
| 4 | `draft` | submit | `submitted` | Proposer | Đã fill required fields | Sinh `code`, snapshot manager/bod, gửi notify Manager |
| 5 | `submitted` | approve | `manager_approved` | Manager (assigned) | — | Snapshot vào `approvals`, gửi notify BOD |
| 6 | `submitted` | reject | `rejected` | Manager (assigned) | Phải có `comment` (lý do) | Snapshot, gửi notify proposer |
| 7 | `manager_approved` | approve | `bod_approved` | BOD (assigned) | — | Snapshot, gửi notify KSNB |
| 8 | `manager_approved` | reject | `rejected` | BOD (assigned) | Phải có `comment` | Snapshot, gửi notify proposer + Manager |
| 9 | `bod_approved` | complete | `completed` | KSNB | — | Snapshot vào `approvals` step='ksnb', gửi notify proposer |

**Quy tắc chung:**
- Mọi transition gửi notify đều phải insert row vào `notifications` (status='pending') TRƯỚC khi gọi Graph/Telegram API.
- Worker đọc `notifications` pending để retry nếu fail.
- Sau khi gửi thành công → update `notifications.status='sent'`, `provider_msg_id`, `sent_at`.

---

## 3. Notification matrix

| Event | Email recipient | Telegram recipient | Tiêu đề/Nội dung chính |
|---|---|---|---|
| `submitted` | Manager phòng | Manager (nếu đã link bot) | "Phiếu mới chờ duyệt: {code}" |
| `manager_approved` | BOD | BOD (nếu đã link bot) | "Phiếu {code} cần duyệt — đã qua TP" |
| `bod_approved` | KSNB emails (env var) | KSNB group chat | "Phiếu {code} đã duyệt — chờ KSNB hoàn thiện" |
| `completed` | Proposer | Proposer | "Phiếu {code} đã hoàn thiện hồ sơ" |
| `rejected` (tại bước nào) | Proposer + (Manager nếu reject ở BOD) | Tương tự | "Phiếu {code} bị từ chối: {reason}" |

**Luật gửi:**
- Email: GỬI LUÔN cho mọi recipient (qua Graph `sendMail`).
- Telegram: chỉ gửi nếu recipient đã có `users.telegram_chat_id`. Không có → bỏ qua, không lỗi.
- KSNB group: hardcode `KSNB_TELEGRAM_CHAT_ID` trong env Worker (đợi anh cung cấp).

---

## 4. Email templates

Format: HTML đơn giản (table-based để compat Outlook), không CSS phức tạp. Lưu template trong code (`src/templates/email/*.ts`), interpolate biến.

### 4.1. Template: `submitted` → Manager

```
Subject: [AVPG] Phiếu đề xuất {code} cần bạn duyệt

Kính gửi {manager_name},

Anh/chị có 1 phiếu đề xuất mới cần duyệt:

  • Mã phiếu:    {code}
  • Người đề nghị: {proposer_name} ({proposer_dept})
  • Nội dung:     {title}
  • Thời gian:    {required_time}

Lý do:
  {reason}

▶ [Mở phiếu để duyệt] (button → https://dexuat.avpgtech.com/p/{id})

—
AVPG · Phiếu Đề Xuất
(email tự động — đừng reply)
```

### 4.2. Template: `manager_approved` → BOD

```
Subject: [AVPG] Phiếu {code} đã qua TP — chờ BGĐ duyệt

Kính gửi {bod_name},

Phiếu đề xuất sau đã được Trưởng phòng duyệt, kính chuyển BGĐ:

  • Mã phiếu:    {code}
  • Đề xuất:     {title}
  • Người đề nghị: {proposer_name} ({proposer_dept})
  • TP đã duyệt: {manager_name}  ({manager_acted_at, VN time})
  • Ý kiến TP:   {manager_comment | "(không có)"}

▶ [Mở phiếu để duyệt]

—
AVPG · Phiếu Đề Xuất
```

### 4.3. Template: `bod_approved` → KSNB

```
Subject: [AVPG] Phiếu {code} đã duyệt xong — cần hoàn thiện hồ sơ

Phiếu đề xuất sau đã được BGĐ duyệt, đến lượt KSNB hoàn thiện hồ sơ:

  • Mã phiếu:     {code}
  • Đề xuất:      {title}
  • Người đề nghị: {proposer_name} ({proposer_dept})
  • TP duyệt:     {manager_name}
  • BGĐ duyệt:    {bod_name}

▶ [Mở phiếu để xử lý]
```

### 4.4. Template: `completed` → Proposer

```
Subject: [AVPG] Phiếu {code} của bạn đã hoàn thành

{proposer_name},

Phiếu đề xuất "{title}" của bạn đã được duyệt và lưu hồ sơ.

  • Mã phiếu:  {code}
  • TP duyệt:  {manager_name} ({manager_acted_at})
  • BGĐ duyệt: {bod_name} ({bod_acted_at})
  • KSNB lưu:  {ksnb_actor_name} ({completed_at})

▶ [Xem chi tiết phiếu]
```

### 4.5. Template: `rejected` → Proposer (+ Manager nếu reject ở BOD)

```
Subject: [AVPG] Phiếu {code} bị từ chối

{proposer_name},

Phiếu đề xuất của bạn đã bị từ chối tại bước {step_label}:

  • Mã phiếu:    {code}
  • Đề xuất:     {title}
  • Người từ chối: {rejector_name}  ({rejected_at})
  • Lý do:
      {rejected_reason}

Bạn có thể tạo phiếu mới nếu cần đề xuất lại.

▶ [Xem phiếu]
```

**Sender:** dùng shared mailbox `no-reply@anvietenergy.com` (anh cần tạo trong M365 + cấp quyền `Mail.Send` cho App registration).

---

## 5. Telegram bot

### 5.1. Bot commands

| Command | Ai dùng | Tác dụng |
|---|---|---|
| `/start` | Tất cả | Welcome, hướng dẫn link tài khoản M365 |
| `/link <token>` | Tất cả | Link Telegram chat với user M365. Token sinh từ web (mục "Cài đặt → Liên kết Telegram") |
| `/mypending` | Manager/BOD | Liệt kê phiếu đang chờ mình duyệt |
| `/help` | Tất cả | Danh sách lệnh |

**Không có** `/new` để tạo phiếu — theo quyết định Phase 1, tạo phiếu chỉ qua web.

### 5.2. Notification message format (DM)

```
🔔  Phiếu đề xuất mới cần duyệt

📋  KD01-20052026
👤  Nguyễn Văn A — Kinh doanh
📝  Trang bị laptop team mới
⏱   Trước 15/06/2026

[✅ Duyệt]  [❌ Từ chối]  [📄 Xem chi tiết]
```

**Inline button callback_data format:** `act:{action}:{proposal_id}` — vd `act:approve:42`, `act:reject:42`, `act:detail:42`.

**Limit:** Telegram callback_data ≤ 64 bytes → format trên dư sức.

### 5.3. Flow duyệt qua Telegram

```
User bấm [✅ Duyệt]
   ↓
Bot gửi: "Xác nhận duyệt phiếu KD01-20052026?  [Có] [Không]"
   ↓ Có
Bot xử lý: kiểm tra user có quyền (manager hoặc bod của phiếu này),
           kiểm tra status hợp lệ, gọi internal API,
           edit message gốc → "✅ Đã duyệt lúc 10:42"
           (xoá inline buttons để tránh duyệt lại)
```

```
User bấm [❌ Từ chối]
   ↓
Bot gửi: "Lý do từ chối? (gõ vào chat)"
   ↓ (user gõ text)
Bot lưu reply → gọi API reject với comment → edit message gốc
```

**State quản lý:** dùng Cloudflare KV để lưu pending action ngắn hạn (TTL 5 phút), key = `tg:pending:{chat_id}`.

### 5.4. Bot trong nhóm chat KSNB

- Notification `bod_approved` được gửi vào group chat KSNB (theo `KSNB_TELEGRAM_CHAT_ID`).
- Trong group, KHÔNG hiển thị nút "Duyệt/Từ chối" — chỉ nút `[📄 Xem chi tiết]` deeplink web.
- Lý do: hành động trong group ai cũng bấm được, dễ loạn. Action cá nhân qua DM.

---

## 6. Edge cases

### 6.1. Proposer chính là Manager của phòng mình
- Vd: TP Kinh doanh tự tạo phiếu.
- **Quyết định đề xuất:** auto-approve bước Manager. Insert `approvals` row với `action='approve'`, `comment='Tự duyệt do là TP phòng'`. Chuyển thẳng `submitted` → `manager_approved` → notify BOD.
- Lý do: tránh self-approve thủ công gây nhầm lẫn.

### 6.2. Proposer chính là BOD
- Vd: BOD tự tạo phiếu.
- **Quyết định đề xuất:** không skip — vẫn cần Manager phòng BOD duyệt trước. Khi tới bước BOD và proposer == BOD → auto-approve giống case trên.
- Lý do: BOD có thể là TGĐ, vẫn cần TP duyệt khâu hành chính trước cho đúng quy trình.

### 6.3. Manager đang đi vắng dài hạn
- Phase 1 không có cơ chế ủy quyền.
- **Workaround:** KSNB tạm thời update `department_managers` trỏ về người ủy quyền.
- Sẽ làm proper delegation ở phase sau.

### 6.4. BOD reject sau khi Manager đã approve
- Phiếu chuyển `rejected`. Manager bị notify để biết.
- Lý do gửi cho Manager: tránh trường hợp Manager không biết tại sao quyết định mình bị đảo.

### 6.5. User trong AD không có department
- Login OK nhưng chặn ở bước tạo phiếu, hiện message: "Tài khoản chưa được gán phòng ban. Liên hệ KSNB."
- Audit log entry để KSNB biết ai bị chặn.

### 6.6. Race condition khi sinh mã phiếu
- Đã giải quyết bằng `proposal_counters` + atomic `INSERT ... ON CONFLICT DO UPDATE RETURNING`.
- Nếu vẫn fail (conflict trên `proposals.code`) → retry 1 lần.

### 6.7. Mất kết nối khi đang gửi notification
- Insert `notifications` row trước. Worker cron (chạy mỗi 5 phút) quét row `status='pending'`, gửi lại. Max 5 attempts.
- Tránh user phải reload trang để thấy phiếu đã chuyển state.

### 6.8. >99 phiếu/phòng/ngày
- Counter overflow. Phase 1 chấp nhận giới hạn, throw error 422 "Vượt giới hạn 99 phiếu/ngày, liên hệ KSNB".
- Nếu thực tế gặp → mở rộng counter lên 3 chữ số ở migration sau.

### 6.9. Telegram bot fail (token sai, chat_id sai)
- Insert `notifications` với `status='failed'`, `error=...`. KSNB review qua admin view.
- Email vẫn được gửi độc lập → user không miss thông tin quan trọng.

---

## 7. Reminders (NOT in Phase 1)

Không tự động nhắc trong Phase 1. KSNB chase manual qua Telegram group.

Phase 2 có thể thêm:
- Cron mỗi 9h sáng, list phiếu `submitted/manager_approved` đã quá X giờ, gửi reminder cho approver.

---

## 8. Withdrawal (NOT in Phase 1)

Proposer KHÔNG thể rút phiếu sau khi submit. Nếu nhầm → nhờ Manager reject.

---

## 9. Open questions cần KSNB chốt

1. **Email sender mailbox đã chốt:** `no-reply@anvietenergy.com`. KSNB cần tạo shared mailbox này trong M365 + cấp quyền `Mail.Send` cho App registration sau khi tạo App.
2. **Telegram group ID:** anh tạo group + add bot, gửi em chat ID.
3. **BOD member đầu tiên:** email + tên người duy nhất sẽ duyệt ở Phase 1.
4. **Department mapping:** danh sách phòng ban + mã 2 chữ. Format CSV:
   ```
   ad_name, code, full_name
   Kinh doanh, KD, Phòng Kinh doanh
   Nhân sự, NS, Phòng Nhân sự
   ...
   ```
5. **Manager mapping:** mỗi phòng ai là TP. Format:
   ```
   dept_code, user_email, user_name
   KD, tran.van.b@avpg.vn, Trần Văn B
   ...
   ```
6. **Self-approve khi proposer là Manager/BOD:** confirm logic ở mục 6.1 và 6.2.

---

## 10. Tóm tắt kiến trúc end-to-end

```
┌──────────┐    OIDC     ┌─────────────────┐    Graph     ┌──────────────┐
│ Browser  │────────────▶│ Worker (Hono)   │─────────────▶│ Microsoft 365│
│ (Pages)  │             │                 │              │  · /me       │
└──────────┘             │  · auth         │              │  · sendMail  │
                         │  · CRUD proposal│              └──────────────┘
                         │  · transitions  │
                         │  · notify queue │              ┌──────────────┐
                         │                 │─────────────▶│ Telegram API │
                         └────────┬────────┘   Bot API    └──────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Cloudflare D1   │
                         │ Cloudflare KV   │  (telegram pending state)
                         │ Cloudflare R2   │  (Phase 2: attachments)
                         └─────────────────┘
```

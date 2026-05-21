# AVPG · Phiếu Đề Xuất

Hệ thống quy trình đề xuất & phê duyệt nội bộ của tập đoàn AVPG. Toàn bộ nhân viên sử dụng, tích hợp M365 + Telegram.

> Phase 1 mới làm phiếu đề xuất chung. Các module riêng cho KSNB (mua hàng, báo cáo nội bộ) sẽ ship ở phase sau.

## Phase 1 — Phiếu đề xuất

Quy trình: **Người đề xuất → Trưởng phòng duyệt → BOD duyệt → KSNB hoàn thiện hồ sơ**

Người dùng tạo phiếu qua web; Telegram dùng để notify + duyệt nhanh (inline button). Thông báo qua email M365 + Telegram DM.

## Stack

| Lớp | Công nghệ |
|---|---|
| Frontend | Cloudflare Pages + HTML/Tailwind/Alpine.js |
| Backend | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Files | Cloudflare R2 |
| Auth | Microsoft Entra ID (M365 OIDC) |
| Email | Microsoft Graph API |
| Telegram | Bot Webhook |
| CI/CD | GitHub → Cloudflare auto-deploy |

## Cấu trúc thư mục

```
docs/                     # Tài liệu nghiệp vụ + setup guide
├── templates/            # Template phiếu đề xuất (Word/Excel)
├── users/                # Danh sách Manager / BOD / KSNB và luồng duyệt
└── references/           # Workflow phase 1, Entra setup, business rules

migrations/               # D1 SQL migrations
├── 0001_initial_schema.sql
└── 0002_seed_dev.sql     # Chỉ chạy --local

src/                      # Worker source
├── index.ts              # Hono app + cron handler
├── types.ts              # Bindings + session types
├── middleware/           # auth, error handler
├── lib/                  # entra, session, codes, routing, notifications, time, users
└── routes/               # auth, proposals, directory, telegram

wrangler.toml             # Cloudflare config (D1/KV binding, cron, env)
.dev.vars.example         # Copy → .dev.vars để chạy local
```

---

## Bắt đầu chạy local

### Bước 1 — Cài dependencies

```bash
npm install
```

### Bước 2 — Tạo D1 + KV (1 lần duy nhất)

```bash
npx wrangler d1 create avpg_db
npx wrangler kv namespace create AVPG_KV
```

Mỗi lệnh in ra một `id` — **paste vào `wrangler.toml`** chỗ tương ứng (`database_id`, KV `id`).

### Bước 3 — Tạo `.dev.vars`

```bash
cp .dev.vars.example .dev.vars
```

Mở `.dev.vars` sửa giá trị. Phase 1 có thể để placeholder cho Entra — biến `DEV_MOCK_USER="1"` sẽ tự login user fake để test API.

### Bước 4 — Apply migration

```bash
npm run db:apply:local
```

### Bước 5 — Chạy

```bash
npm run dev
```

Mở `http://localhost:8787/health` → phải trả `{"ok":true,...}`.
`/me` → trả mock user (vì `DEV_MOCK_USER=1`).

### Test API nhanh

```bash
# Tạo phiếu draft
curl -X POST http://localhost:8787/api/proposals \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","reason":"Lý do","required_time":"30/05/2026","items":[{"seq":1,"content":"X"}]}'

# Submit
curl -X POST http://localhost:8787/api/proposals/1/submit
```

---

## Deploy lên Cloudflare

→ Xem **[`docs/references/deploy-cloudflare.md`](docs/references/deploy-cloudflare.md)** cho step-by-step đầy đủ (10 bước, ~30 phút).

Quick reference:
```bash
npx wrangler login                                # Bước 1
npx wrangler d1 create avpg_db --env production   # Bước 2 — paste id vào wrangler.toml
npx wrangler kv namespace create AVPG_KV --env production
npm run db:apply:remote                           # Bước 3
# Bước 4: push 7 secrets (xem deploy-cloudflare.md)
# Bước 5: insert seed thật (departments, managers, bod)
npm run deploy                                    # Bước 6 — custom domain tự bind
# Bước 7: setWebhook cho Telegram bot
# Bước 8: add prod redirect URI vào Entra App
```

Domain production: **`https://dexuat.avpgtech.com`** (custom domain bind tự động qua `wrangler.toml`).

### Update sau khi deploy

```bash
npm run deploy
```

(GitHub Action CI/CD sẽ thêm sau.)

---

## Trạng thái Phase 1

✅ Schema D1 (10 bảng)
✅ Workflow spec + email template (`docs/references/workflow-phase1.md`)
✅ Entra setup guide (`docs/references/setup-entra-app.md`)
✅ Worker scaffold (Hono, OIDC, proposal CRUD, state machine)
✅ Notification queue stub (insert pending; cron 5 phút)

🚧 Đang làm tiếp:
- Frontend (Cloudflare Pages — form + inbox)
- Graph sendMail thật (hiện mới enqueue)
- Telegram bot handler (commands + inline approve)
- GitHub Action CI/CD

## Workflow upload tài liệu nghiệp vụ

1. Upload file qua **GitHub web UI** (drag-drop vào đúng folder trong `docs/`)
2. Đầu session tiếp theo, Claude tự `git pull` để lấy file mới
3. Claude đọc file và xử lý

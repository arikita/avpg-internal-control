# AVPG · Phiếu Đề Xuất

Hệ thống quy trình đề xuất & phê duyệt nội bộ của tập đoàn AVPG. Toàn bộ nhân viên dùng chung, tích hợp M365 (đăng nhập + email) và Telegram (thông báo + duyệt nhanh).

> **Self-hosted** (on-prem) từ 2026-05. Trước đây chạy trên Cloudflare Workers/D1 — đã cutover sang server riêng + PostgreSQL + Cloudflare Tunnel. Xem [`docs/migration-selfhost.md`](docs/migration-selfhost.md).

## Quy trình duyệt

Có 2 loại phiếu, đi tuần tự (mỗi thời điểm chỉ chờ ở 1 bước):

- **Phiếu chung (general):** Người đề xuất → **Trưởng phòng (TP)** → **BGĐ** → hoàn thành.
- **Phiếu mua hàng (purchase):** Người đề xuất → **TP** → *(Kỹ thuật/EN nếu cần)* → **KSNB/IC** → **BGĐ** → hoàn thành.

Auto-skip: nếu người đề xuất trùng vai trò duyệt nào (TP/EN/IC/BGĐ) thì bước đó tự duyệt. Phiếu bị **từ chối là terminal** — không sửa lại được, phải tạo phiếu mới. Phiếu chỉ **sửa được khi chưa có bước phê duyệt nào** (draft/submitted).

## Tính năng chính

- Tạo/sửa phiếu qua web; duyệt qua web hoặc nút inline trên Telegram.
- Thông báo qua email M365 (Microsoft Graph) + Telegram DM.
- **Chữ ký:** upload ảnh → tự xử lý (xóa nền bằng Otsu, làm nét, đổi mực xanh, PNG nền trong suốt) chèn vào phiếu in.
- **Audit log bất biến** (non-repudiation): ghi IP/thiết bị/phiên/kênh tại mỗi bước duyệt — xem ở `/admin/audit`.
- **VAT nhập tay** (0/8/10%) cho phiếu mua hàng, tổng tiền tự tính.
- **Account-sync:** account bị disable trên Entra/AD → chặn web + Telegram (cron poll).
- Comment khi duyệt/từ chối (không bắt buộc); 1 tab **"Phiếu cần duyệt"** gộp mọi vai trò.

## Kiến trúc

Monolith server-rendered (frontend + backend chung 1 app Node/Hono). Không có SPA / build step riêng.

```
clasvr01 (DEV — sửa code, push)  →  GitHub (origin/main)  →  procsvr (PROD)
                                                               docker compose:
   người dùng ──HTTPS──► Cloudflare edge ──Tunnel(AVPG_Request)──►  app:8787 (Node/Hono)
   (dexuat.avpgtech.com)                                            postgres:5432
```

| Lớp | Công nghệ |
|---|---|
| Web framework | Hono trên Node (`@hono/node-server`), chạy bằng `tsx` |
| Frontend | SSR HTML (`hono/html`) + Tailwind (CDN) + Alpine.js (CDN) |
| Database | **PostgreSQL 16** (adapter `src/lib/pg.ts` mô phỏng API D1; KV → bảng `ephemeral_kv`) |
| Hạ tầng | Docker Compose (app + postgres + cloudflared), ingress = **Cloudflare Tunnel** |
| Auth | Microsoft Entra ID (M365 OIDC), session cookie HMAC |
| Email | Microsoft Graph API (`/users/{mailbox}/sendMail`) |
| Telegram | Bot Webhook |
| Cron | `node-cron` (notifications, account-sync, dọn KV) |

## Cấu trúc thư mục

```
db/postgres/              # Migration Postgres (áp tự động lúc app khởi động)
├── 0001_init.sql         #   schema gộp + iso_now() + ephemeral_kv
├── 0002_audit_events.sql #   audit log append-only
└── 0003_add_vat_rate.sql

src/
├── server.ts             # Entrypoint Node (prod) — serve + cron + migrate
├── app.ts                # Hono app, wiring routes (dùng chung)
├── index.ts              # Entry Cloudflare Worker — LEGACY, giữ tham khảo
├── lib/                  # pg, migrate-pg, node-env, entra, graph, session, codes,
│                         #   routing, notifications, pr-math, account-sync, audit, ...
├── middleware/           # auth (session + requireAdmin)
├── routes/               # auth, proposals, me, admin, directory, telegram, web, static
└── web/                  # layout.ts, pages.ts (form/dashboard/detail), print.ts

docs/                     # Tài liệu nghiệp vụ + quy trình (QT-IT-*), migration plan
docker-compose.yml        # app + postgres + cloudflared
Dockerfile                # node:22-alpine, chạy `npm start` (tsx)
.env.example              # copy → .env (đã gitignore)
wrangler.toml             # config Worker cũ — LEGACY
```

## Chạy local (dev)

Cách giống prod nhất là dùng Docker Compose:

```bash
cp .env.example .env          # điền DATABASE_URL, SESSION_SECRET, ...
#   để test không cần OIDC thật: đặt APP_ENV=development + DEV_MOCK_USER=1
docker compose up -d --build postgres app
docker compose logs -f app    # thấy: applied *.sql · migrations OK · listening :8787
```

Hoặc chạy thẳng bằng Node (cần 1 Postgres + biến môi trường đã export):

```bash
npm install
npm run dev:node              # tsx watch src/server.ts (hot-reload)
```

Migration `db/postgres/*.sql` **tự áp lúc khởi động** (idempotent, track ở `schema_migrations`). `npm run typecheck` để check TypeScript.

> Các script `npm run dev|deploy|db:*` trong `package.json` là của stack Cloudflare cũ — **không dùng nữa**.

## Deploy (production — procsvr)

Dev sửa code trên clasvr01 → commit + push GitHub → trên **procsvr** kéo về + rebuild:

```bash
# trên procsvr (~/internal-control)
git pull --ff-only
docker compose up -d --build app     # migration mới (nếu có) tự chạy lúc app start
```

Domain production: **`https://dexuat.avpgtech.com`** (Cloudflare Tunnel `AVPG_Request` → `http://app:8787`, cấu hình ingress ở Zero Trust dashboard).

## Workflow upload tài liệu nghiệp vụ

1. Upload file qua **GitHub web UI** (kéo-thả vào đúng folder trong `docs/`).
2. Đầu session sau, `git pull` để lấy file mới rồi xử lý.

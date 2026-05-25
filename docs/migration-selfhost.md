# Kế hoạch migration: Cloudflare → self-hosted on-prem

> Trạng thái: **Phase 0 (chuẩn bị hạ tầng)** · Cập nhật: 2026-05-25
> Tài liệu sống — cập nhật khi chốt thêm quyết định.

## 1. Bối cảnh & mục tiêu

Chuyển KSNB webapp (Phiếu Đề Xuất) từ **Cloudflare Workers + D1 + KV** sang **server tự quản đặt on-prem** (cùng mạng Domain Controller), DB = **PostgreSQL**. Code & docs vẫn ở GitHub để tham khảo.

**Động lực:**
1. **LDAP đọc thẳng Domain Controller** → phát hiện account bị disable gần realtime. Xoá BỎ cả Graph poll lẫn độ trễ AD Connect (~30'); độ trễ chỉ còn = chu kỳ LDAP poll (1–2'). *Đây là lý do đáng giá nhất.*
2. Sở hữu & kiểm soát dữ liệu (DB nội bộ).
3. Bớt phụ thuộc Cloudflare.
4. Dễ mở rộng (background jobs, file storage, tích hợp nội bộ).

**Tin tốt:** code Hono gần như portable — chạy trên Node qua `@hono/node-server`. Routes/logic/business-rules giữ nguyên. App hiện chỉ phụ thuộc `hono`.

## 2. Quyết định đã chốt (Phase 0)

| Hạng mục | Chốt |
|---|---|
| OS server | Ubuntu Linux + **Docker** |
| PostgreSQL | Cài **cùng máy** app (container riêng trong compose) |
| LDAP | DC có sẵn, **có cert** (LDAPS 636) |
| Service account LDAP | **CHƯA có** — cần tạo (xem §11) |
| Ingress | **A — Cloudflare Tunnel** (bot giữ webhook) |
| Query layer | Adapter mỏng trên `pg` (Drizzle cho tính năng mới) |

## 3. Kiến trúc đích

```
                 Internet
                    │  (ingress: §4)
            ┌───────▼────────┐
            │ Reverse proxy  │  Caddy (TLS) hoặc cloudflared tunnel
            │   (HTTPS)      │
            └───────┬────────┘
   ┌────────────────┼─────────────────┐  Docker compose (Ubuntu on-prem)
   │  ┌─────────────▼───────────┐      │
   │  │ App: Node + @hono/node  │      │
   │  │  - routes/logic (giữ)   │      │
   │  │  - node-cron scheduler  │      │
   │  └──────┬───────────┬──────┘      │
   │         │           │             │
   │  ┌──────▼─────┐  ┌──▼───────────┐ │
   │  │ PostgreSQL │  │ ldapts ──────┼─┼──► Domain Controller (LDAPS 636)
   │  └────────────┘  └──────────────┘ │       (cùng LAN)
   └───────────────────────────────────┘
```

| Cloudflare (cũ) | Self-hosted (mới) |
|---|---|
| Workers runtime | Node.js LTS + `@hono/node-server` |
| D1 (SQLite) | PostgreSQL (qua adapter, §6) |
| KV | bảng `ephemeral_kv(key, value, expires_at)` (§7) |
| Cron triggers `*/5`, `*/15` | `node-cron` trong process (§8) |
| account-disable: Graph poll | **LDAP query tới DC** (§5) |
| `wrangler secret`, `env.*` | `.env` (không commit), `process.env` (§9) |
| HTTPS + custom domain | reverse proxy + ingress (§4) |

## 4. Ingress (chi tiết — chờ chốt)

On-prem ⇒ server IP nội bộ, internet không gọi vào trực tiếp. 2 luồng cần đi-vào HTTPS:
- **Telegram webhook** (server Telegram POST vào) — *ép buộc* public, cert hợp lệ. Né được bằng long-polling (phương án C).
- **Entra OAuth redirect** (browser user bị redirect về `/auth/callback`) — chỉ cần public nếu có user remote.

**A. Cloudflare Tunnel** ✅ **(ĐÃ CHỌN)** — `cloudflared` kết nối ra ngoài, CF publish domain & tunnel xuống. Không mở firewall, giữ domain. Nhưng traffic qua CF (data vẫn on-prem). cloudflared chạy như 1 service trong `docker-compose`, forward về `app:8787` (HTTP nội bộ — TLS terminate ở CF edge). Bot **giữ webhook**.

**B. NAT 443 + Caddy + Let's Encrypt** — mở inbound 443, public DNS → IP công ty, Caddy auto-TLS. Tự chủ hoàn toàn; cần IP tĩnh + duyệt IT/security + tăng bề mặt tấn công.

**C. Telegram long-polling + web nội bộ** — bot dùng `getUpdates` (chỉ đi ra), không cần inbound. App chạy FQDN nội bộ, cert CA nội bộ. Khoá kín nhất; cần sửa code bot, user remote phải VPN.

> Khuyến nghị: A (nhanh) / B (tự chủ) / C (khoá kín). Lựa chọn ảnh hưởng `docker-compose` + có sửa code bot hay không.

## 5. LDAP / AD integration (phần lõi)

- AD lưu trạng thái disable ở attribute `userAccountControl`, bit `0x2` (ACCOUNTDISABLE).
- Lib: **`ldapts`** (promise-based). Bind = service account read-only qua **LDAPS 636**.
- Query lấy **chỉ** account disabled (1 lần, nhẹ):
  ```
  (&(objectCategory=person)(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))
  ```
- Join AD ↔ app: `userPrincipalName` (AD) ↔ `users.email` (app, lowercased). Set `account_enabled = 0` cho match.
- `node-cron` chạy mỗi 1–2'. Verify: disable trên DC → app chặn trong ~2'.

> **Tái sử dụng:** phần account-sync đã build (migration `0006` cột `account_enabled`/`account_checked_at`, chặn ở `sessionMiddleware` + 3 chỗ trong `routes/telegram.ts`) GIỮ NGUYÊN — chỉ thay nguồn dữ liệu trong `src/lib/account-sync.ts`: `fetchAccountEnabled` (Graph) → LDAP query. Re-enable vẫn xử lý tức thì lúc login (upsert set `account_enabled=1`).

## 6. Query layer (D1 → Postgres)

Hiện tại: raw SQL `env.DB.prepare("... ?1 ...").bind(...).first()/.all()/.run()` (API D1/SQLite).

**Hướng adapter-first (khuyến nghị cho migration):** viết wrapper mỏng phơi API giống D1 trên `pg`/`postgres`:
- `?1, ?2` → `$1, $2`
- `.first<T>()` → `rows[0] ?? null`; `.all<T>()` → `{ results: rows }`; `.run()` → execute
- `env.DB` thay bằng instance adapter (inject qua context/closure)
- Sửa SQL dialect: `datetime('now')` → `now()`; `INTEGER PRIMARY KEY AUTOINCREMENT` → `GENERATED ... AS IDENTITY`/`serial`; boolean 0/1 → `smallint`/`boolean` (giữ 0/1 để ít sửa logic); `INSERT ... ON CONFLICT` của SQLite ~ tương thích Postgres (cú pháp gần giống).

→ Port nhanh, ít rủi ro, giữ nguyên cấu trúc query. **Tính năng MỚI** dùng Drizzle (typed + migration tooling).

## 7. KV → Postgres

KV hiện dùng cho: OIDC state/nonce (TTL 10'), Telegram pending-reject (TTL 5'), cache app-token Graph (~50'). Tất cả ngắn hạn.

→ Bảng `ephemeral_kv(key TEXT PK, value TEXT, expires_at TIMESTAMPTZ)`. Helper `kvGet/kvPut(ttl)/kvDelete` + job dọn rác (xoá `expires_at < now()`) trong `node-cron`. (Nếu sau này cần, đổi sang Redis — nhưng mục tiêu "mọi thứ trên DB" ⇒ Postgres trước.)

## 8. Cron

`node-cron` trong process (server long-running):
- `*/5` — `runNotificationQueue` (giữ nguyên).
- `*/1`–`*/2` — `runAccountSync` (LDAP).
- dọn `ephemeral_kv` hết hạn.

## 9. Secrets / config

`.env` (gitignore) → `process.env`. Cần: `DATABASE_URL`, `SESSION_SECRET`, `TENANT_ID/CLIENT_ID/CLIENT_SECRET` (Entra login vẫn dùng), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (nếu phương án A/B), `LDAP_URL/LDAP_BIND_DN/LDAP_BIND_PASSWORD/LDAP_BASE_DN`, `APP_BASE_URL`, `ADMIN_EMAILS`, `KSNB_TELEGRAM_CHAT_ID`.

## 10. Data migration D1 → Postgres

1. `wrangler d1 export avpg_db --remote --output dump.sql` (lấy dữ liệu prod).
2. Transform: tách schema (tạo lại bằng migration Postgres) khỏi `INSERT`; chỉnh literal kiểu dữ liệu nếu cần.
3. Import `INSERT` vào Postgres.
4. Verify đếm bản ghi từng bảng + smoke test vài phiếu/approval.

## 11. Open items / TODO

- [x] **Chốt Ingress** → **A (Cloudflare Tunnel)**, bot giữ webhook.
- [ ] **Tạo service account LDAP** `svc-ksnb-ldap` (domain user thường, password không hết hạn). Cung cấp: bind DN/UPN, password, **base DN**, **DC FQDN**, port 636, cert CA nội bộ (nếu LDAPS dùng CA riêng).
- [ ] DC FQDN thực tế: `____`
- [ ] Base DN search: `____`
- [ ] Tạo Cloudflare Tunnel + lấy **tunnel token** (đặt vào `.env` → `CLOUDFLARED_TOKEN`), trỏ public hostname `dexuat.avpgtech.com` → `http://app:8787`.

## 12. Phase plan (checklist)

- [x] **Phase 0 — Hạ tầng:** Ubuntu+Docker, Postgres cùng máy, ingress=A. *(còn: service account LDAP, FQDN/baseDN, tunnel token)*
- [x] **Phase 1 — Port runtime (XONG, verified):** `src/app.ts` (tách app dùng chung) + `src/server.ts` (`@hono/node-server` + node-cron) + `src/lib/node-env.ts`; Dockerfile + `docker-compose` (app + postgres + cloudflared) + `.env.example` + `.dockerignore`. Verify cục bộ: `tsx src/server.ts` phục vụ `/health` 200 + `/me` 200. Workers `src/index.ts` typecheck vẫn xanh (giữ tới cutover). *(DB/KV còn placeholder → throw có chủ đích tới Phase 2.)*

  **Cách chạy:** `cp .env.example .env` (điền `APP_BASE_URL`, `SESSION_SECRET`...) → `docker compose up -d --build`. Hoặc dev nhanh: `npm run start`.
- [~] **Phase 2 — Port DB (code XONG, verified cục bộ):** `db/postgres/0001_init.sql` (schema gộp + `iso_now()` + `ephemeral_kv`), `src/lib/pg.ts` (adapter D1→pg: prepare/bind/first/all/run/batch + PgKv), `src/lib/migrate-pg.ts` (runner + waitForDb), wire `node-env.ts`, server chạy migration lúc start + cron dọn KV. Typecheck Workers xanh; dịch SQL `?N→$N` + `datetime('now')→iso_now()` đã test. **Còn: migrate data thật từ D1 (xem dưới) + test runtime trên server.**

  **Deploy/test trên server:** đảm bảo `.env` có `DATABASE_URL` (khớp `POSTGRES_*`), `APP_BASE_URL`, `SESSION_SECRET` → `docker compose up -d --build` → `docker compose logs -f app` (thấy "migrations OK" + "listening") → `docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\dt'` (thấy ~13 bảng).

  **Data migration D1→Postgres (chưa làm — chờ chốt fresh vs migrate):** `wrangler d1 export avpg_db --remote --output dump.sql` → lọc INSERT (bỏ CREATE/sqlite_sequence) → nạp vào Postgres → `setval` lại sequence identity = max(id).
- [ ] **Phase 3 — Auth + tích hợp:** đổi redirect URI Entra, re-point/đổi Telegram, verify login + bot.
- [ ] **Phase 4 — LDAP realtime:** `account-sync` Graph→LDAP, poll 1–2', verify disable→chặn ~2'.
- [ ] **Phase 5 — Cutover:** chạy song song, đổi DNS, tắt Workers.

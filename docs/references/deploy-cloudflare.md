# Deploy lên Cloudflare — Production

> Hướng dẫn step-by-step deploy webapp lên `https://dexuat.avpgtech.com`. Anh chạy từng lệnh trên máy local (đã có Node + repo). Em đứng cạnh hỗ trợ.

**Tổng thời gian dự kiến:** ~30 phút (đa số là chờ Cloudflare propagate).

## Prerequisite

- ✅ Node.js 20+ + repo đã `npm install`
- ✅ Tài khoản Cloudflare có quyền **Edit** trên zone `avpgtech.com`
- ✅ Zone `avpgtech.com` đã ở Cloudflare DNS (nameserver trỏ về Cloudflare)
- ✅ Entra App đã setup xong (theo `setup-entra-app.md`), anh có sẵn `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`
- ✅ Shared mailbox `no-reply@anvietenergy.com` đã tạo + Application Access Policy đã restrict
- ✅ Telegram bot đã tạo qua @BotFather, anh có `TELEGRAM_BOT_TOKEN`
- ✅ KSNB group chat trên Telegram đã add bot làm member, anh có `KSNB_TELEGRAM_CHAT_ID` (vd `-1001234567890`)

---

## Bước 1 — Login wrangler vào Cloudflare

```bash
npx wrangler login
```

→ Mở browser, đăng nhập Cloudflare account, accept permission. Xong, terminal hiện `Successfully logged in`.

Verify:
```bash
npx wrangler whoami
```

---

## Bước 2 — Tạo D1 + KV cho production

```bash
# D1 database
npx wrangler d1 create avpg_db --env production
```

Output sẽ giống:
```
✅ Successfully created DB 'avpg_db' in region APAC
[[d1_databases]]
binding = "DB"
database_name = "avpg_db"
database_id = "abc123-..."
```

→ **Copy `database_id`**, mở `wrangler.toml`, paste vào section `[env.production]` (thay `REPLACE_AFTER_wrangler_d1_create`):

```toml
[[env.production.d1_databases]]
binding = "DB"
database_name = "avpg_db"
database_id = "abc123-..."   # ← paste vào đây
migrations_dir = "migrations"
```

Tương tự cho KV:
```bash
npx wrangler kv namespace create AVPG_KV --env production
```

Output:
```
🌀 Creating namespace ...
✨ Success!
{ binding = "KV", id = "xyz789..." }
```

→ Paste `id` vào `[[env.production.kv_namespaces]]`.

---

## Bước 3 — Apply migration lên D1 production

```bash
npm run db:apply:remote
```

⚠️ KHÔNG chạy migration `0002_seed_dev.sql` lên prod — nó là dev data.

Nếu seed dev đã có trong migrations, anh chỉ apply migration đầu:
```bash
npx wrangler d1 migrations apply avpg_db --remote --from 0001 --to 0001
```

Verify schema:
```bash
npx wrangler d1 execute avpg_db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

→ Phải thấy 10 bảng (departments, ..., audit_log).

---

## Bước 4 — Push secrets

Mỗi lệnh dưới đây sẽ prompt nhập giá trị (KHÔNG hiện trên màn hình):

```bash
npx wrangler secret put TENANT_ID --env production
npx wrangler secret put CLIENT_ID --env production
npx wrangler secret put CLIENT_SECRET --env production
npx wrangler secret put TELEGRAM_BOT_TOKEN --env production
npx wrangler secret put KSNB_TELEGRAM_CHAT_ID --env production
```

Riêng 2 secret sau sinh ngẫu nhiên:
```bash
# Session cookie signing — đổi mỗi khi rotate sẽ logout tất cả user
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET --env production

# Telegram webhook secret — chỉ dùng để verify request đến từ Telegram
openssl rand -hex 16 | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production
```

⚠️ **Note `TELEGRAM_WEBHOOK_SECRET` đã sinh** — anh phải lưu lại để dùng ở Bước 7. Cách lấy lại:
```bash
# Wrangler không cho đọc secret. Lưu lại lúc generate:
SECRET=$(openssl rand -hex 16)
echo "Webhook secret: $SECRET"
echo "$SECRET" | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env production
# Copy giá trị $SECRET in ra phía trên, lưu vào notes
```

Verify secrets list:
```bash
npx wrangler secret list --env production
```

→ Phải thấy 7 secrets (không hiện value, chỉ tên).

---

## Bước 5 — Insert seed data thật

Anh cần 3 set data:

### 5a. Departments

Chuẩn bị file `seed-prod-departments.sql`:
```sql
INSERT INTO departments (code, ad_name, full_name) VALUES
  ('KD', 'Kinh doanh', 'Phòng Kinh doanh'),
  ('NS', 'Nhân sự', 'Phòng Nhân sự'),
  ('KT', 'Kế toán', 'Phòng Kế toán'),
  ('KS', 'Kiểm soát nội bộ', 'Phòng Kiểm soát nội bộ');
  -- ... thêm các phòng khác
```

⚠️ Cột `ad_name` PHẢI khớp **chính xác** với giá trị trong AD/Entra (anh có thể check qua Graph: `https://graph.microsoft.com/v1.0/users/<email>?$select=department`).

```bash
npx wrangler d1 execute avpg_db --remote --file seed-prod-departments.sql
```

### 5b. Department managers

```sql
INSERT INTO department_managers (dept_code, user_email, user_name) VALUES
  ('KD', 'tp.kinhdoanh@anvietenergy.com', 'Nguyễn Văn A'),
  ('NS', 'tp.nhansu@anvietenergy.com',   'Trần Thị B'),
  ...
```

```bash
npx wrangler d1 execute avpg_db --remote --file seed-prod-managers.sql
```

### 5c. BOD member

```sql
INSERT INTO bod_members (user_email, user_name, routing_order) VALUES
  ('giamdoc@anvietenergy.com', 'Tổng Giám đốc XYZ', 1);
```

```bash
npx wrangler d1 execute avpg_db --remote --file seed-prod-bod.sql
```

---

## Bước 6 — Deploy Worker + bind domain

```bash
npm run deploy
# tương đương: npx wrangler deploy --env production
```

Wrangler sẽ:
1. Build + upload Worker
2. Tự tạo Custom Domain `dexuat.avpgtech.com` (do `custom_domain = true` trong wrangler.toml)
3. Cloudflare tự thêm DNS record AAAA `dexuat → 100::` (Workers magic)

Output cuối:
```
Published avpg-phieu-de-xuat-prod (X sec)
  https://dexuat.avpgtech.com (custom domain)
  https://avpg-phieu-de-xuat-prod.<account>.workers.dev
```

Verify:
```bash
curl https://dexuat.avpgtech.com/health
# → {"ok":true,"env":"production","time":"..."}
```

⚠️ Lần đầu DNS có thể mất 1-5 phút propagate. Nếu fail, kiểm:
```bash
dig dexuat.avpgtech.com
```

---

## Bước 7 — Setup Telegram webhook

Telegram cần biết URL Worker để forward update. Một lần duy nhất:

```bash
# Đổi <BOT_TOKEN> và <WEBHOOK_SECRET> bằng giá trị thật
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://dexuat.avpgtech.com/telegram/webhook/<WEBHOOK_SECRET>"
```

→ Phải trả `{"ok":true,"result":true,"description":"Webhook was set"}`.

Verify:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

→ Field `url` phải đúng URL trên + `pending_update_count` thấp.

Test: gửi `/start` cho bot → bot trả welcome message.

---

## Bước 8 — Update Entra App với prod redirect URI

Vào https://entra.microsoft.com → App đã tạo → **Authentication**:

1. Section **Web**, click **Add URI**
2. Thêm: `https://dexuat.avpgtech.com/auth/callback`
3. Save

(URI localhost cũ giữ lại để vẫn dev được.)

---

## Bước 9 — Test end-to-end

1. Mở https://dexuat.avpgtech.com → landing page hiện
2. Click "Đăng nhập M365" → redirect login.microsoftonline.com → login → quay về `/app`
3. Tạo phiếu mới → submit → kiểm `/admin/notify/list` (nếu anh chưa restrict admin, tạm để mở)
4. Sau 5 phút (cron) hoặc gọi `POST /admin/notify/run` manual: email nên về tới manager, telegram DM nếu manager đã link

---

## Bước 10 — Bật restriction admin (tuỳ chọn nhưng nên)

Hiện `/admin/*` chỉ require login bất kỳ. Anh nên restrict cho KSNB email.

→ Để Phase 2 hoặc em sẽ làm theo yêu cầu — Phase 1 tạm để mở để KSNB debug.

---

## Update sau khi deploy

Mỗi lần code đổi:
```bash
git pull             # nếu anh code trên máy khác hoặc qua CI
npm run deploy
```

Migration mới:
```bash
# Viết migration vào migrations/000X_xxx.sql
npm run db:apply:remote
```

Logs realtime:
```bash
npm run tail
```

---

## Rollback

Nếu deploy mới break:
```bash
# List deploy
npx wrangler deployments list --env production

# Rollback về version trước
npx wrangler rollback <deployment-id> --env production
```

---

## Troubleshooting

**1. `Custom domain failed: zone not found`**
→ Zone `avpgtech.com` chưa ở Cloudflare. Vào Cloudflare dashboard → Add Site → đổi nameserver tại registrar.

**2. `D1_ERROR: no such table: proposals`**
→ Quên apply migration. Chạy `npm run db:apply:remote`.

**3. Login M365 trả `AADSTS50011: redirect URL mismatch`**
→ Bước 8 chưa làm hoặc URI sai. Phải KHỚP CHÍNH XÁC `https://dexuat.avpgtech.com/auth/callback` (không trailing slash).

**4. Email không gửi, `notifications.list` thấy `failed` với error `Mail.Send permission denied`**
→ Application Access Policy đang restrict mailbox khác. Xem `setup-entra-app.md` Step 6.

**5. Telegram bot không phản hồi `/start`**
→ Webhook URL sai. Chạy lại Bước 7. Hoặc kiểm `getWebhookInfo` xem có `last_error_message` không.

**6. Cron không chạy**
→ Local dev (Miniflare) KHÔNG trigger cron tự động — phải `wrangler dev --test-scheduled`. Production thì OK, kiểm dashboard → Workers → Triggers → Cron.

---

## Tóm tắt checklist deploy lần đầu

- [ ] `wrangler login` xong
- [ ] Tạo D1 prod + paste `database_id` vào `wrangler.toml`
- [ ] Tạo KV prod + paste `id` vào `wrangler.toml`
- [ ] Apply migration `0001` lên prod (KHÔNG apply seed dev)
- [ ] Push 7 secrets
- [ ] Insert seed thật (departments, managers, bod)
- [ ] `npm run deploy` → custom domain `dexuat.avpgtech.com` xanh
- [ ] `curl /health` trả ok
- [ ] `setWebhook` cho Telegram bot
- [ ] Add redirect URI prod vào Entra App
- [ ] Login web thật test end-to-end
- [ ] Tạo phiếu thật + kiểm email + telegram đến đúng

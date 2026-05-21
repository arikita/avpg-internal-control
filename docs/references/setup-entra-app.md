# Microsoft Entra App Registration — Setup Guide

> Hướng dẫn tạo App Registration trong Entra ID (Azure AD) để webapp dùng cho OIDC login + gửi email qua Graph API. Anh làm 1 lần trong Azure portal (~15-20 phút). Xong, gửi em 3 giá trị: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`.

---

## Yêu cầu trước khi bắt đầu

- Tài khoản M365 có quyền **Global Administrator** hoặc **Application Administrator** trong Entra tenant của AVPG
- Quyền tạo shared mailbox trong Exchange admin center (hoặc nhờ IT admin)
- Truy cập https://entra.microsoft.com (hoặc https://portal.azure.com → Entra ID)

---

## Step 1 — Tạo App Registration

1. Vào https://entra.microsoft.com → sidebar trái: **Applications** → **App registrations**
2. Click **+ New registration**
3. Điền:
   - **Name:** `AVPG · Phiếu Đề Xuất`
   - **Supported account types:** chọn `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI:**
     - Platform: `Web`
     - URL: **`https://dexuat.avpgtech.com/auth/callback`**  ← URI production, dùng được ngay sau khi deploy
4. Click **Register**

→ Sau khi tạo, anh sẽ thấy trang **Overview** với:
- **Application (client) ID** ← ghi lại, đây là `CLIENT_ID`
- **Directory (tenant) ID** ← ghi lại, đây là `TENANT_ID`

---

## Step 2 — Cấu hình thêm Authentication settings

1. Sidebar trái của App: **Authentication**
2. Section **Implicit grant and hybrid flows**:
   - ✅ Tick `ID tokens (used for implicit and hybrid flows)`
   - ❌ KHÔNG tick Access tokens
3. **Allow public client flows:** giữ `No`
4. **Supported account types:** giữ `Accounts in this organizational directory only`
5. Click **Save** trên cùng

### (Tuỳ chọn) Thêm localhost cho dev local

Nếu sau này anh muốn code/test thử trên máy mình:
- Section **Web** → click **Add URI**
- Thêm: `http://localhost:8787/auth/callback`
- Save

Phase 1 anh deploy thẳng prod thì có thể skip phần này.

---

## Step 3 — Tạo Client Secret

1. Sidebar trái: **Certificates & secrets**
2. Tab **Client secrets** → click **+ New client secret**
3. Điền:
   - **Description:** `Worker production`
   - **Expires:** `24 months` (anh sẽ phải rotate sau 2 năm)
4. Click **Add**

⚠️ **QUAN TRỌNG:** Copy ngay cột **Value** (KHÔNG phải Secret ID). Giá trị này chỉ hiện 1 lần, đóng trang là mất. Đây là `CLIENT_SECRET`.

→ Sau bước này anh đã có đủ 3 giá trị: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`. Gửi em qua kênh bảo mật (KHÔNG paste vào git, KHÔNG share công khai).

---

## Step 4 — Cấu hình API Permissions

1. Sidebar trái: **API permissions**
2. Section đã có sẵn `User.Read` (delegated) từ Microsoft Graph → giữ nguyên

### 4a. Thêm permission để gửi email (Application)

3. Click **+ Add a permission** → chọn **Microsoft Graph**
4. Chọn **Application permissions** (không phải Delegated)
5. Search và tick:
   - `Mail.Send` *(cho Worker gửi email không cần user context)*
6. Click **Add permissions**

### 4b. (Tuỳ chọn) Thêm scopes Delegated khác

Phase 1 KHÔNG cần thêm `User.ReadBasic.All`, `email`, `profile`, `offline_access` —
code chỉ dùng `openid + profile + email + User.Read` (đã pre-included khi
register app). Nếu Phase 2 cần lookup user khác qua Graph từ phía user context
thì mới add `User.ReadBasic.All`.

### 4c. Grant admin consent

7. Trên trang API permissions, click nút **✓ Grant admin consent for [tenant_name]**
12. Confirm. Toàn bộ row sẽ chuyển sang trạng thái ✅ Granted (xanh).

⚠️ Nếu nút Grant bị disable, anh không có quyền Global Admin → nhờ admin của tenant grant giúp.

---

## Step 5 — Tạo shared mailbox `no-reply@anvietenergy.com`

> Bước này làm trong **Exchange admin center**, không phải Entra. Nếu shared mailbox đã có rồi thì skip.

1. Vào https://admin.exchange.microsoft.com → **Recipients** → **Mailboxes**
2. Click **+ Add a shared mailbox**
3. Điền:
   - **Display name:** `AVPG · Phiếu Đề Xuất - No Reply`
   - **Email address:** `no-reply@anvietenergy.com`
4. Click **Create**

(Anh có thể skip phần "Add members" — không cần ai access mailbox này, Worker gửi qua Graph application permission.)

---

## Step 6 — Restrict App chỉ được gửi từ shared mailbox này

> Mặc định `Mail.Send` Application permission cho phép app gửi mail từ **bất kỳ mailbox nào** trong tenant. Restrict lại cho an toàn.

Bước này dùng PowerShell. Anh chạy 1 lần trên máy có Exchange Online PowerShell module:

```powershell
# 1. Install module (chỉ lần đầu)
Install-Module -Name ExchangeOnlineManagement -Force

# 2. Connect
Connect-ExchangeOnline -UserPrincipalName admin@anvietenergy.com

# 3. Tạo mail-enabled security group chứa shared mailbox
New-DistributionGroup -Name "AVPG-AppSenders" `
    -Alias "avpg-app-senders" `
    -Type "Security" `
    -Members "no-reply@anvietenergy.com" `
    -PrimarySmtpAddress "avpg-app-senders@anvietenergy.com"

# 4. Tạo Application Access Policy
New-ApplicationAccessPolicy `
    -AppId "<CLIENT_ID của App Registration>" `
    -PolicyScopeGroupId "avpg-app-senders@anvietenergy.com" `
    -AccessRight RestrictAccess `
    -Description "Giới hạn AVPG webapp chỉ gửi từ no-reply mailbox"

# 5. Verify (test xem app gửi từ mailbox khác có bị block không)
Test-ApplicationAccessPolicy `
    -Identity "no-reply@anvietenergy.com" `
    -AppId "<CLIENT_ID>"
# → kết quả phải là: AccessCheckResult = Granted

Test-ApplicationAccessPolicy `
    -Identity "admin@anvietenergy.com" `
    -AppId "<CLIENT_ID>"
# → kết quả phải là: AccessCheckResult = Denied (đúng — bị restrict)
```

→ Sau bước này, dù `CLIENT_SECRET` có leak, attacker cũng chỉ gửi được từ `no-reply@anvietenergy.com`, không gửi giả từ CEO/CFO được.

---

## Step 7 — (Tuỳ chọn) Branding cho login page

Section **Branding & properties** trong App:
- **Logo:** upload logo AVPG (PNG vuông ≤ 245 KB)
- **Home page URL:** `https://dexuat.avpgtech.com`
- **Privacy statement / Terms:** để trống Phase 1

Branding hiện trên trang `login.microsoftonline.com` khi user redirect.

---

## Tổng kết — anh gửi em những gì

Sau khi xong, em cần 3 giá trị sau (paste vào chat private hoặc file `.env.local` em hướng dẫn cách push secret):

```
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Và confirm:
- ✅ Shared mailbox `no-reply@anvietenergy.com` đã tạo
- ✅ Application Access Policy đã apply (restrict)
- ✅ Admin consent đã grant cho 2 permission (User.Read delegated, Mail.Send application)

---

## Troubleshooting thường gặp

**1. Login lỗi `AADSTS50011: The reply URL specified...does not match`**
→ Redirect URI trong code không khớp với URI đã đăng ký trong App. Check chính xác từng ký tự, kể cả trailing `/`.

**2. Graph trả `Insufficient privileges to complete the operation`**
→ Chưa grant admin consent. Quay lại Step 4c.

**3. SendMail trả `ErrorAccessDenied`**
→ Application Access Policy đang restrict mailbox khác, chứ không phải `no-reply@anvietenergy.com`. Chạy `Test-ApplicationAccessPolicy` để kiểm.

**4. `AADSTS700016: Application not found in the directory`**
→ `CLIENT_ID` sai hoặc `TENANT_ID` sai (vd nhầm tenant ID của tenant khác).

**5. Refresh token expire sau X ngày**
→ Mặc định 90 ngày inactivity. Nếu user không vào web 90 ngày thì cần login lại — bình thường.

---

## Verify nhanh (sau khi xong)

Anh có thể verify App đã setup đúng bằng cách query token qua curl:

```bash
# Lấy access token với application permission
curl -X POST "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -d "client_id=<CLIENT_ID>" \
  -d "scope=https://graph.microsoft.com/.default" \
  -d "client_secret=<CLIENT_SECRET>" \
  -d "grant_type=client_credentials"

# Response phải có "access_token": "eyJ0eXAi..."
```

Nếu trả về `access_token` → setup OK. Em sẽ dùng token này ở bước A để verify gửi email được.

---

## Phụ lục — Permissions reference

| Permission | Loại | Dùng cho |
|---|---|---|
| `User.Read` | Delegated | Login OIDC, đọc info user đang login |
| `User.ReadBasic.All` | Delegated | Lookup name/email/dept của Manager khi proposer submit |
| `email`, `profile`, `offline_access` | Delegated | OIDC scopes chuẩn |
| `Mail.Send` | Application | Worker gửi email qua Graph (không cần user context) |

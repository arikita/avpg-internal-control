# AVPG — Hệ thống Kiểm soát Nội bộ (KSNB)

Webapp tự động hóa quy trình làm việc của phòng Kiểm soát Nội bộ, tích hợp Telegram.

## Phase 1 — Phiếu đề xuất

Quy trình: **Người đề xuất → Quản lý duyệt → BOD duyệt → KSNB hoàn thiện hồ sơ**

Người dùng có thể tạo phiếu qua web hoặc Telegram nhóm; thông báo qua email (M365) + Telegram inline button.

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
docs/                  # Tài liệu nghiệp vụ (do KSNB upload)
├── templates/         # Template phiếu đề xuất (Word/Excel)
├── users/             # Danh sách Manager / BOD / KSNB và luồng duyệt
└── references/        # Workflow diagrams, business rules, tài liệu khác

# Sẽ thêm sau khi bắt đầu code:
src/                   # Source code (Hono backend + frontend)
migrations/            # D1 SQL migrations
wrangler.toml          # Cloudflare config
```

## Workflow upload tài liệu

1. Upload file qua **GitHub web UI** (drag-drop vào đúng folder trong `docs/`)
2. Đầu session tiếp theo, Claude tự `git pull` để lấy file mới
3. Claude đọc file và xử lý

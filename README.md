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

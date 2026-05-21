-- ============================================================
-- Add signature column cho users để in phiếu có chữ ký
-- ============================================================
-- User upload PNG/JPG 1 lần qua /api/me/signature, lưu base64 data URL
-- (`data:image/png;base64,...`). Cap 200KB → ~265KB sau base64 — chấp nhận
-- được cho SQLite row. Phase 1 không cần R2 storage riêng.

ALTER TABLE users ADD COLUMN signature_data_url TEXT;

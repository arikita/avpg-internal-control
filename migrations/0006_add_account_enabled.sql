-- 0006: Đồng bộ trạng thái account từ Entra (accountEnabled) xuống app.
-- Luồng: disable account trên AD/DC → AD Connect sync lên Entra (~30')
--        → cron account-sync poll Graph (mỗi 15') → set account_enabled = 0.
-- Dùng để chặn CẢ web (sessionMiddleware) LẪN Telegram (bot handlers).
-- Login thành công = account đang enabled (Entra chặn account disabled),
-- nên lúc login app set account_enabled = 1 → re-enable phản ánh tức thì.

ALTER TABLE users ADD COLUMN account_enabled INTEGER NOT NULL DEFAULT 1;  -- 1=enabled, 0=disabled
ALTER TABLE users ADD COLUMN account_checked_at TEXT;                     -- lần cuối sync từ Graph (ISO), null=chưa sync

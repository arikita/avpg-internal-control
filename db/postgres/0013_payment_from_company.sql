-- DNTT: thêm trường "Đi từ công ty" (đơn vị xuất tiền) — khớp nhãn đã có sẵn trên bản in
-- (payment-print.ts). Nhập tay, tuỳ chọn.
ALTER TABLE payment_request ADD COLUMN IF NOT EXISTS from_company text;

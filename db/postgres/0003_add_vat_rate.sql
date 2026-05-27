-- VAT nhập tay cho phiếu mua hàng: lưu % thuế suất do user chọn (0/8/10).
-- Mặc định 10 để khớp dữ liệu cũ (trước đây fix cứng 10%). General không dùng (vat_amount null).
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS vat_rate smallint NOT NULL DEFAULT 10;

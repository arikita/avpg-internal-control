-- Phase 3: lưu HÓA ĐƠN GỐC (PDF/XML) đính kèm trong mail TT78.
-- Trước đây ingest chỉ parse XML rồi bỏ file → HĐ nguồn XML không có gì để "xem HĐ gốc"
-- (invoice_url trống). Nay lưu file gốc vào FILES (filesystem volume) và tham chiếu ở đây;
-- ưu tiên PDF (bản đọc được), fallback XML. Phục vụ inline qua /invoices/:id/original.

ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS source_doc_key  text;  -- storage_key (UUID) trong FILES
ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS source_doc_name text;  -- tên file gốc (hiển thị)
ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS source_doc_mime text;  -- application/pdf | application/xml

-- Phase 3: bổ sung CÔNG NỢ (NGÀY) — số ngày được nợ theo thoả thuận với NCC.
-- Sổ Excel "THEO DÕI CÔNG NỢ NCC" (sheet TONGHOP) có cột này (K) để tính hạn thanh
-- toán = ngày HĐ + số ngày nợ; quá hạn khi (hôm nay − ngày HĐ) > số ngày nợ.

ALTER TABLE supplier_invoice ADD COLUMN IF NOT EXISTS credit_term_days integer;

-- Mặc định số ngày nợ theo NCC — auto-fill cho HĐ sau khi đã set 1 lần.
ALTER TABLE supplier_alias ADD COLUMN IF NOT EXISTS default_credit_term integer;

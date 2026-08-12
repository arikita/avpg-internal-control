-- DNTT: thêm "Chi nhánh" ngân hàng của tài khoản thụ hưởng.
-- payment_request.bank_branch: chi nhánh nhập trên phiếu (tuỳ chọn, NULL nếu bỏ trống).
-- payment_beneficiary.bank_branch: lưu kèm tài khoản đã lưu để lần sau tự điền (mặc định '').
ALTER TABLE payment_request     ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE payment_beneficiary ADD COLUMN IF NOT EXISTS bank_branch text NOT NULL DEFAULT '';

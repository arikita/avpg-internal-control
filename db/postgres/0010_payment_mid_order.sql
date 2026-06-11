-- DNTT: sau khi Trưởng bộ phận ký, KSNB và Kế toán ký theo thứ tự tuỳ thực tế
-- (bên nào nhận hồ sơ trước thì ký trước, xong chuyển bên còn lại), rồi mới đến BOD.
-- mid_order ghi bên ký TRƯỚC ở cặp chặng 2-3: 'ksnb' | 'acct'; NULL = chưa tới/chưa chọn.
ALTER TABLE payment_request ADD COLUMN IF NOT EXISTS mid_order text;

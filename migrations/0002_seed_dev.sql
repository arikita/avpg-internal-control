-- ============================================================
-- Dev seed — chỉ chạy LOCAL khi cần test nhanh.
-- KHÔNG apply lên --remote production cho tới khi anh đã có data thật.
-- ============================================================

INSERT OR IGNORE INTO departments (code, ad_name, full_name) VALUES
  ('KD', 'Kinh doanh',  'Phòng Kinh doanh'),
  ('NS', 'Nhân sự',     'Phòng Nhân sự'),
  ('KT', 'Kế toán',     'Phòng Kế toán'),
  ('KS', 'Kiểm soát nội bộ', 'Phòng Kiểm soát nội bộ');

INSERT OR IGNORE INTO department_managers (dept_code, user_email, user_name) VALUES
  ('KD', 'dev.manager.kd@anvietenergy.com', 'TP Kinh doanh (dev)'),
  ('NS', 'dev.manager.ns@anvietenergy.com', 'TP Nhân sự (dev)'),
  ('KT', 'dev.manager.kt@anvietenergy.com', 'TP Kế toán (dev)'),
  ('KS', 'dev.manager.ks@anvietenergy.com', 'TP KSNB (dev)');

INSERT OR IGNORE INTO bod_members (user_email, user_name, routing_order) VALUES
  ('dev.bod@anvietenergy.com', 'BGĐ (dev)', 1);

-- Mock user mặc định trong .dev.vars — pre-insert để khỏi cần đăng nhập thật khi test API.
INSERT OR IGNORE INTO users (id, email, display_name, ad_department, dept_code) VALUES
  ('dev-mock-user-id', 'dev.user@anvietenergy.com', 'Dev User', 'Kinh doanh', 'KD');

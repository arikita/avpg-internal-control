-- ============================================================
-- P2.1 — Phiếu Đề Xuất Mua Hàng (PR)
-- Mua hàng = loại phiếu đặc biệt: tích hợp vào table proposals.
-- Workflow: draft → submitted → manager_approved → (en_approved)? → ic_approved → completed
-- Cùng pattern rebuild table như 0004 vì SQLite không sửa CHECK constraint.
-- ============================================================

-- 1. Rebuild proposals với proposal_type + status mới + cột PR-specific
CREATE TABLE proposals_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,
  proposal_type     TEXT NOT NULL DEFAULT 'general'
                        CHECK(proposal_type IN ('general','purchase')),
  status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN (
                          'draft','submitted','manager_approved',
                          'en_approved','ic_approved',
                          'bod_approved','completed','rejected','cancelled'
                        )),
  proposer_user_id  TEXT NOT NULL REFERENCES users(id),
  proposer_name     TEXT NOT NULL,
  proposer_title    TEXT,
  proposer_dept     TEXT NOT NULL REFERENCES departments(code),

  -- Nội dung chung
  title             TEXT NOT NULL,
  reason            TEXT NOT NULL,
  explanation       TEXT,
  required_time     TEXT,                         -- 0005: optional (Phase 1.3 đã bỏ required)

  -- Routing snapshot cho cả 2 loại
  manager_email     TEXT,
  manager_name      TEXT,
  bod_email         TEXT,
  bod_name          TEXT,

  -- PR-only: routing EN + IC (NULL với general)
  engineering_required INTEGER NOT NULL DEFAULT 0, -- 1 = cần EN review
  engineering_email    TEXT,
  engineering_name     TEXT,
  engineering_acted_at TEXT,
  ic_email             TEXT,
  ic_name              TEXT,
  ic_acted_at          TEXT,

  -- PR-only: thông tin mua hàng
  delivery_date        TEXT,                      -- 'DD/MM/YYYY' optional
  suggested_vendor_1   TEXT,                      -- NCC user gợi ý (P2.1 text-only)
  suggested_vendor_2   TEXT,
  suggested_vendor_3   TEXT,
  subtotal             INTEGER,                   -- VND, snapshot khi submit
  vat_amount           INTEGER,                   -- = subtotal * 10%
  total_amount         INTEGER,                   -- = subtotal + vat

  rejected_reason   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at      TEXT,
  manager_acted_at  TEXT,
  bod_acted_at      TEXT,
  completed_at      TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy phiếu cũ: explicit cột (proposals cũ không có proposal_type)
INSERT INTO proposals_new (
  id, code, proposal_type, status,
  proposer_user_id, proposer_name, proposer_title, proposer_dept,
  title, reason, explanation, required_time,
  manager_email, manager_name, bod_email, bod_name,
  rejected_reason,
  created_at, submitted_at, manager_acted_at, bod_acted_at, completed_at, updated_at
)
SELECT
  id, code, 'general', status,
  proposer_user_id, proposer_name, proposer_title, proposer_dept,
  title, reason, explanation, required_time,
  manager_email, manager_name, bod_email, bod_name,
  rejected_reason,
  created_at, submitted_at, manager_acted_at, bod_acted_at, completed_at, updated_at
FROM proposals;

DROP TABLE proposals;
ALTER TABLE proposals_new RENAME TO proposals;

CREATE INDEX idx_proposals_status         ON proposals(status);
CREATE INDEX idx_proposals_proposer       ON proposals(proposer_user_id, status);
CREATE INDEX idx_proposals_manager_inbox  ON proposals(manager_email, status);
CREATE INDEX idx_proposals_bod_inbox      ON proposals(bod_email, status);
CREATE INDEX idx_proposals_en_inbox       ON proposals(engineering_email, status);
CREATE INDEX idx_proposals_ic_inbox       ON proposals(ic_email, status);
CREATE INDEX idx_proposals_code           ON proposals(code);
CREATE INDEX idx_proposals_type           ON proposals(proposal_type, status);

-- 2. Mở rộng proposal_items với cột PR-specific (NULL với general)
ALTER TABLE proposal_items ADD COLUMN item_name    TEXT;     -- 'Tên hàng' (PR)
ALTER TABLE proposal_items ADD COLUMN spec         TEXT;     -- 'Đặc điểm kỹ thuật'
ALTER TABLE proposal_items ADD COLUMN unit         TEXT;     -- 'Đơn vị tính' (cái/bộ/kg...)
ALTER TABLE proposal_items ADD COLUMN qty_stock    INTEGER;  -- SL tồn
ALTER TABLE proposal_items ADD COLUMN qty_buy      INTEGER;  -- SL mua
ALTER TABLE proposal_items ADD COLUMN unit_price   INTEGER;  -- Đơn giá (VND)
ALTER TABLE proposal_items ADD COLUMN line_total   INTEGER;  -- Thành tiền (VND)
ALTER TABLE proposal_items ADD COLUMN purpose      TEXT;     -- Mục đích sử dụng

-- 3. Rebuild approvals với step mới ('engineering', 'ic')
CREATE TABLE approvals_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id  INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  step         TEXT NOT NULL CHECK(step IN ('manager','bod','ksnb','engineering','ic')),
  actor_email  TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  action       TEXT NOT NULL CHECK(action IN ('approve','reject')),
  comment      TEXT,
  source       TEXT NOT NULL DEFAULT 'web'
                  CHECK(source IN ('web','telegram','email')),
  acted_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO approvals_new SELECT * FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;
CREATE INDEX idx_approvals_proposal ON approvals(proposal_id, acted_at);

-- 4. Bảng mới: engineering_members + ic_members (mirror bod_members)
CREATE TABLE engineering_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email    TEXT NOT NULL UNIQUE,
  user_name     TEXT NOT NULL,
  routing_order INTEGER NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ic_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email    TEXT NOT NULL UNIQUE,
  user_name     TEXT NOT NULL,
  routing_order INTEGER NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Seed dummy EN + IC để P2.1 chạy được. Anh thay bằng email thật sau qua
-- wrangler d1 execute UPDATE.
INSERT OR IGNORE INTO engineering_members (user_email, user_name, routing_order) VALUES
  ('dev.engineering@anvietenergy.com', 'EN Kỹ thuật (dev — thay sau)', 1);

INSERT OR IGNORE INTO ic_members (user_email, user_name, routing_order) VALUES
  ('dev.ic@anvietenergy.com', 'IC KSNB (dev — thay sau)', 1);

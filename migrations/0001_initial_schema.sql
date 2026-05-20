-- ============================================================
-- AVPG KSNB Webapp — Phase 1 schema
-- D1 / SQLite. Timestamps là ISO8601 UTC (text); convert UTC+7 ở app layer.
-- ============================================================

-- ------------------------------------------------------------
-- 1. departments — KSNB maintain, map AD dept → mã 2 chữ
-- ------------------------------------------------------------
CREATE TABLE departments (
  code        TEXT PRIMARY KEY,                -- 'KD', 'NS', 'KT'
  ad_name     TEXT NOT NULL UNIQUE,            -- giá trị raw từ AD: 'Kinh doanh'
  full_name   TEXT NOT NULL,                   -- 'Phòng Kinh doanh'
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 2. department_managers — Manager của từng phòng (KSNB cung cấp)
--    Phase 1: 1 phòng → 1 Manager. Schema cho phép nhiều khi cần.
-- ------------------------------------------------------------
CREATE TABLE department_managers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dept_code   TEXT NOT NULL REFERENCES departments(code),
  user_email  TEXT NOT NULL,                   -- UPN/email M365
  user_name   TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_dept_managers_dept ON department_managers(dept_code, is_active);

-- ------------------------------------------------------------
-- 3. bod_members — Phase 1 chỉ 1 row. Sau này thêm BOD khác.
--    routing_order để dành cho round-robin tương lai.
-- ------------------------------------------------------------
CREATE TABLE bod_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email    TEXT NOT NULL UNIQUE,
  user_name     TEXT NOT NULL,
  routing_order INTEGER NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 4. users — cache thông tin từ Graph (NOT source of truth)
--    Upsert khi user login. Source of truth vẫn là Entra ID.
-- ------------------------------------------------------------
CREATE TABLE users (
  id                TEXT PRIMARY KEY,          -- Entra GUID (Graph user.id)
  email             TEXT NOT NULL UNIQUE,      -- UPN
  display_name      TEXT NOT NULL,
  job_title         TEXT,
  ad_department     TEXT,                      -- raw từ AD; có thể null
  dept_code         TEXT REFERENCES departments(code),
  telegram_chat_id  TEXT UNIQUE,               -- để bot DM (link sau khi /start)
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_dept ON users(dept_code);

-- ------------------------------------------------------------
-- 5. proposal_counters — sinh counter atomic cho mã phiếu
--    Format mã: {dept_code}{counter:02d}-{DDMMYYYY}
--    Reset daily theo giờ VN (UTC+7), tính ở app layer.
-- ------------------------------------------------------------
CREATE TABLE proposal_counters (
  dept_code   TEXT NOT NULL,
  date_key    TEXT NOT NULL,                   -- 'DDMMYYYY' theo VN time
  counter     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dept_code, date_key)
);
-- Atomic increment idiom:
--   INSERT INTO proposal_counters VALUES (?, ?, 1)
--     ON CONFLICT(dept_code, date_key) DO UPDATE SET counter = counter + 1
--     RETURNING counter;

-- ------------------------------------------------------------
-- 6. proposals — phiếu chính. Snapshot proposer info tại thời điểm submit.
-- ------------------------------------------------------------
CREATE TABLE proposals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,               -- 'KD01-20052026'; NULL khi draft
  status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN (
                          'draft','submitted','manager_approved',
                          'bod_approved','completed','rejected'
                        )),

  -- Snapshot người đề nghị (immutable sau submit)
  proposer_user_id  TEXT NOT NULL REFERENCES users(id),
  proposer_name     TEXT NOT NULL,
  proposer_title    TEXT,
  proposer_dept     TEXT NOT NULL REFERENCES departments(code),

  -- Nội dung phiếu
  title             TEXT NOT NULL,             -- 'Nội dung đề xuất'
  reason            TEXT NOT NULL,             -- 'Lý do đề nghị'
  explanation       TEXT,                      -- 'Diễn giải' (optional)
  required_time     TEXT NOT NULL,             -- 'Thời gian cần thực hiện' (free text)

  -- Routing snapshot — chốt khi submit, không đổi giữa chừng
  manager_email     TEXT,
  manager_name      TEXT,
  bod_email         TEXT,
  bod_name          TEXT,

  -- Lý do reject (nếu có) — copy từ approvals row gần nhất cho query nhanh
  rejected_reason   TEXT,

  -- Timestamps (UTC)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at      TEXT,
  manager_acted_at  TEXT,
  bod_acted_at      TEXT,
  completed_at      TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_proposals_status         ON proposals(status);
CREATE INDEX idx_proposals_proposer       ON proposals(proposer_user_id, status);
CREATE INDEX idx_proposals_manager_inbox  ON proposals(manager_email, status);
CREATE INDEX idx_proposals_bod_inbox      ON proposals(bod_email, status);
CREATE INDEX idx_proposals_code           ON proposals(code);

-- ------------------------------------------------------------
-- 7. proposal_items — bảng STT/Nội dung/Ghi chú động
-- ------------------------------------------------------------
CREATE TABLE proposal_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id  INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,               -- 1, 2, 3, ... (hiển thị 01, 02, 03)
  content      TEXT NOT NULL,
  note         TEXT
);
CREATE UNIQUE INDEX idx_items_proposal_seq ON proposal_items(proposal_id, seq);

-- ------------------------------------------------------------
-- 8. approvals — mỗi action duyệt/từ chối = 1 row.
--    Audit-friendly, không update, chỉ insert.
-- ------------------------------------------------------------
CREATE TABLE approvals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id  INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  step         TEXT NOT NULL CHECK(step IN ('manager','bod','ksnb')),
  actor_email  TEXT NOT NULL,
  actor_name   TEXT NOT NULL,                  -- snapshot
  action       TEXT NOT NULL CHECK(action IN ('approve','reject')),
  comment      TEXT,                           -- ý kiến / lý do từ chối
  source       TEXT NOT NULL DEFAULT 'web'
                  CHECK(source IN ('web','telegram','email')),
  acted_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_approvals_proposal ON approvals(proposal_id, acted_at);

-- ------------------------------------------------------------
-- 9. notifications — log email/telegram đã gửi.
--    Mục đích: idempotency (tránh gửi double) + retry pending + audit.
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id       INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK(channel IN ('email','telegram')),
  event             TEXT NOT NULL,             -- 'submitted','approved','rejected','completed'
  recipient         TEXT NOT NULL,             -- email hoặc telegram_chat_id
  status            TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','sent','failed')),
  provider_msg_id   TEXT,                      -- Graph messageId / Telegram message_id
  error             TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at           TEXT
);
CREATE INDEX idx_notif_proposal ON notifications(proposal_id);
CREATE INDEX idx_notif_pending  ON notifications(status) WHERE status = 'pending';

-- ------------------------------------------------------------
-- 10. audit_log — trail mọi state change quan trọng (compliance)
-- ------------------------------------------------------------
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,                  -- 'proposal','department','bod_members',...
  entity_id    TEXT NOT NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,                  -- 'create','update','delete','status_change'
  old_value    TEXT,                           -- JSON
  new_value    TEXT,                           -- JSON
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at);

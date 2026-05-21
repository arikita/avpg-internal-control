-- ============================================================
-- Allow status='cancelled' cho proposer tự huỷ phiếu trước khi có phê duyệt.
-- SQLite không sửa được CHECK constraint trực tiếp → rebuild table.
-- Foreign keys của proposal_items/approvals/notifications trỏ tới proposals(id):
-- DROP TABLE không trigger ON DELETE CASCADE (chỉ DELETE row mới cascade),
-- nên rows ở các bảng con vẫn an toàn.
-- ============================================================

CREATE TABLE proposals_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT UNIQUE,
  status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN (
                          'draft','submitted','manager_approved',
                          'bod_approved','completed','rejected','cancelled'
                        )),
  proposer_user_id  TEXT NOT NULL REFERENCES users(id),
  proposer_name     TEXT NOT NULL,
  proposer_title    TEXT,
  proposer_dept     TEXT NOT NULL REFERENCES departments(code),
  title             TEXT NOT NULL,
  reason            TEXT NOT NULL,
  explanation       TEXT,
  required_time     TEXT NOT NULL,
  manager_email     TEXT,
  manager_name      TEXT,
  bod_email         TEXT,
  bod_name          TEXT,
  rejected_reason   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at      TEXT,
  manager_acted_at  TEXT,
  bod_acted_at      TEXT,
  completed_at      TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO proposals_new SELECT * FROM proposals;

DROP TABLE proposals;
ALTER TABLE proposals_new RENAME TO proposals;

CREATE INDEX idx_proposals_status         ON proposals(status);
CREATE INDEX idx_proposals_proposer       ON proposals(proposer_user_id, status);
CREATE INDEX idx_proposals_manager_inbox  ON proposals(manager_email, status);
CREATE INDEX idx_proposals_bod_inbox      ON proposals(bod_email, status);
CREATE INDEX idx_proposals_code           ON proposals(code);

// Adapter PostgreSQL mô phỏng API D1 (Cloudflare) để code routes/lib dùng chung,
// gần như không phải sửa query. Chỉ chạy ở runtime Node (không build trong Workers tsconfig).
//
// Dịch SQL D1/SQLite → Postgres:
//   - datetime('now')  → iso_now()         (hàm định nghĩa trong db/postgres/0001_init.sql)
//   - placeholder ?N   → $N                (Postgres dùng $1,$2,...)
// .run() trên INSERT tự thêm "RETURNING id" để lấy meta.last_row_id (như D1);
// bảng không có cột id (vd proposal_counters) sẽ fallback chạy không RETURNING.

import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10 });
}

function translate(sql: string): string {
  return sql
    .replace(/datetime\('now'\)/g, 'iso_now()')
    .replace(/\?(\d+)/g, (_m, n: string) => `$${n}`);
}

const isInsert = (sql: string): boolean => /^\s*insert\s/i.test(sql);
const hasReturning = (sql: string): boolean => /\breturning\b/i.test(sql);

type RunMeta = { last_row_id: number | undefined; changes: number; rows_written: number };
type RunResult = { success: true; meta: RunMeta };
type BatchResult = { success: true; results: unknown[]; meta: RunMeta };

class PgStatement {
  params: unknown[] = [];
  constructor(
    private pool: Pool,
    public sql: string,
  ) {}

  bind(...args: unknown[]): this {
    this.params = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const r = await this.pool.query(this.sql, this.params);
    return (r.rows[0] as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const r = await this.pool.query(this.sql, this.params);
    return { results: r.rows as T[] };
  }

  async run(): Promise<RunResult> {
    const augmented = isInsert(this.sql) && !hasReturning(this.sql);
    const q = augmented ? `${this.sql} RETURNING id` : this.sql;
    let r;
    try {
      r = await this.pool.query(q, this.params);
    } catch (e) {
      // Bảng không có cột id (vd proposal_counters) → chạy lại không RETURNING.
      if (augmented && /column "id" does not exist/i.test((e as Error).message)) {
        r = await this.pool.query(this.sql, this.params);
      } else throw e;
    }
    return { success: true, meta: metaOf(r) };
  }
}

function metaOf(r: { rows: unknown[]; rowCount: number | null }): RunMeta {
  const last = r.rows.length ? (r.rows[r.rows.length - 1] as { id?: number }).id : undefined;
  const changes = r.rowCount ?? 0;
  return { last_row_id: last, changes, rows_written: changes };
}

export class PgDb {
  constructor(private pool: Pool) {}

  prepare(sql: string): PgStatement {
    return new PgStatement(this.pool, translate(sql));
  }

  // Chạy nhiều statement trong 1 transaction (như D1.batch).
  // KHÔNG tự thêm "RETURNING id": trong transaction, lỗi (vd bảng procurement không có
  // cột id) sẽ abort cả transaction nên không retry được. Không caller nào của batch dùng
  // last_row_id, nên chạy nguyên câu là đủ.
  async batch(stmts: PgStatement[]): Promise<BatchResult[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out: BatchResult[] = [];
      for (const st of stmts) {
        const r = await client.query(st.sql, st.params);
        out.push({ success: true, results: r.rows, meta: metaOf(r) });
      }
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

// ===== KV → bảng ephemeral_kv =====
const ISO_NOW_SQL = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export class PgKv {
  constructor(private pool: Pool) {}

  async get(key: string): Promise<string | null> {
    const r = await this.pool.query<{ value: string }>(
      `SELECT value FROM ephemeral_kv
        WHERE key = $1 AND (expires_at IS NULL OR expires_at > ${ISO_NOW_SQL})`,
      [key],
    );
    return r.rows[0]?.value ?? null;
  }

  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    const expires = opts?.expirationTtl
      ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString()
      : null;
    await this.pool.query(
      `INSERT INTO ephemeral_kv (key, value, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, value, expires],
    );
  }

  async delete(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM ephemeral_kv WHERE key = $1`, [key]);
  }

  // Dọn key hết hạn (gọi định kỳ qua cron).
  async cleanup(): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM ephemeral_kv WHERE expires_at IS NOT NULL AND expires_at < ${ISO_NOW_SQL}`,
    );
    return r.rowCount ?? 0;
  }
}

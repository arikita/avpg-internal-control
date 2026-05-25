// Migration runner Postgres — áp các file db/postgres/*.sql theo thứ tự tên,
// track trong bảng schema_migrations. Chạy lúc server khởi động (idempotent).
// Chỉ runtime Node (không build trong Workers tsconfig).

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'postgres');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chờ Postgres sẵn sàng (container có thể start chậm hơn app dù đã depends_on healthy).
async function waitForDb(pool: Pool, attempts = 20): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      lastErr = e;
      console.log(`[migrate-pg] chờ Postgres... (${i + 1}/${attempts}): ${(e as Error).message}`);
      await sleep(1500);
    }
  }
  throw new Error(`[migrate-pg] không kết nối được Postgres: ${(lastErr as Error)?.message}`);
}

export async function runMigrations(pool: Pool): Promise<void> {
  await waitForDb(pool);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(MIG_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const appliedRes = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIG_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate-pg] applied ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`[migrate-pg] lỗi áp ${file}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
}

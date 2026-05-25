// Upsert users table từ Graph /me. Map AD department → dept_code.

import type { Bindings } from '../types';
import type { GraphMe } from './entra';

export type UserRow = {
  id: string;
  email: string;
  display_name: string;
  job_title: string | null;
  ad_department: string | null;
  dept_code: string | null;
  telegram_chat_id: string | null;
  account_enabled: number;
};

// Lookup dept_code từ AD department name. Trả null nếu chưa map.
async function lookupDeptCode(env: Bindings, adName: string | null): Promise<string | null> {
  if (!adName) return null;
  const row = await env.DB.prepare(
    `SELECT code FROM departments WHERE ad_name = ?1 AND is_active = 1 LIMIT 1`,
  )
    .bind(adName)
    .first<{ code: string }>();
  return row?.code ?? null;
}

export async function upsertUserFromGraph(env: Bindings, me: GraphMe): Promise<UserRow> {
  const email = me.userPrincipalName.toLowerCase();
  const deptCode = await lookupDeptCode(env, me.department ?? null);

  // UPSERT: cập nhật snapshot Graph, dept_code, last_seen.
  // account_enabled = 1: login thành công ⇒ Entra cho phép ⇒ account đang enabled.
  // Đảm bảo re-enable (sau khi từng bị disable) phản ánh tức thì ngay lần login lại.
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, job_title, ad_department, dept_code, account_enabled, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       job_title = excluded.job_title,
       ad_department = excluded.ad_department,
       dept_code = excluded.dept_code,
       account_enabled = 1,
       last_seen_at = datetime('now')`,
  )
    .bind(me.id, email, me.displayName, me.jobTitle ?? null, me.department ?? null, deptCode)
    .run();

  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`)
    .bind(me.id)
    .first<UserRow>();
  if (!row) throw new Error('User upsert failed');
  return row;
}

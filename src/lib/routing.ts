// Lookup Manager phòng + BOD active. Phase 1: 1 phòng 1 manager, 1 BOD.

import type { Bindings } from '../types';
import { unprocessable } from './errors';

export type Approver = { email: string; name: string };

export async function getDeptManager(env: Bindings, deptCode: string): Promise<Approver> {
  const row = await env.DB.prepare(
    `SELECT user_email AS email, user_name AS name
       FROM department_managers
      WHERE dept_code = ?1 AND is_active = 1
      ORDER BY id ASC LIMIT 1`,
  )
    .bind(deptCode)
    .first<Approver>();
  if (!row) {
    throw unprocessable(
      `Phòng ${deptCode} chưa được gán Trưởng phòng. Liên hệ KSNB.`,
      'no_manager',
    );
  }
  return row;
}

export async function getActiveBod(env: Bindings): Promise<Approver> {
  const row = await env.DB.prepare(
    `SELECT user_email AS email, user_name AS name
       FROM bod_members
      WHERE is_active = 1
      ORDER BY routing_order ASC, id ASC LIMIT 1`,
  )
    .first<Approver>();
  if (!row) {
    throw unprocessable('Chưa có BGĐ duyệt nào active. Liên hệ KSNB.', 'no_bod');
  }
  return row;
}

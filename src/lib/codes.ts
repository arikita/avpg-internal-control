// Sinh mã phiếu atomic: {dept_code}{NN}-{DDMMYYYY}, NN từ proposal_counters.

import type { D1Database } from '@cloudflare/workers-types';
import { vnDateKey } from './time';
import { unprocessable } from './errors';

const MAX_PER_DAY = 99;

export async function nextProposalCode(
  db: D1Database,
  deptCode: string,
  now: Date = new Date(),
): Promise<string> {
  const dateKey = vnDateKey(now);

  // Atomic increment với RETURNING.
  const row = await db
    .prepare(
      `INSERT INTO proposal_counters (dept_code, date_key, counter) VALUES (?1, ?2, 1)
       ON CONFLICT(dept_code, date_key) DO UPDATE SET counter = counter + 1
       RETURNING counter`,
    )
    .bind(deptCode, dateKey)
    .first<{ counter: number }>();

  if (!row) throw new Error('Counter insert returned no row');
  if (row.counter > MAX_PER_DAY) {
    throw unprocessable(
      `Vượt giới hạn ${MAX_PER_DAY} phiếu/ngày cho phòng ${deptCode}. Liên hệ KSNB.`,
      'counter_overflow',
    );
  }
  const nn = String(row.counter).padStart(2, '0');
  return `${deptCode}${nn}-${dateKey}`;
}

// Account-sync — poll Microsoft Graph để phát hiện account bị disable trên Entra
// (nguồn gốc: disable trên AD/DC → AD Connect sync lên Entra). Cron */15 gọi hàm này.
// Set users.account_enabled = 0 khi Entra báo disabled → sessionMiddleware + bot Telegram
// chặn user đó. Re-enable chủ yếu xử lý lúc login (xem upsertUserFromGraph), cron bắt nốt.
//
// YÊU CẦU: app registration phải có permission User.Read.All (application) + admin consent.
// Thiếu consent → getAppToken vẫn ok nhưng fetchAccountEnabled trả 403 → đếm vào errors,
// KHÔNG đổi account_enabled (fail-safe: không tự khoá nhầm ai).

import type { Bindings } from '../types';
import { getAppToken, fetchAccountEnabled } from './entra';
import { nowIso } from './time';

export type AccountSyncResult = {
  total: number; // số user trong bảng
  checked: number; // số user query Graph thành công + cập nhật
  disabled: number; // số user chuyển 1 → 0 trong lần chạy này
  reenabled: number; // số user chuyển 0 → 1
  errors: number; // số user query lỗi (giữ nguyên state)
};

export async function runAccountSync(env: Bindings): Promise<AccountSyncResult> {
  const res = await env.DB.prepare(`SELECT id, account_enabled FROM users`).all<{
    id: string;
    account_enabled: number;
  }>();
  const users = res.results ?? [];
  const out: AccountSyncResult = {
    total: users.length,
    checked: 0,
    disabled: 0,
    reenabled: 0,
    errors: 0,
  };
  if (users.length === 0) return out;

  let token: string;
  try {
    token = await getAppToken(env);
  } catch (e) {
    console.error('[account-sync] getAppToken failed', e);
    out.errors = users.length;
    return out;
  }

  const now = nowIso();
  for (const u of users) {
    try {
      const enabled = await fetchAccountEnabled(token, u.id);
      if (enabled === null) continue; // không xác định → giữ nguyên, không cập nhật
      const newVal = enabled ? 1 : 0;
      await env.DB.prepare(
        `UPDATE users SET account_enabled = ?2, account_checked_at = ?3 WHERE id = ?1`,
      )
        .bind(u.id, newVal, now)
        .run();
      out.checked++;
      if (newVal === 0 && u.account_enabled === 1) out.disabled++;
      if (newVal === 1 && u.account_enabled === 0) out.reenabled++;
    } catch (e) {
      out.errors++;
      console.error(`[account-sync] user ${u.id} failed`, e);
    }
  }

  console.log('[account-sync] done', out);
  return out;
}

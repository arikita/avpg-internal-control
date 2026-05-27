// /api/me/* — self-service cho user đang login.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { badRequest, unprocessable } from '../lib/errors';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('*', requireAuth);

const LINK_TOKEN_TTL_SEC = 10 * 60;
const SIGNATURE_MAX_BYTES = 300 * 1024; // 300KB raw image (đã xử lý nền trong suốt phía client)
const SIGNATURE_ALLOWED_TYPES = ['image/png', 'image/jpeg'];

// POST /api/me/link-token → sinh token để dùng với /link <token> trên bot.
meRoutes.post('/link-token', async (c) => {
  const user = c.get('user');
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12); // ngắn để gõ
  await c.env.KV.put(`tg:link:${token}`, user.id, { expirationTtl: LINK_TOKEN_TTL_SEC });
  return c.json({ token, expires_in_seconds: LINK_TOKEN_TTL_SEC });
});

// GET /api/me/telegram-status → đã link chưa.
meRoutes.get('/telegram-status', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT telegram_chat_id FROM users WHERE id = ?1`,
  )
    .bind(user.id)
    .first<{ telegram_chat_id: string | null }>();
  return c.json({ linked: !!row?.telegram_chat_id });
});

// POST /api/me/unlink-telegram
meRoutes.post('/unlink-telegram', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE users SET telegram_chat_id = NULL WHERE id = ?1`)
    .bind(user.id)
    .run();
  return c.json({ ok: true });
});

// GET /api/me/signature → trả status + preview (data URL hoặc null)
meRoutes.get('/signature', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`SELECT signature_data_url FROM users WHERE id = ?1`)
    .bind(user.id)
    .first<{ signature_data_url: string | null }>();
  return c.json({
    hasSignature: !!row?.signature_data_url,
    dataUrl: row?.signature_data_url ?? null,
  });
});

// POST /api/me/signature — upload multipart `file` PNG/JPG ≤200KB.
meRoutes.post('/signature', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const file = form.get('file') as File | null;
  if (!file || typeof file === 'string') throw badRequest('Thiếu file');
  if (!SIGNATURE_ALLOWED_TYPES.includes(file.type)) {
    throw unprocessable('Chỉ hỗ trợ PNG hoặc JPG', 'invalid_type');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw badRequest('File rỗng');
  if (bytes.length > SIGNATURE_MAX_BYTES) {
    throw unprocessable(
      `File vượt giới hạn ${SIGNATURE_MAX_BYTES / 1024}KB (hiện ${Math.round(bytes.length / 1024)}KB)`,
      'too_large',
    );
  }

  // Encode base64 — btoa cần string, chunk để tránh overflow stack với large files
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  const dataUrl = `data:${file.type};base64,${btoa(bin)}`;

  await c.env.DB.prepare(`UPDATE users SET signature_data_url = ?2 WHERE id = ?1`)
    .bind(user.id, dataUrl)
    .run();
  return c.json({ ok: true, sizeKB: Math.round(bytes.length / 1024) });
});

// DELETE /api/me/signature
meRoutes.delete('/signature', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(`UPDATE users SET signature_data_url = NULL WHERE id = ?1`)
    .bind(user.id)
    .run();
  return c.json({ ok: true });
});

// GET /api/me/inbox-counts → role + pending counts để dashboard hiện đúng tabs + badge.
meRoutes.get('/inbox-counts', async (c) => {
  const user = c.get('user');
  const email = user.email.toLowerCase();
  const [mgrRow, bodRow, enRow, icRow, pendMgr, pendBod, pendEn, pendIc] = await Promise.all([
    c.env.DB.prepare(
      `SELECT 1 FROM department_managers WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`,
    )
      .bind(email)
      .first(),
    c.env.DB.prepare(`SELECT 1 FROM bod_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`)
      .bind(email)
      .first(),
    c.env.DB.prepare(
      `SELECT 1 FROM engineering_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`,
    )
      .bind(email)
      .first(),
    c.env.DB.prepare(`SELECT 1 FROM ic_members WHERE LOWER(user_email) = ?1 AND is_active = 1 LIMIT 1`)
      .bind(email)
      .first(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals WHERE LOWER(manager_email) = ?1 AND status = 'submitted'`,
    )
      .bind(email)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(bod_email) = ?1
          AND (
            (proposal_type = 'general' AND status = 'manager_approved')
            OR (proposal_type = 'purchase' AND status = 'ic_approved')
          )`,
    )
      .bind(email)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(engineering_email) = ?1
          AND proposal_type = 'purchase'
          AND engineering_required = 1
          AND status = 'manager_approved'`,
    )
      .bind(email)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM proposals
        WHERE LOWER(ic_email) = ?1
          AND proposal_type = 'purchase'
          AND (
            (engineering_required = 0 AND status = 'manager_approved')
            OR (engineering_required = 1 AND status = 'en_approved')
          )`,
    )
      .bind(email)
      .first<{ n: number }>(),
  ]);
  const pendingManager = pendMgr?.n ?? 0;
  const pendingBod = pendBod?.n ?? 0;
  const pendingEngineering = pendEn?.n ?? 0;
  const pendingIc = pendIc?.n ?? 0;
  return c.json({
    // Hiện tab nếu là approver trong cấu hình HOẶC còn phiếu chờ duyệt
    // (approver cũ vừa bị remove vẫn cần thấy phiếu pending đã gán cho họ).
    isManager: !!mgrRow || pendingManager > 0,
    isBod: !!bodRow || pendingBod > 0,
    isEngineering: !!enRow || pendingEngineering > 0,
    isIc: !!icRow || pendingIc > 0,
    pendingManager,
    pendingBod,
    pendingEngineering,
    pendingIc,
  });
});

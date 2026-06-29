// Static asset routes — letterhead image cho print view.
// Đặt riêng để cache header dài hạn + tránh nặng pages.ts.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { LETTERHEAD_PAGE1_B64 } from '../lib/letterhead';

export const staticRoutes = new Hono<AppEnv>();

// Decode 1 lần, giữ trong closure (module-level var trên Worker isolate).
let cachedLetterheadBytes: Uint8Array | null = null;
function getLetterheadBytes(): Uint8Array {
  if (cachedLetterheadBytes) return cachedLetterheadBytes;
  const bin = atob(LETTERHEAD_PAGE1_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  cachedLetterheadBytes = bytes;
  return bytes;
}

staticRoutes.get('/letterhead.png', (c) => {
  const bytes = getLetterheadBytes();
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// Pattern nền trang đăng nhập — dùng đúng ảnh contour của trang sign (Documenso) để đồng bộ
// thiết kế. Fetch 1 lần từ sign domain rồi cache trong isolate (tự dò tên file có hash, nên
// bền khi Documenso redeploy đổi hash). Hỏng/không tải được → 404, trang vẫn hiển thị bình thường.
const SIGN_ORIGIN = 'https://sign.anvietphatgroup.com';
let cachedLoginBg: Uint8Array | null = null;
let loginBgTried = false;

async function fetchSignPattern(): Promise<Uint8Array | null> {
  try {
    const html = await (await fetch(`${SIGN_ORIGIN}/signin`)).text();
    const m = html.match(/\/assets\/background-pattern-[A-Za-z0-9_-]+\.png/);
    if (!m) return null;
    const res = await fetch(`${SIGN_ORIGIN}${m[0]}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

staticRoutes.get('/login-bg.png', async (c) => {
  if (!cachedLoginBg && !loginBgTried) {
    loginBgTried = true; // chỉ thử fetch 1 lần tới khi có; tránh spam nếu sign down
    cachedLoginBg = await fetchSignPattern();
    if (!cachedLoginBg) loginBgTried = false; // cho phép thử lại lần sau nếu lỗi tạm thời
  }
  if (!cachedLoginBg) return c.body(null, 404);
  return new Response(cachedLoginBg, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

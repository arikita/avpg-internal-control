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

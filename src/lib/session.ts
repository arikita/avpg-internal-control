// Signed session cookie. Payload là JSON SessionUser, sign HMAC-SHA256 với SESSION_SECRET.
// Cookie value = base64url(payload) + '.' + base64url(signature).

import type { SessionUser } from '../types';

const COOKIE_NAME = 'avpg_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export async function signSession(user: SessionUser, secret: string): Promise<string> {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(user)));
  const sig = await hmac(secret, payload);
  return `${payload}.${b64urlEncode(sig)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sigB64] = parts as [string, string];
  const expected = await hmac(secret, payload);
  const got = b64urlDecode(sigB64);
  if (expected.length !== got.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ got[i]!;
  if (diff !== 0) return null;
  try {
    const json = new TextDecoder().decode(b64urlDecode(payload));
    return JSON.parse(json) as SessionUser;
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function buildSessionCookie(value: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

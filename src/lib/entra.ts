// Microsoft Entra ID — OIDC Authorization Code flow + Graph helpers.
// Stub Phase 1: chỉ cần authorize URL + token exchange + /me. Refresh token chưa dùng.

import type { Bindings } from '../types';
import { badRequest } from './errors';

const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'User.ReadBasic.All'];

export function authorizeUrl(env: Bindings, state: string, nonce: string): string {
  const params = new URLSearchParams({
    client_id: env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${env.APP_BASE_URL}${env.ENTRA_REDIRECT_PATH}`,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    nonce,
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeCode(env: Bindings, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${env.APP_BASE_URL}${env.ENTRA_REDIRECT_PATH}`,
    scope: SCOPES.join(' '),
  });
  const res = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw badRequest(`Entra token exchange failed: ${text}`);
  }
  return res.json();
}

// Lấy access token application permission (client credentials) — dùng cho Graph sendMail.
export async function getAppToken(env: Bindings): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.CLIENT_ID,
    client_secret: env.CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Entra app token failed: ${text}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

// Gọi /me bằng user access token. Trả về fields cần snapshot.
export type GraphMe = {
  id: string;
  userPrincipalName: string;
  displayName: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
};

export async function graphMe(accessToken: string): Promise<GraphMe> {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,displayName,mail,jobTitle,department',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph /me failed: ${text}`);
  }
  return res.json();
}

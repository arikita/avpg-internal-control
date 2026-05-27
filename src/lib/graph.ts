// Microsoft Graph helpers: gửi mail từ shared mailbox bằng app token.
// Token cache trong KV (TTL 50 phút, Graph token sống ~60 phút).

import type { Bindings } from '../types';
import { getAppToken } from './entra';

const TOKEN_CACHE_KEY = 'graph:app_token';
const TOKEN_TTL_SECONDS = 50 * 60;

async function getCachedAppToken(env: Bindings): Promise<string> {
  const cached = await env.KV.get(TOKEN_CACHE_KEY);
  if (cached) return cached;
  const token = await getAppToken(env);
  await env.KV.put(TOKEN_CACHE_KEY, token, { expirationTtl: TOKEN_TTL_SECONDS });
  return token;
}

export type SendMailArgs = {
  to: string;
  subject: string;
  html: string;
  // (optional) plain-text fallback — Outlook desktop xử lý tốt khi có cả 2,
  // nhưng Phase 1 chỉ gửi HTML cho gọn.
};

export type SendMailResult = { ok: true; messageId?: string } | { ok: false; error: string };

export async function graphSendMail(env: Bindings, args: SendMailArgs): Promise<SendMailResult> {
  const token = await getCachedAppToken(env);

  const body = {
    message: {
      subject: args.subject,
      body: { contentType: 'HTML', content: args.html },
      toRecipients: [{ emailAddress: { address: args.to } }],
    },
    // Lưu vào Sent Items của shared mailbox để KSNB audit khi cần.
    saveToSentItems: true,
  };

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.NO_REPLY_MAILBOX)}/sendMail`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 202) return { ok: true };

  // 401 → token có thể expired sớm; xoá cache để lần sau lấy mới.
  if (res.status === 401) await env.KV.delete(TOKEN_CACHE_KEY);

  const text = await res.text();
  return { ok: false, error: `Graph sendMail ${res.status}: ${text.slice(0, 500)}` };
}

export type GraphUser = { email: string; name: string };

// Search user trong directory để admin gán approver. App token (User.Read.All — đã có cho account-sync).
// startswith trên displayName/mail/UPN, chỉ account đang bật, top 15.
export async function graphSearchUsers(env: Bindings, query: string): Promise<GraphUser[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const token = await getCachedAppToken(env);
  const esc = q.replace(/'/g, "''");
  const filter =
    `accountEnabled eq true and (startswith(displayName,'${esc}')` +
    ` or startswith(mail,'${esc}') or startswith(userPrincipalName,'${esc}'))`;
  const url =
    'https://graph.microsoft.com/v1.0/users?$count=true&$select=displayName,mail,userPrincipalName&$top=15&$filter=' +
    encodeURIComponent(filter);
  // ConsistencyLevel: eventual + $count → cho phép startswith kết hợp 'or' nhiều thuộc tính.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
  });
  if (res.status === 401) await env.KV.delete(TOKEN_CACHE_KEY);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    value?: Array<{ displayName?: string; mail?: string; userPrincipalName?: string }>;
  };
  return (json.value ?? [])
    .map((u) => ({
      email: (u.mail ?? u.userPrincipalName ?? '').toLowerCase(),
      name: u.displayName ?? u.mail ?? u.userPrincipalName ?? '',
    }))
    .filter((u) => u.email);
}

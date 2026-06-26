// Client gọi Documenso v2 API (self-host) cho luồng ký điện tử DNTT.
// Chỉ dùng fetch/FormData/Blob (có sẵn cả Node lẫn Workers) — KHÔNG import node:*.
// Endpoint xác nhận theo OpenAPI bản 2.13.0 của instance:
//   POST /api/v2/document/create        (multipart: payload JSON + file PDF; nhận recipients+fields inline)
//   POST /api/v2/document/distribute    (gửi mail mời ký)
//   GET  /api/v2/document/{id}/download (tải bản PDF, dùng cho bản đã ký)
// Cấu hình: DOCUMENSO_BASE_URL (vd http://documenso:3000), DOCUMENSO_API_KEY.

import type { Bindings } from '../types';

export type DocumensoSigner = {
  email: string;
  name: string;
  signingOrder: number; // 1=Trưởng BP, 2=KSNB & Kế toán (song song), 3=BOD
  // Vị trí ô chữ ký trên trang (đơn vị %). pageNumber 1-based.
  field: { pageNumber: number; pageX: number; pageY: number; width: number; height: number };
};

export type CreatedDocument = {
  documentId: number;
  envelopeId: string;
  // recipient Documenso đã tạo (để map ngược id ↔ email/role).
  recipients: Array<{ id: number; email: string; signingOrder: number }>;
};

export function documensoConfigured(env: Bindings): boolean {
  return !!(env.DOCUMENSO_BASE_URL && env.DOCUMENSO_API_KEY);
}

function base(env: Bindings): string {
  return env.DOCUMENSO_BASE_URL.replace(/\/+$/, '');
}

function authHeaders(env: Bindings): Record<string, string> {
  // Documenso nhận API key qua header Authorization (giá trị thô, không "Bearer").
  return { Authorization: env.DOCUMENSO_API_KEY };
}

async function asError(res: Response): Promise<Error> {
  let detail = '';
  try {
    detail = JSON.stringify(await res.json());
  } catch {
    detail = await res.text().catch(() => '');
  }
  return new Error(`Documenso ${res.status} ${res.statusText}: ${detail.slice(0, 600)}`);
}

// Tạo document từ PDF + người ký (kèm ô chữ ký inline). Chưa gửi mail (distribute riêng).
export async function createSignedDocument(
  env: Bindings,
  args: { title: string; externalId?: string; pdf: Uint8Array; signers: DocumensoSigner[]; subject?: string; message?: string },
): Promise<CreatedDocument> {
  const payload = {
    title: args.title,
    externalId: args.externalId,
    meta: {
      distributionMethod: 'EMAIL',
      signingOrder: 'SEQUENTIAL', // theo signingOrder; cùng số = ký song song (KSNB & Kế toán)
      subject: args.subject ?? `Đề nghị thanh toán ${args.title} — cần chữ ký`,
      message: args.message ?? 'Vui lòng đăng nhập (M365) và ký Giấy đề nghị thanh toán đính kèm.',
    },
    recipients: args.signers.map((s) => ({
      email: s.email,
      name: s.name,
      role: 'SIGNER' as const,
      signingOrder: s.signingOrder,
      // LƯU Ý: actionAuth:['ACCOUNT'] (bắt login mới ký) là tính năng Enterprise của Documenso,
      // bản community self-host KHÔNG cho set qua API (lỗi "permission to set the action auth") → bỏ.
      // Định danh người ký vẫn dựa vào: link ký gửi tới đúng email + Documenso chỉ cho login bằng M365 SSO.
      fields: [
        {
          type: 'SIGNATURE' as const,
          pageNumber: s.field.pageNumber,
          pageX: s.field.pageX,
          pageY: s.field.pageY,
          width: s.field.width,
          height: s.field.height,
        },
      ],
    })),
  };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  form.append('file', new Blob([args.pdf], { type: 'application/pdf' }), `${args.title}.pdf`);

  const res = await fetch(`${base(env)}/api/v2/document/create`, {
    method: 'POST',
    headers: authHeaders(env), // KHÔNG set Content-Type — để fetch tự gắn boundary multipart
    body: form,
  });
  if (!res.ok) throw await asError(res);
  const data = (await res.json()) as {
    documentId?: number;
    id?: number;
    envelopeId?: string;
    recipients?: Array<{ id: number; email: string; signingOrder: number }>;
  };
  const documentId = data.documentId ?? data.id;
  if (!documentId || !data.envelopeId) throw new Error(`Documenso create thiếu id/envelopeId: ${JSON.stringify(data).slice(0, 300)}`);
  return {
    documentId,
    envelopeId: data.envelopeId,
    recipients: data.recipients ?? [],
  };
}

// Gửi mail mời ký (sau create). Idempotent phía Documenso theo trạng thái document.
export async function distributeDocument(env: Bindings, documentId: number): Promise<void> {
  const res = await fetch(`${base(env)}/api/v2/document/distribute`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId }),
  });
  if (!res.ok) throw await asError(res);
}

// Tải bản PDF (đã ký khi completed). Download trả JSON; thử các shape phổ biến:
//   { downloadUrl } | { url } | { data: <base64> } | { document: { ... } }.
export async function downloadDocumentPdf(env: Bindings, documentId: number): Promise<Uint8Array> {
  const res = await fetch(`${base(env)}/api/v2/document/${documentId}/download?version=signed`, {
    method: 'GET',
    headers: authHeaders(env),
  });
  if (!res.ok) throw await asError(res);
  const ctype = res.headers.get('content-type') ?? '';
  if (ctype.includes('application/pdf')) {
    return new Uint8Array(await res.arrayBuffer());
  }
  const data = (await res.json()) as Record<string, unknown>;
  const url = (data.downloadUrl ?? data.url) as string | undefined;
  if (url) {
    const f = await fetch(url);
    if (!f.ok) throw await asError(f);
    return new Uint8Array(await f.arrayBuffer());
  }
  const b64 = (data.data ?? (data.document as Record<string, unknown> | undefined)?.data) as string | undefined;
  if (b64) return base64ToBytes(b64);
  throw new Error(`Documenso download shape lạ: ${JSON.stringify(data).slice(0, 300)}`);
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Xác thực webhook Documenso. Bản community KHÔNG ký HMAC — nó gửi secret THẲNG qua
// header `X-Documenso-Secret` (xem execute-webhook-call.ts). So bằng (timing-safe).
// Trả true nếu khớp hoặc chưa cấu hình secret.
export function verifyWebhookSecret(
  secret: string | undefined,
  headerValue: string | null,
): boolean {
  if (!secret) return true; // chưa cấu hình → không chặn (log ở caller)
  if (!headerValue) return false;
  return timingSafeEqual(secret, headerValue);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

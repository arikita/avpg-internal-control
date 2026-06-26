// Render bản in DNTT (HTML mẫu AVPG-AC-P1-F1) → PDF qua Gotenberg (sidecar Chromium).
// Tách service riêng để KHÔNG nhồi native dep (Chromium) vào container app.
// Cấu hình: GOTENBERG_URL (vd http://gotenberg:3000). Xem docs/documenso-dntt-integration.md.
// Chỉ fetch/FormData/Blob — không import node:*.

import type { Bindings } from '../types';
import { paymentPrintPage } from '../web/payment-print';

export function pdfRenderConfigured(env: Bindings): boolean {
  return !!env.GOTENBERG_URL;
}

export async function renderPaymentPdf(
  env: Bindings,
  pr: Record<string, unknown>,
  items: Record<string, unknown>[],
  sig?: { proposerName?: string; managerName?: string },
): Promise<Uint8Array> {
  const htmlStr = String(await paymentPrintPage(pr, items, sig));
  const form = new FormData();
  // Gotenberg yêu cầu file chính tên index.html.
  form.append('files', new Blob([htmlStr], { type: 'text/html' }), 'index.html');
  form.append('paperWidth', '8.27'); // A4 inch
  form.append('paperHeight', '11.69');
  form.append('marginTop', '0');
  form.append('marginBottom', '0');
  form.append('marginLeft', '0');
  form.append('marginRight', '0');
  form.append('printBackground', 'true');

  const url = env.GOTENBERG_URL.replace(/\/+$/, '') + '/forms/chromium/convert/html';
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gotenberg ${res.status}: ${t.slice(0, 400)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

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
  const htmlStr = String(await paymentPrintPage(pr, items, { ...sig, forSign: true }));
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

// Đếm số trang PDF (để đặt ô chữ ký vào TRANG CUỐI — khối chữ ký nằm ở trang riêng cuối).
// Ưu tiên đếm object /Type /Page; fallback /Count lớn nhất trong cây /Pages.
export function countPdfPages(bytes: Uint8Array): number {
  const t = new TextDecoder('latin1').decode(bytes);
  const byType = (t.match(/\/Type\s*\/Page(?![s])/g) || []).length;
  if (byType > 0) return byType;
  const counts = [...t.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 1;
}

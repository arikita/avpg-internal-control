// Ingest hóa đơn NCC từ shared mailbox M365.
// Cron */10 gọi runInvoiceIngest: quét mail mới (chưa có trong invoice_mail_seen) →
//   - nếu đính kèm .xml (chuẩn TT78) → parseTT78Xml (mọi nhà cung cấp)
//   - nếu không → dò link portal trong body → adapter nhà cung cấp → fetch HTML → parse
// Mỗi HĐ parse được → tạo dòng supplier_invoice status='pending' (người dùng xác nhận sau).
// Tự gán NHÀ MÁY theo MST bên mua (buyer_branch_map) và tên ngắn NCC (supplier_alias).

import type { Bindings } from '../types';
import { graphListMessages, graphListAttachments } from './graph';
import {
  extractInvoiceLinks,
  providerForUrl,
  parseTT78Xml,
  type InvoiceData,
} from './invoice-parse';

export type IngestResult = {
  scanned: number; // mail mới quét
  parsed: number; // HĐ tạo mới
  duplicate: number; // HĐ đã có (bỏ qua)
  noInvoice: number; // mail không phải hóa đơn
  errors: number;
};

const MSG_TOP = 25;

export async function runInvoiceIngest(env: Bindings): Promise<IngestResult> {
  const out: IngestResult = { scanned: 0, parsed: 0, duplicate: 0, noInvoice: 0, errors: 0 };
  const mailbox = env.INVOICE_MAILBOX;
  if (!mailbox) {
    console.warn('[invoice-ingest] INVOICE_MAILBOX chưa cấu hình — bỏ qua');
    return out;
  }

  let messages;
  try {
    messages = await graphListMessages(env, mailbox, MSG_TOP);
  } catch (e) {
    console.error('[invoice-ingest] listMessages lỗi', e);
    out.errors++;
    return out;
  }

  for (const msg of messages) {
    // Đã xử lý? (idempotent)
    const seen = await env.DB.prepare(`SELECT 1 FROM invoice_mail_seen WHERE message_id = ?1`)
      .bind(msg.id)
      .first();
    if (seen) continue;
    out.scanned++;

    try {
      const invoices = await extractFromMessage(env, mailbox, msg);
      if (invoices.length === 0) {
        out.noInvoice++;
        await markSeen(env, msg, 'no_invoice', null);
        continue;
      }
      let created = 0;
      let dup = 0;
      for (const inv of invoices) {
        const id = await persistInvoice(env, inv, msg.id);
        if (id) created++;
        else dup++;
      }
      out.parsed += created;
      out.duplicate += dup;
      await markSeen(env, msg, 'parsed', `created=${created} dup=${dup}`);
    } catch (e) {
      out.errors++;
      console.error(`[invoice-ingest] mail ${msg.id} lỗi`, e);
      await markSeen(env, msg, 'error', String(e).slice(0, 500));
    }
  }

  console.log('[invoice-ingest] done', out);
  return out;
}

// Lấy danh sách HĐ từ 1 mail: ưu tiên XML đính kèm, fallback link portal.
async function extractFromMessage(
  env: Bindings,
  mailbox: string,
  msg: { id: string; bodyHtml: string; hasAttachments: boolean },
): Promise<InvoiceData[]> {
  const result: InvoiceData[] = [];

  // HĐ chỉ hợp lệ khi parse ra được dữ liệu định danh thật — chặn tạo dòng RỖNG khi
  // parser fail (vd template/provider lạ) thay vì lưu HĐ trắng vào DB.
  const usable = (inv: InvoiceData): boolean =>
    !!(inv.invoiceNo || inv.serial || inv.total != null || inv.seller.taxCode);

  if (msg.hasAttachments) {
    const atts = await graphListAttachments(env, mailbox, msg.id);
    for (const a of atts) {
      if (!/\.xml$/i.test(a.name) && !/xml/i.test(a.contentType)) continue;
      const xml = new TextDecoder('utf-8').decode(a.bytes).replace(/^﻿/, '');
      if (/<HDon\b|<TDiep\b|<DLHDon\b/i.test(xml)) {
        try {
          const inv = parseTT78Xml(xml);
          if (usable(inv)) {
            // HĐ gốc: ưu tiên PDF cùng tên file với XML (bản đọc được), fallback chính XML.
            const pdf = pickSourcePdf(atts, a.name, inv.invoiceNo);
            inv.sourceDoc = pdf
              ? { name: pdf.name, mime: 'application/pdf', bytes: pdf.bytes }
              : { name: a.name, mime: 'application/xml', bytes: a.bytes };
            result.push(inv);
          }
        } catch (e) {
          console.error('[invoice-ingest] parse XML lỗi', a.name, e);
        }
      }
    }
    if (result.length) return result;
  }

  // Fallback: link portal trong body.
  const links = extractInvoiceLinks(msg.bodyHtml);
  for (const url of links) {
    const adapter = providerForUrl(url);
    if (!adapter) continue;
    try {
      let inv: InvoiceData;
      if (adapter.fetchParse) {
        // Adapter tự fetch (vd gọi API portal trả XML) — MISA meInvoice.
        inv = await adapter.fetchParse(url);
      } else {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AVPG-Invoice-Ingest/1.0)' },
          redirect: 'follow',
        });
        if (!res.ok) {
          console.error(`[invoice-ingest] fetch ${url} → ${res.status}`);
          continue;
        }
        inv = adapter.parseHtml!(await res.text());
      }
      inv.invoiceUrl = url;
      if (!usable(inv)) {
        console.error(`[invoice-ingest] parse ${adapter.name} ra rỗng (bỏ qua): ${url}`);
        continue;
      }
      result.push(inv);
    } catch (e) {
      console.error(`[invoice-ingest] fetch/parse ${url} lỗi`, e);
    }
    // Một mail thường chỉ 1 HĐ — lấy được rồi thì dừng dò link còn lại.
    if (result.length) break;
  }
  return result;
}

// Chọn PDF "hóa đơn gốc" khớp với XML: ưu tiên PDF trùng tên file (bỏ đuôi); nếu không
// có thì PDF nào chứa số HĐ nhưng KHÔNG phải bảng kê. null = không tìm thấy PDF phù hợp.
function pickSourcePdf(
  atts: { name: string; bytes: Uint8Array }[],
  xmlName: string,
  invoiceNo: string | null,
): { name: string; bytes: Uint8Array } | null {
  const base = xmlName.replace(/\.xml$/i, '').toLowerCase();
  const pdfs = atts.filter((a) => /\.pdf$/i.test(a.name));
  let pdf = pdfs.find((a) => a.name.replace(/\.pdf$/i, '').toLowerCase() === base);
  if (!pdf && invoiceNo) {
    const no = invoiceNo.toLowerCase();
    pdf = pdfs.find((a) => a.name.toLowerCase().includes(no) && !/bangke|bang ?k[eê]/i.test(a.name));
  }
  return pdf ?? null;
}

// Lưu file HĐ gốc vào FILES + ghi tham chiếu lên dòng HĐ. Lỗi lưu file không chặn ingest.
async function storeSourceDoc(env: Bindings, invoiceId: number, doc: NonNullable<InvoiceData['sourceDoc']>): Promise<void> {
  try {
    const stored = await env.FILES.put(doc.bytes);
    await env.DB.prepare(
      `UPDATE supplier_invoice SET source_doc_key = ?2, source_doc_name = ?3, source_doc_mime = ?4 WHERE id = ?1`,
    )
      .bind(invoiceId, stored.key, doc.name, doc.mime)
      .run();
  } catch (e) {
    console.error('[invoice-ingest] lưu HĐ gốc lỗi', doc.name, e);
  }
}

// Lưu HĐ + dòng chi tiết. Trả invoice id nếu tạo mới; null nếu trùng (đã tồn tại).
async function persistInvoice(
  env: Bindings,
  inv: InvoiceData,
  messageId: string,
): Promise<number | null> {
  const branch = await resolveBranch(env, inv.buyer.taxCode);
  const supplierShort = await resolveSupplierShort(env, inv.seller.taxCode, inv.seller.name);
  const creditTerm = await resolveCreditTerm(env, inv.seller.taxCode);

  const row = await env.DB.prepare(
    `INSERT INTO supplier_invoice (
        source, source_message_id, provider, invoice_url,
        serial, invoice_no, invoice_date, tax_auth_code, lookup_code,
        seller_tax_code, seller_name, seller_address,
        buyer_tax_code, buyer_name, buyer_address,
        currency, exchange_rate, subtotal, vat_rate, vat_amount, total, amount_words,
        branch, supplier_short, credit_term_days, status
     ) VALUES (
        'email', ?1, ?2, ?3,
        ?4, ?5, ?6, ?7, ?8,
        ?9, ?10, ?11,
        ?12, ?13, ?14,
        ?15, ?16, ?17, ?18, ?19, ?20, ?21,
        ?22, ?23, ?24, 'pending'
     )
     ON CONFLICT (seller_tax_code, serial, invoice_no) DO NOTHING
     RETURNING id`,
  )
    .bind(
      messageId,
      inv.provider,
      inv.invoiceUrl ?? null,
      inv.serial,
      inv.invoiceNo,
      inv.invoiceDate,
      inv.taxAuthCode,
      inv.lookupCode,
      inv.seller.taxCode,
      inv.seller.name,
      inv.seller.address,
      inv.buyer.taxCode,
      inv.buyer.name,
      inv.buyer.address,
      inv.currency,
      inv.exchangeRate,
      inv.subtotal,
      inv.vatRate,
      inv.vatAmount,
      inv.total,
      inv.amountWords,
      branch,
      supplierShort,
      creditTerm,
    )
    .first<{ id: number }>();

  if (!row) return null; // trùng → đã có

  for (const ln of inv.lines) {
    await env.DB.prepare(
      `INSERT INTO supplier_invoice_line (invoice_id, seq, item_name, unit, qty, unit_price, vat_rate, amount)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
      .bind(row.id, ln.seq, ln.itemName, ln.unit, ln.qty, ln.unitPrice, ln.vatRate, ln.amount)
      .run();
  }
  if (inv.sourceDoc) await storeSourceDoc(env, row.id, inv.sourceDoc);
  return row.id;
}

// MST bên mua → NHÀ MÁY (null nếu chưa map → người dùng gán tay khi xác nhận).
async function resolveBranch(env: Bindings, buyerTaxCode: string | null): Promise<string | null> {
  if (!buyerTaxCode) return null;
  const r = await env.DB.prepare(`SELECT branch FROM buyer_branch_map WHERE buyer_tax_code = ?1`)
    .bind(buyerTaxCode)
    .first<{ branch: string }>();
  return r?.branch ?? null;
}

// MST bên bán → tên ngắn NCC. Lần đầu gặp: tạo alias (short_name = tên đầy đủ), trả tên đó.
async function resolveSupplierShort(
  env: Bindings,
  sellerTaxCode: string | null,
  sellerName: string | null,
): Promise<string | null> {
  if (!sellerTaxCode) return sellerName;
  const r = await env.DB.prepare(`SELECT short_name FROM supplier_alias WHERE seller_tax_code = ?1`)
    .bind(sellerTaxCode)
    .first<{ short_name: string }>();
  if (r) return r.short_name;
  const short = sellerName ?? sellerTaxCode;
  await env.DB.prepare(
    `INSERT INTO supplier_alias (seller_tax_code, seller_name, short_name)
     VALUES (?1, ?2, ?3) ON CONFLICT (seller_tax_code) DO NOTHING`,
  )
    .bind(sellerTaxCode, sellerName, short)
    .run();
  return short;
}

// MST bên bán → số ngày được nợ mặc định (đã set ở 1 HĐ trước). null nếu chưa có.
async function resolveCreditTerm(env: Bindings, sellerTaxCode: string | null): Promise<number | null> {
  if (!sellerTaxCode) return null;
  const r = await env.DB.prepare(`SELECT default_credit_term FROM supplier_alias WHERE seller_tax_code = ?1`)
    .bind(sellerTaxCode)
    .first<{ default_credit_term: number | null }>();
  return r?.default_credit_term ?? null;
}

async function markSeen(
  env: Bindings,
  msg: { id: string; receivedDateTime: string },
  outcome: string,
  detail: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO invoice_mail_seen (message_id, received_at, outcome, detail)
     VALUES (?1, ?2, ?3, ?4) ON CONFLICT (message_id) DO NOTHING`,
  )
    .bind(msg.id, msg.receivedDateTime, outcome, detail)
    .run();
}

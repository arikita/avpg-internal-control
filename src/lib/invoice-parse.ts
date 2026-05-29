// Parser hóa đơn điện tử đa nguồn.
//
// HĐĐT VN đến từ nhiều nhà cung cấp dịch vụ (easyinvoice/Softdreams, VNPT, Viettel,
// MISA meInvoice, BKAV, FPT...). Hai đường lấy dữ liệu:
//   1. XML chuẩn TT78/NĐ123 (provider-agnostic) — khi mail đính kèm .xml → parseTT78Xml.
//   2. Trang xem HĐ theo link portal — mỗi nhà cung cấp 1 adapter parse HTML.
//
// Adapter registry (PROVIDERS) dễ cắm thêm nhà cung cấp mới. Hiện có: easyinvoice.
// Mọi parser trả về cùng kiểu InvoiceData đã chuẩn hoá (số VND, ngày YYYY-MM-DD, VAT phân số).

export type InvoiceLine = {
  seq: number;
  itemName: string;
  unit: string | null;
  qty: number | null;
  unitPrice: number | null;
  vatRate: number | null; // phân số 0.08; null nếu HĐ không tách theo dòng
  amount: number | null; // thành tiền TRƯỚC thuế (= qty * unitPrice)
};

export type InvoiceParty = {
  taxCode: string | null;
  name: string | null;
  address: string | null;
};

export type InvoiceData = {
  provider: string;
  invoiceUrl?: string | null; // link portal (set khi parse từ link, không phải XML)
  serial: string | null; // ký hiệu
  invoiceNo: string | null; // số
  invoiceDate: string | null; // YYYY-MM-DD
  taxAuthCode: string | null; // mã cơ quan thuế
  lookupCode: string | null; // mã tra cứu
  seller: InvoiceParty;
  buyer: InvoiceParty;
  currency: string | null;
  exchangeRate: number | null;
  subtotal: number | null; // cộng tiền hàng (trước thuế)
  vatRate: number | null; // phân số 0.08
  vatAmount: number | null;
  total: number | null; // tổng thanh toán (gồm thuế)
  amountWords: string | null;
  lines: InvoiceLine[];
};

// ===== Helpers =====

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e) => ENTITIES[e] ?? _m)
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Số kiểu VN: '.' phân tách nghìn, ',' thập phân. "47.520.000" → 47520000; "1.234,5" → 1234.5.
export function parseVnNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = stripTags(String(raw)).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  // Bỏ dấu chấm (nghìn), đổi phẩy thành chấm thập phân.
  const norm = s.replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

// "8%" / "8 %" / "0,08" → 0.08. ">5%" hay "KCT" → null.
export function parseVatRate(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = stripTags(String(raw));
  if (/kct|kch|kkk|kkt|\\|không/i.test(s)) return null;
  const m = s.match(/-?[\d.,]+/);
  if (!m) return null;
  const n = parseVnNumber(m[0]);
  if (n == null) return null;
  return s.includes('%') ? n / 100 : n > 1 ? n / 100 : n;
}

const emptyParty = (): InvoiceParty => ({ taxCode: null, name: null, address: null });

// ===== easyinvoice (Softdreams) — parse trang ViewFromEmail (HTML server-side render) =====
// Field nằm trong element có class ổn định: serial-value, no-value, dvbh-value, compmst-value,
// compaddress-value, cusname-value, custaxcode-value, cusaddress-value, vatrate, inwords-value...
// Tổng tiền nằm trong <label> trong <td> sau nhãn (totalamount/vatamount/totalpayment).

// easyinvoice trả phần HTML hóa đơn dưới dạng CHUỖI JS BỊ ESCAPE (<, \", \/) chứ không
// phải DOM thô → regex class="..." không khớp nếu không giải-escape trước. Bước này biến
// <span class=\"serial-value\"> → <span class="serial-value"> để selector chạy đúng.
function unescapeJsHtml(html: string): string {
  return html
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0027/gi, "'")
    .replace(/\\u00a0/gi, ' ')
    .replace(/&quot;/g, '"') // \&quot; (escape lồng) → \" → " ở bước kế
    .replace(/\\"/g, '"')
    // xuống dòng/tab dạng escape (\n \r \t) → khoảng trắng để \s* trong selector vượt qua được
    .replace(/\\[rnt]/g, ' ')
    .replace(/\\\//g, '/');
}

function byClass(html: string, cls: string): string | null {
  const re = new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)<`, 'i');
  const m = html.match(re);
  if (!m || m[1] == null) return null;
  return stripTags(m[1]) || null;
}

// Giá trị <label> ngay sau 1 nhãn (anchor = class của nhãn EN, vd "totalpayment-en").
function labelAfter(html: string, anchorClass: string): number | null {
  const re = new RegExp(`class="${anchorClass}"[\\s\\S]*?<label>([^<]*)</label>`, 'i');
  const m = html.match(re);
  return m ? parseVnNumber(m[1] ?? null) : null;
}

// ===== Fallback cho template easyinvoice kiểu "nhãn + value chung" (vd VPP ONG VÀNG) =====
// Số tiền: <span class="Sub|THUE|Total"><label>…</label>.
function spanLabelNum(html: string, cls: string): number | null {
  const re = new RegExp(`class="${cls}"[^>]*>\\s*(?:<label[^>]*>\\s*)+([^<]*)`, 'i');
  const m = html.match(re);
  return m ? parseVnNumber(m[1] ?? null) : null;
}
// <span class="value">…</span> đứng sau 1 nhãn (vd "Ký hiệu (Serial)").
function valueSpanAfter(html: string, labelRe: string): string | null {
  const re = new RegExp(`${labelRe}[\\s\\S]{0,80}?class="value"[^>]*>([^<]*)<`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[1] ?? '') || null : null;
}
// <b>…</b> đầu tiên sau 1 nhãn (bỏ qua <span> ẩn không chứa <b>).
function boldAfter(html: string, labelRe: string): string | null {
  const re = new RegExp(`${labelRe}[\\s\\S]{0,200}?<b[^>]*>([^<]+)</b>`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[1] ?? '') || null : null;
}

export function parseEasyInvoiceHtml(raw: string): InvoiceData {
  const html = unescapeJsHtml(raw);
  const seller = emptyParty();
  const buyer = emptyParty();
  // Template H&T: class ngữ nghĩa (*-value). Fallback template ONG VÀNG: nhãn + <b>/class chung.
  seller.name = byClass(html, 'dvbh-value') ?? boldAfter(html, 'Đơn vị bán hàng');
  seller.taxCode =
    byClass(html, 'compmst-value') ?? (html.match(/<b class="mst"[^>]*>([^<]*)<\/b>/i)?.[1]?.trim() || null);
  seller.address = byClass(html, 'compaddress-value');
  buyer.name = byClass(html, 'cusname-value') ?? boldAfter(html, 'Tên đơn vị');
  buyer.taxCode =
    byClass(html, 'custaxcode-value') ??
    (html.match(/Tên đơn vị[\s\S]*?Mã số thuế[\s\S]*?<b[^>]*>([0-9]{8,})<\/b>/i)?.[1] ?? null);
  buyer.address = byClass(html, 'cusaddress-value');

  // Ngày: 3 <label> trong <p class="date">  → Ngày / tháng / năm.
  let invoiceDate: string | null = null;
  const dateBlock = html.match(/class="date"[\s\S]*?<\/p>/i);
  if (dateBlock) {
    const labels = [...dateBlock[0].matchAll(/<label>\s*(\d+)\s*<\/label>/g)].map((m) => m[1] ?? '');
    if (labels.length >= 3) {
      const d = labels[0] ?? '';
      const mo = labels[1] ?? '';
      const y = labels[2] ?? '';
      invoiceDate = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // Mã tra cứu: text "Mã tra cứu:" theo sau là mã.
  const lookupMatch = html.match(/Mã tra cứu:\s*(?:<[^>]*>\s*)*([A-Z0-9]{5,})/i);
  const lookupCode = lookupMatch?.[1] ?? null;

  const vatRate = parseVatRate(
    byClass(html, 'vatrate') ?? (html.match(/class="vatrate1?"[^>]*>\s*([0-9.,]+)\s*%/i)?.[1] ?? null),
  );
  const subtotal = labelAfter(html, 'totalamount-en') ?? spanLabelNum(html, 'Sub');
  const vatAmount = labelAfter(html, 'vatamount-en') ?? spanLabelNum(html, 'THUE');
  const total = labelAfter(html, 'totalpayment-en') ?? spanLabelNum(html, 'Total');

  // Dòng hàng: mỗi dòng có 1 <td class="quantity...">. Lấy các <tr> chứa class quantity.
  // easyinvoice render HĐ 2 bản (hiển thị + bản ẩn cho in/PDF) → chỉ quét vùng TRƯỚC khối
  // tổng tiền đầu tiên để khỏi nhân đôi dòng hàng.
  const lines: InvoiceLine[] = [];
  const totalsIdx = html.search(/class="totalamount-label"|Cộng tiền hàng/i);
  const lineRegion = totalsIdx > 0 ? html.slice(0, totalsIdx) : html;
  const rows = [...lineRegion.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  let seq = 0;
  for (const r of rows) {
    const rowHtml = r[1] ?? '';
    if (!/class="[^"]*quantity/i.test(rowHtml)) continue;
    const cells = [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({
      cls: m[1] ?? '',
      text: stripTags(m[2] ?? ''),
    }));
    const qi = cells.findIndex((c) => /quantity/i.test(c.cls));
    if (qi < 2) continue;
    const itemName = cells[qi - 2]?.text ?? '';
    if (!itemName) continue;
    seq += 1;
    const qty = parseVnNumber(cells[qi]?.text);
    const unitPrice = parseVnNumber(cells[qi + 1]?.text);
    const amount = parseVnNumber(cells[qi + 2]?.text);
    lines.push({
      seq,
      itemName,
      unit: cells[qi - 1]?.text || null,
      qty,
      unitPrice,
      vatRate,
      amount: amount ?? (qty != null && unitPrice != null ? qty * unitPrice : null),
    });
  }

  return {
    provider: 'easyinvoice',
    serial: byClass(html, 'serial-value') ?? valueSpanAfter(html, 'Ký hiệu'),
    invoiceNo: byClass(html, 'no-value'),
    invoiceDate,
    taxAuthCode: byClass(html, 'ma-value'),
    lookupCode,
    seller,
    buyer,
    currency: byClass(html, 'currency-value') ?? 'VND',
    exchangeRate: parseVnNumber(byClass(html, 'exchangerate-value')),
    subtotal,
    vatRate,
    vatAmount,
    total,
    amountWords: byClass(html, 'inwords-value'),
    lines,
  };
}

// ===== XML chuẩn TT78/NĐ123 (mọi nhà cung cấp) =====
// CHƯA kiểm chứng với mẫu thật — viết theo cấu trúc chuẩn, sẽ tinh chỉnh khi có file đính kèm XML.
// Cấu trúc: <HDon><DLHDon><TTChung>(KHHDon,SHDon,NLap,DVTTe,TGia)</TTChung>
//   <NDHDon><NBan>(Ten,MST,DChi)</NBan><NMua>(Ten,MST,DChi)</NMua>
//   <DSHHDVu><HHDVu>(STT,THHDVu,DVTinh,SLuong,DGia,TSuat,ThTien)</HHDVu>...</DSHHDVu>
//   <TToan>(TgTCThue,TgTThue,TgTTTBSo,TgTTTBChu)</TToan></NDHDon></DLHDon><MCCQT>...</HDon>

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m || m[1] == null) return null;
  return decodeEntities(m[1].trim()) || null;
}
function tagNum(xml: string, name: string): number | null {
  const v = tag(xml, name);
  if (v == null) return null;
  // XML TT78 dùng dấu CHẤM làm thập phân (vd 5715703.000000, 1833.000000) — KHÔNG ngăn nghìn.
  // Không dùng parseVnNumber (vốn coi '.' là ngăn nghìn → sai 10^6 lần).
  const n = Number(v.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function block(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m?.[1] ?? null;
}

export function parseTT78Xml(xml: string): InvoiceData {
  const hdon = block(xml, 'HDon') ?? xml;
  const tt = block(hdon, 'TTChung') ?? hdon;
  const nd = block(hdon, 'NDHDon') ?? hdon;
  const nbanX = block(nd, 'NBan') ?? '';
  const nmuaX = block(nd, 'NMua') ?? '';
  const tt78Date = (s: string | null): string | null => {
    if (!s) return null;
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  };
  // Ký hiệu = KHMSHDon (mẫu số) + KHHDon (ký hiệu). Một số nơi gộp sẵn trong KHHDon.
  const khms = tag(tt, 'KHMSHDon') ?? '';
  const khhd = tag(tt, 'KHHDon') ?? '';
  const serial = (khms + khhd).trim() || null;

  const lines: InvoiceLine[] = [];
  const ds = block(nd, 'DSHHDVu') ?? '';
  const items = [...ds.matchAll(/<HHDVu\b[^>]*>([\s\S]*?)<\/HHDVu>/gi)];
  items.forEach((it, idx) => {
    const h = it[1] ?? '';
    const ts = tagNum(h, 'TSuat');
    lines.push({
      seq: tagNum(h, 'STT') ?? idx + 1,
      itemName: tag(h, 'THHDVu') ?? '',
      unit: tag(h, 'DVTinh'),
      qty: tagNum(h, 'SLuong'),
      unitPrice: tagNum(h, 'DGia'),
      vatRate: ts != null && ts > 1 ? ts / 100 : ts,
      amount: tagNum(h, 'ThTien'),
    });
  });

  const tToan = block(nd, 'TToan') ?? nd;
  const tgThue = tagNum(tToan, 'TgTThue');
  const tgChuaThue = tagNum(tToan, 'TgTCThue');
  const tgTTTB = tagNum(tToan, 'TgTTTBSo');
  // VAT rate ở mức HĐ: lấy LTSuat đầu tiên (THTTLTSuat) hoặc suy từ tiền.
  const lts = tag(tToan, 'TSuat');
  let vatRate = parseVatRate(lts);
  if (vatRate == null && tgThue != null && tgChuaThue) vatRate = tgThue / tgChuaThue;

  return {
    provider: 'xml-tt78',
    serial,
    invoiceNo: tag(tt, 'SHDon'),
    invoiceDate: tt78Date(tag(tt, 'NLap')),
    taxAuthCode: tag(xml, 'MCCQT'),
    lookupCode: null,
    seller: { taxCode: tag(nbanX, 'MST'), name: tag(nbanX, 'Ten'), address: tag(nbanX, 'DChi') },
    buyer: { taxCode: tag(nmuaX, 'MST'), name: tag(nmuaX, 'Ten'), address: tag(nmuaX, 'DChi') },
    currency: tag(tt, 'DVTTe') ?? 'VND',
    exchangeRate: tagNum(tt, 'TGia'),
    subtotal: tgChuaThue,
    vatRate,
    vatAmount: tgThue,
    total: tgTTTB,
    amountWords: tag(tToan, 'TgTTTBChu'),
    lines,
  };
}

// ===== Registry adapter theo nhà cung cấp (đường link portal) =====

export type ProviderAdapter = {
  name: string;
  // Nhận diện URL thuộc nhà cung cấp này.
  matchUrl: (url: string) => boolean;
  // Parse HTML trang xem HĐ → InvoiceData (khi ingest tự fetch HTML).
  parseHtml?: (html: string) => InvoiceData;
  // Tự fetch + parse (vd gọi API portal trả XML/JSON) thay cho fetch HTML mặc định.
  fetchParse?: (url: string) => Promise<InvoiceData>;
};

// MISA meInvoice: link mail dạng meinvoice.vn/tra-cuu/?sc=<id>&m=<email>&n=<name>...
// Trang là SPA; nhưng API POST /tra-cuu/GetInvoiceDataByTransactionID trả JSON {data: <XML TT78>}
// gọi được trực tiếp (không cần cookie/headless) → parse bằng parseTT78Xml dùng chung.
async function fetchMeInvoice(url: string): Promise<InvoiceData> {
  const q = new URL(url).searchParams;
  const body = new URLSearchParams({
    transactionID: q.get('sc') ?? '',
    isReceiveEmail: 'true',
    email: q.get('m') ?? '',
    name: q.get('n') ?? '',
    cc: q.get('c') ?? '',
    bcc: q.get('b') ?? '',
    dType: q.get('d') ?? '0',
    tempType: q.get('t') ?? '1',
  });
  const res = await fetch('https://www.meinvoice.vn/tra-cuu/GetInvoiceDataByTransactionID', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`meinvoice API ${res.status}`);
  const json = (await res.json()) as { success?: boolean; data?: string };
  if (!json.success || !json.data) throw new Error('meinvoice API không trả data');
  const inv = parseTT78Xml(json.data); // data = XML chuẩn TT78
  inv.provider = 'meinvoice';
  return inv;
}

export const PROVIDERS: ProviderAdapter[] = [
  {
    name: 'easyinvoice',
    matchUrl: (u) => /easyinvoice\.com\.vn/i.test(u),
    parseHtml: parseEasyInvoiceHtml,
  },
  {
    name: 'meinvoice',
    // chỉ link tra-cứu có mã sc= (bỏ qua link bare / tracking webhook).
    matchUrl: (u) => /meinvoice\.vn\/tra-cuu\/?\?.*\bsc=/i.test(u),
    fetchParse: fetchMeInvoice,
  },
  // TODO: VNPT (vninvoice/sinvoice), Viettel (sinvoice.viettel), BKAV (ehoadon), FPT… khi có mẫu.
];

export function providerForUrl(url: string): ProviderAdapter | null {
  return PROVIDERS.find((p) => p.matchUrl(url)) ?? null;
}

// Bắt link xem HĐ trong body mail (HTML hoặc text). Trả các URL khả nghi (đã lọc theo host portal).
const PORTAL_HOST_RE =
  /https?:\/\/[^\s"'<>]*(?:easyinvoice\.com\.vn|vninvoice|sinvoice|meinvoice|ehoadon|hoadon)[^\s"'<>]*/gi;

export function extractInvoiceLinks(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(PORTAL_HOST_RE)) {
    found.add(decodeEntities(m[0]));
  }
  return [...found];
}

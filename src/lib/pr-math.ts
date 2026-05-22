// Phép tính subtotal/VAT/total cho phiếu mua hàng (PR).
// Snapshot khi submit để giữ giá trị immutable nếu sau này sửa item.

export const VAT_RATE = 0.1; // 10% chuẩn AVPG (form AVPG-IC-P4-F1)
export const QUOTE_THRESHOLD_VND = 5_000_000; // Hàng ≥5tr cần 3 báo giá (QD1 Điều 8)

export type PrItemForCalc = {
  qty_buy: number | null | undefined;
  unit_price: number | null | undefined;
};

/** Thành tiền 1 dòng = qty_buy × unit_price (VND, integer). */
export function lineTotal(item: PrItemForCalc): number {
  const qty = Number(item.qty_buy ?? 0) || 0;
  const price = Number(item.unit_price ?? 0) || 0;
  return Math.round(qty * price);
}

/** Subtotal + VAT + total từ danh sách item. */
export function calcPrTotals(items: PrItemForCalc[]): {
  subtotal: number;
  vat: number;
  total: number;
} {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const vat = Math.round(subtotal * VAT_RATE);
  return { subtotal, vat, total: subtotal + vat };
}

/** Format VND với separator '.' (VN convention) — VD 5_000_000 → '5.000.000'. */
export function formatVnd(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('vi-VN');
}

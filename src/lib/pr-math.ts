// Phép tính subtotal/VAT/total cho phiếu mua hàng (PR).
// Snapshot khi submit để giữ giá trị immutable nếu sau này sửa item.

export const DEFAULT_VAT_RATE = 10; // % — mặc định khi không chỉ định
export const ALLOWED_VAT_RATES = [0, 8, 10]; // % user được chọn (nhập tay qua dropdown)
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

/** Subtotal + VAT + total từ danh sách item, với thuế suất % (mặc định 10). */
export function calcPrTotals(
  items: PrItemForCalc[],
  vatRatePercent: number = DEFAULT_VAT_RATE,
): {
  subtotal: number;
  vat: number;
  total: number;
} {
  const rate = ALLOWED_VAT_RATES.includes(vatRatePercent) ? vatRatePercent : DEFAULT_VAT_RATE;
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const vat = Math.round((subtotal * rate) / 100);
  return { subtotal, vat, total: subtotal + vat };
}

/** Format VND với separator '.' (VN convention) — VD 5_000_000 → '5.000.000'. */
export function formatVnd(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('vi-VN');
}

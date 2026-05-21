// Time helpers — D1 lưu UTC ISO8601, hiển thị/khoá ngày theo VN (UTC+7).

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

// 'DDMMYYYY' theo giờ VN — dùng cho proposal_counters.date_key và mã phiếu.
export function vnDateKey(d: Date = new Date()): string {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vn.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

// 'DD/MM/YYYY HH:mm' theo giờ VN — render cho email/UI.
export function vnDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const vn = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = vn.getUTCFullYear();
  const hh = String(vn.getUTCHours()).padStart(2, '0');
  const mi = String(vn.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

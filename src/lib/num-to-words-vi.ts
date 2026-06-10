// Đọc số tiền (VND, số nguyên) thành chữ tiếng Việt — dùng auto điền ô "Bằng chữ"
// trên GIẤY ĐỀ NGHỊ THANH TOÁN. Kết quả viết hoa chữ đầu, kết thúc "đồng".
// Ví dụ: 1234000 -> "Một triệu hai trăm ba mươi tư nghìn đồng".

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
// Đơn vị theo từng nhóm 3 chữ số (từ thấp lên cao). Đủ tới hàng triệu tỷ.
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ', 'tỷ tỷ'];

// Đọc 1 nhóm 3 chữ số. full=true khi đây KHÔNG phải nhóm cao nhất → đọc đủ "không trăm".
function readGroup(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  const parts: string[] = [];

  if (tram > 0 || full) parts.push(DIGITS[tram]!, 'trăm');

  if (chuc > 1) {
    parts.push(DIGITS[chuc]!, 'mươi');
    if (donvi === 1) parts.push('mốt');
    else if (donvi === 4) parts.push('tư');
    else if (donvi === 5) parts.push('lăm');
    else if (donvi > 0) parts.push(DIGITS[donvi]!);
  } else if (chuc === 1) {
    parts.push('mười');
    if (donvi === 5) parts.push('lăm');
    else if (donvi > 0) parts.push(DIGITS[donvi]!);
  } else if (donvi > 0) {
    // chuc === 0
    if (tram > 0 || full) parts.push('lẻ');
    parts.push(DIGITS[donvi]!);
  }
  return parts.join(' ');
}

export function readVndWords(amount: number | string | null | undefined): string {
  let n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return 'Không đồng';

  // Tách thành các nhóm 3 chữ số từ thấp lên cao.
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const out: string[] = [];
  const top = groups.length - 1;
  for (let i = top; i >= 0; i--) {
    const g = groups[i]!;
    // Nhóm 0 ở giữa: bỏ qua (vd 1.000.000 -> "một triệu"). Nhóm cao nhất luôn được đọc.
    if (g === 0 && i !== top) continue;
    const text = readGroup(g, i !== top);
    if (text) out.push(text);
    const scale = SCALES[i];
    if (scale) out.push(scale);
  }

  const s = out.join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

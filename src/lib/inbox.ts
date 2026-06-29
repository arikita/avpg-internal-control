// Thông báo in-app (chuông header). Insert 1 dòng cho người nhận; trang chủ động poll
// GET /notifications/inbox để hiện badge + toast. Xem db/postgres/0012_inbox_notification.sql.

import type { Bindings } from '../types';

export type InboxArgs = {
  recipient: string;        // email người nhận
  kind: string;             // 'pr_signed' | 'pr_completed' | ...
  title: string;            // tiêu đề ngắn
  body?: string | null;     // chi tiết tuỳ chọn
  link?: string | null;     // đường dẫn mở khi bấm
  prId?: number | null;     // tham chiếu phiếu
};

export async function enqueueInbox(env: Bindings, args: InboxArgs): Promise<void> {
  const recipient = args.recipient.trim().toLowerCase();
  if (!recipient) return;
  await env.DB.prepare(
    `INSERT INTO inbox_notification (recipient, kind, title, body, link, pr_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(recipient, args.kind, args.title, args.body ?? null, args.link ?? null, args.prId ?? null)
    .run();
}

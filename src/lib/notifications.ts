// Enqueue + dispatch notifications. Phase 1 stub:
//   - enqueue chỉ insert row 'pending'
//   - runNotificationQueue đọc pending và (sau này) gọi Graph/Telegram
// Mục tiêu commit này: skeleton chạy được, side effects chưa wire.

import type { Bindings } from '../types';

export type NotificationEvent =
  | 'submitted'
  | 'manager_approved'
  | 'bod_approved'
  | 'completed'
  | 'rejected';

export type EnqueueArgs = {
  proposalId: number;
  channel: 'email' | 'telegram';
  event: NotificationEvent;
  recipient: string; // email hoặc telegram chat_id
};

export async function enqueueNotification(env: Bindings, args: EnqueueArgs): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
     VALUES (?1, ?2, ?3, ?4, 'pending')`,
  )
    .bind(args.proposalId, args.channel, args.event, args.recipient)
    .run();
}

// Cron entry point. Phase 1 stub: chỉ log đếm pending.
// TODO: implement Graph sendMail + Telegram sendMessage trong commit kế tiếp.
export async function runNotificationQueue(env: Bindings): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE status = 'pending' AND attempts < 5`,
  ).first<{ n: number }>();
  console.log(`[notify-queue] pending=${row?.n ?? 0}`);
}

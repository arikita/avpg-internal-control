// Enqueue + dispatch notifications.
//   - enqueue: insert row 'pending'
//   - runNotificationQueue: đọc pending, gửi qua Graph (email) hoặc Telegram, update status

import type { Bindings } from '../types';
import { renderEmail } from './email-templates';
import { graphSendMail } from './graph';

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
  recipient: string;
};

export async function enqueueNotification(env: Bindings, args: EnqueueArgs): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
     VALUES (?1, ?2, ?3, ?4, 'pending')`,
  )
    .bind(args.proposalId, args.channel, args.event, args.recipient)
    .run();
}

type PendingRow = {
  id: number;
  proposal_id: number;
  channel: 'email' | 'telegram';
  event: NotificationEvent;
  recipient: string;
  attempts: number;
};

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;

export type QueueResult = {
  picked: number;
  sent: number;
  failed: number;
  skipped: number;
};

export async function runNotificationQueue(env: Bindings): Promise<QueueResult> {
  const pending = await env.DB.prepare(
    `SELECT id, proposal_id, channel, event, recipient, attempts
       FROM notifications
      WHERE status = 'pending' AND attempts < ?1
      ORDER BY id ASC LIMIT ?2`,
  )
    .bind(MAX_ATTEMPTS, BATCH_SIZE)
    .all<PendingRow>();

  const rows = pending.results ?? [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of rows) {
    try {
      if (n.channel === 'email') {
        const { subject, html } = await renderEmail(env, n.event, n.proposal_id);
        const result = await graphSendMail(env, { to: n.recipient, subject, html });
        if (result.ok) {
          await env.DB.prepare(
            `UPDATE notifications
                SET status = 'sent', provider_msg_id = ?2, sent_at = datetime('now'),
                    attempts = attempts + 1, error = NULL
              WHERE id = ?1`,
          )
            .bind(n.id, result.messageId ?? null)
            .run();
          sent++;
        } else {
          await markFailure(env, n, result.error);
          failed++;
        }
      } else {
        // Telegram dispatch — Phase 1 chưa wire, đẩy attempts để khỏi spam log.
        await env.DB.prepare(
          `UPDATE notifications
              SET attempts = attempts + 1,
                  error = 'Telegram dispatch not implemented yet'
            WHERE id = ?1`,
        )
          .bind(n.id)
          .run();
        skipped++;
      }
    } catch (e) {
      await markFailure(env, n, e instanceof Error ? e.message : String(e));
      failed++;
    }
  }

  if (rows.length) {
    console.log(
      `[notify-queue] picked=${rows.length} sent=${sent} failed=${failed} skipped=${skipped}`,
    );
  }
  return { picked: rows.length, sent, failed, skipped };
}

async function markFailure(env: Bindings, n: PendingRow, error: string): Promise<void> {
  const nextAttempt = n.attempts + 1;
  const finalStatus = nextAttempt >= MAX_ATTEMPTS ? 'failed' : 'pending';
  await env.DB.prepare(
    `UPDATE notifications
        SET status = ?2, attempts = ?3, error = ?4
      WHERE id = ?1`,
  )
    .bind(n.id, finalStatus, nextAttempt, error.slice(0, 1000))
    .run();
}

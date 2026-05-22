// Telegram webhook — commands + callback. Phase 1:
//   /start                — welcome + hướng dẫn link
//   /help                 — danh sách lệnh
//   /link <token>         — link chat với user M365
//   /mypending            — list phiếu chờ user duyệt
//   callback_data act:approve:{id}  — approve trực tiếp
//   callback_data act:reject:{id}   — set pending state, prompt user gõ lý do
//   plain text khi có pending reject → submit reject với reason

import { Hono } from 'hono';
import type { AppEnv, Bindings } from '../types';
import { badRequest } from '../lib/errors';
import { answerCallbackQuery, editMessageText, sendMessage } from '../lib/telegram';
import { runNotificationQueue } from '../lib/notifications';
import { nowIso } from '../lib/time';

export const telegramRoutes = new Hono<AppEnv>();

const REJECT_PENDING_TTL = 5 * 60; // 5 phút gõ lý do

// ---------- Webhook entry ----------
telegramRoutes.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');
  if (!secret || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    throw badRequest('Invalid webhook secret');
  }
  const update = await c.req.json<TgUpdate>();

  try {
    if (update.message) await handleMessage(c.env, update.message);
    else if (update.callback_query) await handleCallback(c.env, update.callback_query);
  } catch (e) {
    console.error('[telegram] handler error', e);
  }
  // Always ACK 200 — Telegram sẽ retry vô hạn nếu non-2xx.
  return c.json({ ok: true });
});

// ---------- Types (lite) ----------
type TgUser = { id: number; first_name?: string; username?: string };
type TgChat = { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
};
type TgCallback = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
type TgUpdate = { message?: TgMessage; callback_query?: TgCallback };

// ---------- Message handler ----------
async function handleMessage(env: Bindings, msg: TgMessage): Promise<void> {
  const text = (msg.text ?? '').trim();
  if (!text) return;

  // Commands
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    switch (cmd) {
      case '/start':
        return cmdStart(env, msg);
      case '/help':
        return cmdHelp(env, msg);
      case '/link':
        return cmdLink(env, msg, rest.join(' ').trim());
      case '/mypending':
        return cmdMyPending(env, msg);
      default:
        await sendMessage(env, {
          chatId: msg.chat.id,
          text: `Lệnh chưa hỗ trợ: <code>${cmd}</code>\nGõ /help để xem danh sách.`,
        });
        return;
    }
  }

  // Plain text — kiểm pending reject reason
  if (msg.chat.type !== 'private') return;
  const pendingKey = `tg:pending:${msg.chat.id}`;
  const raw = await env.KV.get(pendingKey);
  if (!raw) return;
  const pending = JSON.parse(raw) as {
    kind: 'reject';
    proposalId: number;
    role: 'manager' | 'engineering' | 'ic' | 'bod';
  };
  await env.KV.delete(pendingKey);
  await submitReject(env, msg, pending);
}

// ---------- Commands ----------
async function cmdStart(env: Bindings, msg: TgMessage): Promise<void> {
  await sendMessage(env, {
    chatId: msg.chat.id,
    text:
      `👋 <b>Chào mừng đến AVPG · Phiếu Đề Xuất</b>\n\n` +
      `Bot này gửi thông báo phiếu đề xuất qua Telegram và cho phép duyệt nhanh.\n\n` +
      `<b>Để bắt đầu:</b>\n` +
      `1. Mở web: ${env.APP_BASE_URL}\n` +
      `2. Đăng nhập M365 → Cài đặt → Liên kết Telegram\n` +
      `3. Copy token, gửi cho bot: <code>/link &lt;token&gt;</code>\n\n` +
      `Sau khi link, bot sẽ gửi thông báo + cho phép duyệt qua nút bấm.\n\n` +
      `Gõ /help để xem các lệnh.`,
  });
}

async function cmdHelp(env: Bindings, msg: TgMessage): Promise<void> {
  await sendMessage(env, {
    chatId: msg.chat.id,
    text:
      `<b>Lệnh khả dụng:</b>\n\n` +
      `/start — Hướng dẫn bắt đầu\n` +
      `/link &lt;token&gt; — Liên kết chat với tài khoản M365\n` +
      `/mypending — Phiếu đang chờ tôi duyệt\n` +
      `/help — Xem trợ giúp`,
  });
}

async function cmdLink(env: Bindings, msg: TgMessage, token: string): Promise<void> {
  if (msg.chat.type !== 'private') {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: '⚠️ Vui lòng gửi lệnh /link trong chat riêng với bot (không phải trong group).',
    });
    return;
  }
  if (!token) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: 'Cú pháp: <code>/link &lt;token&gt;</code>\nLấy token từ web → Cài đặt → Liên kết Telegram.',
    });
    return;
  }
  const userId = await env.KV.get(`tg:link:${token}`);
  if (!userId) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: '❌ Token không hợp lệ hoặc đã hết hạn. Mở web sinh token mới.',
    });
    return;
  }
  await env.KV.delete(`tg:link:${token}`);
  await env.DB.prepare(`UPDATE users SET telegram_chat_id = ?2 WHERE id = ?1`)
    .bind(userId, String(msg.chat.id))
    .run();
  const u = await env.DB.prepare(`SELECT display_name FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ display_name: string }>();
  await sendMessage(env, {
    chatId: msg.chat.id,
    text: `✅ Đã liên kết với tài khoản <b>${u?.display_name ?? userId}</b>.\nTừ giờ bot sẽ gửi thông báo phiếu cho bạn ở đây.`,
  });
}

async function cmdMyPending(env: Bindings, msg: TgMessage): Promise<void> {
  if (msg.chat.type !== 'private') return;
  const u = await env.DB.prepare(
    `SELECT id, email FROM users WHERE telegram_chat_id = ?1 LIMIT 1`,
  )
    .bind(String(msg.chat.id))
    .first<{ id: string; email: string }>();
  if (!u) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: '⚠️ Chat này chưa link tài khoản. Gõ /start để xem hướng dẫn.',
    });
    return;
  }
  const emailLower = u.email.toLowerCase();
  const res = await env.DB.prepare(
    `SELECT id, code, title, proposer_name, proposer_dept, status, proposal_type
       FROM proposals
      WHERE (LOWER(manager_email) = ?1 AND status = 'submitted')
         OR (LOWER(engineering_email) = ?1 AND proposal_type = 'purchase'
             AND engineering_required = 1 AND status = 'manager_approved')
         OR (LOWER(ic_email) = ?1 AND proposal_type = 'purchase'
             AND ((engineering_required = 0 AND status = 'manager_approved')
                  OR (engineering_required = 1 AND status = 'en_approved')))
         OR (LOWER(bod_email) = ?1
             AND ((proposal_type = 'general' AND status = 'manager_approved')
                  OR (proposal_type = 'purchase' AND status = 'ic_approved')))
      ORDER BY id DESC LIMIT 20`,
  )
    .bind(emailLower)
    .all<{
      id: number;
      code: string;
      title: string;
      proposer_name: string;
      proposer_dept: string;
      status: string;
      proposal_type: string;
    }>();
  const rows = res.results ?? [];
  if (rows.length === 0) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: '✨ Không có phiếu nào đang chờ bạn duyệt.',
    });
    return;
  }
  const list = rows
    .map((r) => {
      const tag = r.proposal_type === 'purchase' ? '🛒 ' : '';
      return `• ${tag}<code>${r.code}</code> · ${r.title}\n  ${r.proposer_name} (${r.proposer_dept})\n  ${env.APP_BASE_URL}/p/${r.id}`;
    })
    .join('\n\n');
  await sendMessage(env, {
    chatId: msg.chat.id,
    text: `<b>Phiếu chờ duyệt (${rows.length}):</b>\n\n${list}`,
  });
}

type ProposalCtx = {
  id: number;
  code: string;
  status: string;
  proposal_type: 'general' | 'purchase';
  engineering_required: number;
  manager_email: string | null;
  engineering_email: string | null;
  engineering_name: string | null;
  ic_email: string | null;
  ic_name: string | null;
  bod_email: string | null;
  bod_name: string | null;
  proposer_user_id: string;
};

type Role = 'manager' | 'engineering' | 'ic' | 'bod';

// Detect role hợp lệ tại thời điểm callback (email + status match).
function detectRole(p: ProposalCtx, userEmail: string): Role | null {
  const u = userEmail.toLowerCase();
  if (p.status === 'submitted' && p.manager_email?.toLowerCase() === u) return 'manager';
  if (
    p.proposal_type === 'purchase' &&
    p.engineering_required === 1 &&
    p.status === 'manager_approved' &&
    p.engineering_email?.toLowerCase() === u
  )
    return 'engineering';
  if (p.proposal_type === 'purchase' && p.ic_email?.toLowerCase() === u) {
    if (
      (p.engineering_required === 0 && p.status === 'manager_approved') ||
      (p.engineering_required === 1 && p.status === 'en_approved')
    )
      return 'ic';
  }
  // BOD: general → manager_approved; PR → ic_approved.
  if (p.bod_email?.toLowerCase() === u) {
    if (
      (p.proposal_type === 'general' && p.status === 'manager_approved') ||
      (p.proposal_type === 'purchase' && p.status === 'ic_approved')
    )
      return 'bod';
  }
  return null;
}

// Enqueue email + telegram cho 1 email recipient.
async function enqueueNotifyPair(
  env: Bindings,
  proposalId: number,
  event:
    | 'submitted'
    | 'manager_approved'
    | 'engineering_approved'
    | 'ic_approved'
    | 'completed'
    | 'rejected',
  recipientEmail: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
     VALUES (?1, 'email', ?2, ?3, 'pending'),
            (?1, 'telegram', ?2, ?3, 'pending')`,
  )
    .bind(proposalId, event, recipientEmail)
    .run();
}

async function loadProposalCtx(env: Bindings, id: number): Promise<ProposalCtx | null> {
  return await env.DB.prepare(
    `SELECT id, code, status, proposal_type, engineering_required,
            manager_email, engineering_email, engineering_name,
            ic_email, ic_name, bod_email, bod_name, proposer_user_id
       FROM proposals WHERE id = ?1`,
  )
    .bind(id)
    .first<ProposalCtx>();
}

// ---------- Callback handler ----------
async function handleCallback(env: Bindings, cb: TgCallback): Promise<void> {
  const data = cb.data ?? '';
  const m = data.match(/^act:(approve|reject):(\d+)$/);
  if (!m) {
    await answerCallbackQuery(env, cb.id, 'Action không hợp lệ');
    return;
  }
  const action = m[1] as 'approve' | 'reject';
  const proposalId = Number(m[2]);
  const chatId = cb.message?.chat.id;
  if (!chatId) {
    await answerCallbackQuery(env, cb.id, 'Lỗi: thiếu chat context');
    return;
  }

  const u = await env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE telegram_chat_id = ?1 LIMIT 1`,
  )
    .bind(String(chatId))
    .first<{ id: string; email: string; display_name: string }>();
  if (!u) {
    await answerCallbackQuery(env, cb.id, 'Chat chưa link tài khoản. Gõ /start.', true);
    return;
  }

  const p = await loadProposalCtx(env, proposalId);
  if (!p) {
    await answerCallbackQuery(env, cb.id, 'Phiếu không tồn tại', true);
    return;
  }

  const role = detectRole(p, u.email);
  if (!role) {
    await answerCallbackQuery(
      env,
      cb.id,
      'Bạn không có quyền duyệt phiếu này (hoặc trạng thái đã thay đổi)',
      true,
    );
    return;
  }

  if (action === 'approve') {
    await doApprove(env, cb, u, p, role);
  } else {
    // reject — lưu pending, prompt user gõ lý do
    await env.KV.put(
      `tg:pending:${chatId}`,
      JSON.stringify({ kind: 'reject', proposalId, role }),
      { expirationTtl: REJECT_PENDING_TTL },
    );
    await answerCallbackQuery(env, cb.id, 'Vui lòng gõ lý do từ chối');
    await sendMessage(env, {
      chatId,
      text: `❌ Từ chối phiếu <code>${p.code}</code>.\n\n<b>Gõ lý do từ chối</b> trong chat này (có hiệu lực 5 phút).`,
    });
  }
}

async function doApprove(
  env: Bindings,
  cb: TgCallback,
  u: { id: string; email: string; display_name: string },
  p: ProposalCtx,
  role: Role,
): Promise<void> {
  const now = nowIso();
  // Status mới + field timestamp tuỳ role + tuỳ proposal_type.
  let newStatus: string;
  let extraSetSql = '';
  if (role === 'manager') {
    newStatus = 'manager_approved';
    extraSetSql = `, manager_acted_at = ?2`;
  } else if (role === 'engineering') {
    newStatus = 'en_approved';
    extraSetSql = `, engineering_acted_at = ?2`;
  } else if (role === 'ic') {
    newStatus = 'ic_approved';
    extraSetSql = `, ic_acted_at = ?2`;
  } else {
    // bod
    newStatus = 'completed';
    extraSetSql = `, bod_acted_at = ?2, completed_at = ?2`;
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE proposals SET status = ?3, updated_at = ?2 ${extraSetSql} WHERE id = ?1`,
    ).bind(p.id, now, newStatus),
    env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, source)
       VALUES (?1, ?2, ?3, ?4, 'approve', 'telegram')`,
    ).bind(p.id, role, u.email, u.display_name),
  ]);

  // Notify bước kế tiếp + edge auto-skip (chỉ check 1 cấp, không recursive
  // sâu vì chain auto-skip qua Telegram hiếm gặp — fallback: web).
  const proposer = await env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(p.proposer_user_id)
    .first<{ email: string }>();
  const proposerEmail = proposer?.email?.toLowerCase() ?? '';
  const isPr = p.proposal_type === 'purchase';
  const needEn = p.engineering_required === 1;

  // Helper: BOD auto-skip nếu proposer = BOD (final).
  const tryBodAutoSkip = async (): Promise<boolean> => {
    if (!p.bod_email || proposerEmail !== p.bod_email.toLowerCase()) return false;
    const t = nowIso();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE proposals SET status = 'completed', bod_acted_at = ?2, completed_at = ?2, updated_at = ?2 WHERE id = ?1`,
      ).bind(p.id, t),
      env.DB.prepare(
        `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
         VALUES (?1, 'bod', ?2, ?3, 'approve', 'Tự duyệt do là BGĐ', 'telegram')`,
      ).bind(p.id, p.bod_email, p.bod_name ?? p.bod_email),
    ]);
    if (proposer) await enqueueNotifyPair(env, p.id, 'completed', proposer.email);
    if (env.KSNB_TELEGRAM_CHAT_ID) {
      await env.DB.prepare(
        `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
         VALUES (?1, 'telegram', 'bod_approved', ?2, 'pending')`,
      )
        .bind(p.id, env.KSNB_TELEGRAM_CHAT_ID)
        .run();
    }
    return true;
  };

  if (role === 'manager') {
    if (!isPr) {
      // General → BOD next (hoặc auto-skip nếu proposer=BOD).
      const skipped = await tryBodAutoSkip();
      if (!skipped && p.bod_email) {
        await enqueueNotifyPair(env, p.id, 'manager_approved', p.bod_email);
      }
    } else if (needEn && p.engineering_email) {
      await enqueueNotifyPair(env, p.id, 'manager_approved', p.engineering_email);
    } else if (p.ic_email) {
      await enqueueNotifyPair(env, p.id, 'manager_approved', p.ic_email);
    }
  } else if (role === 'engineering') {
    if (p.ic_email) await enqueueNotifyPair(env, p.id, 'engineering_approved', p.ic_email);
  } else if (role === 'ic') {
    const skipped = await tryBodAutoSkip();
    if (!skipped && p.bod_email) {
      await enqueueNotifyPair(env, p.id, 'ic_approved', p.bod_email);
    }
  } else {
    // bod → completed.
    if (proposer) await enqueueNotifyPair(env, p.id, 'completed', proposer.email);
    if (env.KSNB_TELEGRAM_CHAT_ID) {
      await env.DB.prepare(
        `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
         VALUES (?1, 'telegram', 'bod_approved', ?2, 'pending')`,
      )
        .bind(p.id, env.KSNB_TELEGRAM_CHAT_ID)
        .run();
    }
  }

  await answerCallbackQuery(env, cb.id, '✅ Đã duyệt');
  if (cb.message) {
    await editMessageText(env, {
      chatId: cb.message.chat.id,
      messageId: cb.message.message_id,
      text: `✅ <b>Đã duyệt</b> phiếu <code>${p.code}</code> lúc ${formatHHmm()}\n\n${env.APP_BASE_URL}/p/${p.id}`,
    });
  }
  await runNotificationQueue(env);
}

async function submitReject(
  env: Bindings,
  msg: TgMessage,
  pending: { proposalId: number; role: Role },
): Promise<void> {
  const reason = (msg.text ?? '').trim();
  if (!reason) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: 'Lý do không được trống. Bấm Từ chối lại nếu cần.',
    });
    return;
  }
  const u = await env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE telegram_chat_id = ?1 LIMIT 1`,
  )
    .bind(String(msg.chat.id))
    .first<{ id: string; email: string; display_name: string }>();
  if (!u) return;

  const p = await loadProposalCtx(env, pending.proposalId);
  if (!p) return;

  // Re-validate trạng thái + quyền.
  const role = detectRole(p, u.email);
  if (role !== pending.role) {
    await sendMessage(env, {
      chatId: msg.chat.id,
      text: '⚠️ Trạng thái phiếu đã thay đổi, không thể từ chối nữa.',
    });
    return;
  }

  const now = nowIso();
  // Field timestamp theo role.
  const ackField =
    pending.role === 'manager'
      ? 'manager_acted_at'
      : pending.role === 'engineering'
        ? 'engineering_acted_at'
        : pending.role === 'ic'
          ? 'ic_acted_at'
          : 'bod_acted_at';

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE proposals SET status = 'rejected', ${ackField} = ?2, rejected_reason = ?3, updated_at = ?2 WHERE id = ?1`,
    ).bind(p.id, now, reason),
    env.DB.prepare(
      `INSERT INTO approvals (proposal_id, step, actor_email, actor_name, action, comment, source)
       VALUES (?1, ?2, ?3, ?4, 'reject', ?5, 'telegram')`,
    ).bind(p.id, pending.role, u.email, u.display_name, reason),
  ]);

  const proposer = await env.DB.prepare(`SELECT email FROM users WHERE id = ?1`)
    .bind(p.proposer_user_id)
    .first<{ email: string }>();
  if (proposer) await enqueueNotifyPair(env, p.id, 'rejected', proposer.email);
  // BOD reject → notify manager email cho biết.
  if (pending.role === 'bod' && p.manager_email) {
    await env.DB.prepare(
      `INSERT INTO notifications (proposal_id, channel, event, recipient, status)
       VALUES (?1, 'email', 'rejected', ?2, 'pending')`,
    )
      .bind(p.id, p.manager_email)
      .run();
  }

  await sendMessage(env, {
    chatId: msg.chat.id,
    text: `❌ Đã từ chối phiếu <code>${p.code}</code>.\nLý do: ${reason}`,
  });
  await runNotificationQueue(env);
}

function formatHHmm(): string {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

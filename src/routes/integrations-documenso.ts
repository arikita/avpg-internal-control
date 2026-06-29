// Webhook Documenso → tự cập nhật chặng trình ký DNTT.
// Máy-nói-máy: KHÔNG qua đăng nhập; xác thực bằng HMAC webhook secret.
// Documenso bắn DOCUMENT_SIGNED mỗi khi 1 người ký (payload.recipients có signingStatus
// của TẤT CẢ recipient) + DOCUMENT_COMPLETED khi xong hết. Ta reconcile từ payload.
// Xem docs/documenso-dntt-integration.md.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { prStages } from './payments';
import { downloadDocumentPdf, verifyWebhookSecret } from '../lib/documenso';
import { logAudit } from '../lib/audit';
import { enqueueInbox } from '../lib/inbox';
import { nowIso } from '../lib/time';

// Nhãn vai trò người ký để hiện trong thông báo cho người tạo phiếu.
const ROLE_LABEL: Record<string, string> = {
  manager: 'Trưởng bộ phận',
  ksnb: 'KSNB',
  acct: 'Kế toán',
  bod: 'Ban giám đốc',
};

export const documensoRoutes = new Hono<AppEnv>();

type WebhookBody = {
  event?: string;
  payload?: {
    id?: number;
    title?: string;
    status?: string;
    completedAt?: string | null;
    recipients?: Array<{ id?: number; email?: string; signingStatus?: string; signedAt?: string | null }>;
  };
};

type SignerRow = {
  id: number;
  role: string;
  recipient_id: number | null;
  email: string;
  name: string | null;
  signed_at: string | null;
};

// chặng đang CHỜ ký = 1 + số người (manager + 2 mid) đã ký, tối đa 4 (chờ BOD).
function computeStage(signedPreBod: number): number {
  return 1 + Math.min(signedPreBod, 3);
}

documensoRoutes.post('/webhook', async (c) => {
  const raw = await c.req.text();
  const secretHeader = c.req.header('x-documenso-secret') ?? null;
  const ok = verifyWebhookSecret(c.env.DOCUMENSO_WEBHOOK_SECRET, secretHeader);
  if (!ok) {
    console.warn('[documenso-webhook] secret không khớp');
    return c.json({ ok: false, error: 'bad secret' }, 401);
  }
  if (!c.env.DOCUMENSO_WEBHOOK_SECRET) {
    console.warn('[documenso-webhook] CHƯA cấu hình DOCUMENSO_WEBHOOK_SECRET — bỏ qua xác thực');
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return c.json({ ok: false, error: 'bad json' }, 400);
  }

  const docId = body.payload?.id;
  if (!docId) return c.json({ ok: true, ignored: 'no document id' });

  const pr = await c.env.DB.prepare(
    `SELECT id, code, creator_email, current_stage, mid_order, status FROM payment_request WHERE documenso_document_id = ?1`,
  )
    .bind(docId)
    .first<{ id: number; code: string | null; creator_email: string | null; current_stage: number; mid_order: string | null; status: string }>();
  if (!pr) return c.json({ ok: true, ignored: `no payment_request for document ${docId}` });

  const event = body.event ?? '';
  const recips = body.payload?.recipients ?? [];

  // 1) Cập nhật signed_at cho từng signer theo recipient_id (fallback email).
  const signers =
    (
      await c.env.DB.prepare(
        `SELECT id, role, recipient_id, email, name, signed_at FROM payment_request_signer WHERE pr_id = ?1`,
      )
        .bind(pr.id)
        .all<SignerRow>()
    ).results ?? [];

  const now = nowIso();
  for (const r of recips) {
    if ((r.signingStatus ?? '') !== 'SIGNED') continue;
    const match =
      signers.find((s) => r.id != null && s.recipient_id === r.id) ??
      signers.find((s) => (r.email ?? '').toLowerCase() === s.email.toLowerCase());
    if (match && !match.signed_at) {
      const at = r.signedAt || now;
      match.signed_at = at;
      await c.env.DB.prepare(`UPDATE payment_request_signer SET signed_at = ?2 WHERE id = ?1`)
        .bind(match.id, at)
        .run();

      // Thông báo in-app cho người tạo phiếu: ai vừa ký. (Một lần/người vì gác bằng signed_at.)
      if (pr.creator_email) {
        const roleLabel = ROLE_LABEL[match.role] ?? match.role;
        const who = match.name || match.email;
        await enqueueInbox(c.env, {
          recipient: pr.creator_email,
          kind: 'pr_signed',
          title: `${roleLabel} đã ký phiếu ${pr.code ?? `#${pr.id}`}`,
          body: `${who} đã ký điện tử.`,
          link: `/payments/${pr.id}`,
          prId: pr.id,
        });
      }
    }
  }

  // 2) Suy mid_order: bên mid (ksnb/acct) ký TRƯỚC.
  let midOrder = pr.mid_order;
  if (!midOrder) {
    const mids = signers
      .filter((s) => (s.role === 'ksnb' || s.role === 'acct') && s.signed_at)
      .sort((a, b) => String(a.signed_at).localeCompare(String(b.signed_at)));
    if (mids[0]) midOrder = mids[0].role;
  }

  // 3) Tính chặng từ số người đã ký (manager + 2 mid). BOD ký xong → completed.
  const signedRoles = new Set(signers.filter((s) => s.signed_at).map((s) => s.role));
  const preBod = ['manager', 'ksnb', 'acct'].filter((r) => signedRoles.has(r)).length;
  const completed = event === 'DOCUMENT_COMPLETED' || signedRoles.has('bod');

  let newStage = computeStage(preBod); // 1..4
  let docStatus = body.payload?.status ?? null;

  // 4) Hoàn tất ký → kéo PDF đã ký về FILES (nếu chưa có).
  if (completed) {
    newStage = 4; // đã ký xong; chờ "Đã thanh toán" (stage 5) thủ công
    docStatus = 'COMPLETED';

    // Thông báo hoàn tất ký cho người tạo — chỉ lần đầu (gác bằng current_stage < 4).
    if (pr.creator_email && pr.current_stage < 4) {
      await enqueueInbox(c.env, {
        recipient: pr.creator_email,
        kind: 'pr_completed',
        title: `Phiếu ${pr.code ?? `#${pr.id}`} đã ký xong`,
        body: 'Tất cả đã ký điện tử. Phiếu chờ thanh toán.',
        link: `/payments/${pr.id}`,
        prId: pr.id,
      });
    }

    try {
      const existing = await c.env.DB.prepare(`SELECT signed_pdf_key FROM payment_request WHERE id = ?1`)
        .bind(pr.id)
        .first<{ signed_pdf_key: string | null }>();
      if (!existing?.signed_pdf_key) {
        const bytes = await downloadDocumentPdf(c.env, docId);
        const saved = await c.env.FILES.put(bytes);
        await c.env.DB.prepare(
          `UPDATE payment_request SET signed_pdf_key = ?2, signed_pdf_sha256 = ?3, signed_completed_at = ?4 WHERE id = ?1`,
        )
          .bind(pr.id, saved.key, saved.sha256, now)
          .run();
      }
    } catch (err) {
      console.error('[documenso-webhook] kéo PDF đã ký thất bại', err);
    }
  }

  if (event === 'DOCUMENT_REJECTED') docStatus = 'REJECTED';
  if (event === 'DOCUMENT_CANCELLED') docStatus = 'CANCELLED';

  const stages = prStages(midOrder);
  const stageChanged = newStage !== pr.current_stage && pr.status !== 'cancelled' && !completed
    ? true
    : completed && pr.current_stage < 4;

  // 5) Cập nhật phiếu + ghi vết (chỉ khi có thay đổi chặng để tránh nhân đôi).
  if (pr.status !== 'cancelled') {
    const status = newStage >= 5 ? 'paid' : newStage <= 0 ? 'draft' : 'in_progress';
    await c.env.DB.prepare(
      `UPDATE payment_request SET current_stage = ?2, status = ?3, mid_order = ?4, documenso_status = ?5, updated_at = iso_now() WHERE id = ?1`,
    )
      .bind(pr.id, newStage, status, midOrder, docStatus)
      .run();

    if (stageChanged) {
      const label = completed ? 'Đã ký xong (chờ thanh toán)' : (stages[newStage] ?? '?');
      await c.env.DB.prepare(
        `INSERT INTO payment_request_stage_log (pr_id, stage_index, stage_name, kind, actor_email, actor_name, note)
         VALUES (?1,?2,?3,'advance',?4,?5,?6)`,
      )
        .bind(pr.id, newStage, label, 'documenso@system', 'Documenso', `Cập nhật từ Documenso (${event})`)
        .run();
      await logAudit(c.env, {
        eventType: 'pr_advance',
        actorEmail: 'documenso@system',
        actorName: 'Documenso',
        proposalId: pr.id,
        step: label,
        action: 'advance',
        channel: 'web',
        detail: JSON.stringify({ doc: 'payment_request', source: 'documenso', event, to: newStage, documentId: docId }),
      });
    }
  }

  return c.json({ ok: true, stage: newStage, completed });
});

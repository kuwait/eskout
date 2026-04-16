// src/lib/email.ts
// Email sending via Resend — used for task assignment notifications
// Fire-and-forget: errors are logged but never block the caller
// RELEVANT FILES: src/actions/notifications.ts, src/lib/supabase/server.ts

import { Resend } from 'resend';

/* ───────────── Client (lazy init — avoids crash when RESEND_API_KEY is not set) ───────────── */

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/** Default sender — must be verified in Resend dashboard (or use onboarding@resend.dev for testing) */
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Eskout <onboarding@resend.dev>';

/* ───────────── Types ───────────── */

export interface TaskEmailData {
  /** Recipient email */
  to: string;
  /** Recipient name */
  recipientName: string;
  /** Who assigned/created the task */
  assignedByName: string;
  /** Task title (e.g. "📞 Contactar João Silva — Vir Treinar") */
  taskTitle: string;
  /** Task source for context-specific content */
  taskSource: string;
  /** Player name (null for manual tasks without player) */
  playerName: string | null;
  /** Player club */
  playerClub: string | null;
  /** Player photo URL */
  playerPhotoUrl: string | null;
  /** Player contact number */
  playerContact: string | null;
  /** Player position (e.g. "DC", "MC") */
  playerPosition: string | null;
  /** Player date of birth (e.g. "2012-03-15") */
  playerDob: string | null;
  /** Player preferred foot (e.g. "Dir", "Esq", "Amb") */
  playerFoot: string | null;
  /** FPF profile link */
  playerFpfLink: string | null;
  /** ZeroZero profile link */
  playerZzLink: string | null;
  /** Contact purpose (only for pipeline_contact tasks) */
  contactPurpose: string | null;
  /** Due date (formatted string) */
  dueDate: string | null;
  /** Training escalão */
  trainingEscalao: string | null;
  /** Direct link to tasks page */
  tasksUrl: string;
  /** Club name */
  clubName: string;
  /** Tipo de notificação — afecta subject e intro do email (Fase 6 training sessions) */
  kind?: 'created' | 'rescheduled' | 'cancelled';
}

/* ───────────── Send ───────────── */

/**
 * Send a task assignment notification email.
 * Fire-and-forget — logs errors but never throws.
 */
export async function sendTaskEmail(data: TaskEmailData): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping email');
    return;
  }

  try {
    const subject = buildSubject(data);
    const html = buildTaskEmailHtml(data);

    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject,
      html,
    });
  } catch (err) {
    // Never block the calling action — log and move on
    console.error('[email] Failed to send task notification:', err);
  }
}

/* ───────────── Subject + intro helpers (Fase 6 training sessions) ───────────── */

function buildSubject(data: TaskEmailData): string {
  const title = stripEmoji(stripPurposeSuffix(data.taskTitle));
  switch (data.kind) {
    case 'rescheduled':
      return `Treino alterado${data.playerName ? ` — ${data.playerName}` : ''}`;
    case 'cancelled':
      return `Treino cancelado${data.playerName ? ` — ${data.playerName}` : ''}`;
    case 'created':
    default:
      return `Nova tarefa: ${title}`;
  }
}

function buildIntro(data: TaskEmailData): string {
  const who = `<strong>${escapeHtml(data.assignedByName)}</strong>`;
  switch (data.kind) {
    case 'rescheduled':
      return `${who} alterou a data de um treino:`;
    case 'cancelled':
      return `${who} cancelou um treino:`;
    case 'created':
    default:
      return `${who} atribuiu-te uma nova tarefa:`;
  }
}

/* ───────────── HTML Template ───────────── */

export function buildTaskEmailHtml(data: TaskEmailData): string {
  const details = buildDetailsSection(data);

  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
    <!-- Header -->
    <div style="background:#1a1a1a;padding:20px 24px">
      <h1 style="margin:0;color:#fff;font-size:16px;font-weight:600">Eskout · ${escapeHtml(data.clubName)}</h1>
    </div>

    <!-- Body -->
    <div style="padding:24px">
      <p style="margin:0 0 8px;font-size:14px;color:#525252">
        Olá <strong>${escapeHtml(data.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#525252">
        ${buildIntro(data)}
      </p>

      <!-- Task card -->
      <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a1a">
          ${escapeHtml(stripPurposeSuffix(data.taskTitle))}
        </p>
        ${details}
      </div>

      <!-- CTA -->
      <a href="${escapeHtml(data.tasksUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600">
        ${data.kind === 'cancelled' ? 'Ver detalhes' : data.kind === 'rescheduled' ? 'Ver nova data' : 'Ver Tarefas'}
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;border-top:1px solid #f0f0f0">
      <p style="margin:0;font-size:11px;color:#a3a3a3">
        Podes desativar notificações por email em Preferências.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** Build context-specific detail rows */
function buildDetailsSection(data: TaskEmailData): string {
  const rows: string[] = [];

  if (data.playerName) {
    rows.push(detailRow('Jogador', data.playerName));
  }
  if (data.playerClub) {
    rows.push(detailRow('Clube', data.playerClub));
  }
  if (data.playerPosition) {
    rows.push(detailRow('Posição', data.playerPosition));
  }
  if (data.playerDob) {
    // Format DOB to dd/MM/yyyy + age
    const dobDate = new Date(data.playerDob);
    const age = Math.floor((Date.now() - dobDate.getTime()) / 31557600000);
    const dobFormatted = dobDate.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    rows.push(detailRow('Nascimento', `${dobFormatted} (${age} anos)`));
  }
  if (data.playerFoot) {
    const footMap: Record<string, string> = { Dir: 'Direito', Esq: 'Esquerdo', Amb: 'Ambidestro' };
    rows.push(detailRow('Pé', footMap[data.playerFoot] ?? data.playerFoot));
  }
  if (data.playerContact) {
    rows.push(detailRow('Contacto', `<a href="tel:${escapeHtml(data.playerContact)}" style="color:#3b82f6;text-decoration:none">${escapeHtml(data.playerContact)}</a>`));
  }
  // External profile links (text only)
  const links: string[] = [];
  if (data.playerFpfLink) links.push(`<a href="${escapeHtml(data.playerFpfLink)}" style="color:#3b82f6;text-decoration:none">FPF</a>`);
  if (data.playerZzLink) links.push(`<a href="${escapeHtml(data.playerZzLink)}" style="color:#3b82f6;text-decoration:none">ZeroZero</a>`);
  if (links.length > 0) {
    rows.push(detailRow('Perfis', links.join(' &nbsp;·&nbsp; ')));
  }
  if (data.contactPurpose) {
    rows.push(detailRow('Objetivo', data.contactPurpose));
  }
  if (data.trainingEscalao) {
    rows.push(detailRow('Escalão', data.trainingEscalao));
  }
  if (data.dueDate) {
    rows.push(detailRow('Data', data.dueDate));
  }

  if (rows.length === 0) return '';

  return `<table style="width:100%;border-collapse:collapse;font-size:13px;color:#525252">${rows.join('')}</table>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:3px 8px 3px 0;font-weight:500;color:#737373;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:3px 0;vertical-align:top">${value}</td>
  </tr>`;
}

/* ───────────── Helpers ───────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip contact purpose suffix from task title (e.g. "Contactar João — Vir Treinar" → "Contactar João") */
function stripPurposeSuffix(str: string): string {
  const idx = str.indexOf(' — ');
  return idx > 0 ? str.slice(0, idx) : str;
}

/** Strip emoji prefix from task title for email subject */
function stripEmoji(str: string): string {
  return str.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

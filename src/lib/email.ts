// src/lib/email.ts
// Email sending via Resend — used for task assignment notifications
// Fire-and-forget: errors are logged but never block the caller
// RELEVANT FILES: src/actions/notifications.ts, src/lib/supabase/server.ts

import { Resend } from 'resend';

/* ───────────── Client ───────────── */

const resend = new Resend(process.env.RESEND_API_KEY);

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
  /** Player contact number */
  playerContact: string | null;
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
}

/* ───────────── Send ───────────── */

/**
 * Send a task assignment notification email.
 * Fire-and-forget — logs errors but never throws.
 */
export async function sendTaskEmail(data: TaskEmailData): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email');
    return;
  }

  try {
    const subject = `Nova tarefa: ${stripEmoji(data.taskTitle)}`;
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

/* ───────────── HTML Template ───────────── */

function buildTaskEmailHtml(data: TaskEmailData): string {
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
        <strong>${escapeHtml(data.assignedByName)}</strong> atribuiu-te uma nova tarefa:
      </p>

      <!-- Task card -->
      <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a1a">
          ${escapeHtml(data.taskTitle)}
        </p>
        ${details}
      </div>

      <!-- CTA -->
      <a href="${escapeHtml(data.tasksUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600">
        Ver Tarefas
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
  if (data.playerContact) {
    rows.push(detailRow('Contacto', `<a href="tel:${escapeHtml(data.playerContact)}" style="color:#3b82f6;text-decoration:none">${escapeHtml(data.playerContact)}</a>`));
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

/** Strip emoji prefix from task title for email subject */
function stripEmoji(str: string): string {
  return str.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '').trim();
}

// src/actions/notifications.ts
// Server-side notification dispatcher — sends email when tasks are assigned to other users
// Checks user preferences before sending, fetches email from auth.users via service role
// RELEVANT FILES: src/lib/email.ts, src/actions/tasks.ts, src/actions/pipeline.ts

import { createServiceClient } from '@/lib/supabase/server';
import { sendTaskEmail, type TaskEmailData } from '@/lib/email';

/* ───────────── Types ───────────── */

/** Training-sessions notification kind — controls subject + intro tone */
export type NotificationKind = 'created' | 'rescheduled' | 'cancelled';

export interface TaskNotificationContext {
  /** Club ID for preference lookup */
  clubId: string;
  /** Club name for email header */
  clubName: string;
  /** User who assigned/created the task */
  assignedByUserId: string;
  assignedByName: string;
  /** User who receives the task */
  targetUserId: string;
  /** Task details */
  taskTitle: string;
  taskSource: string;
  /** Player context (null for manual tasks without player) */
  playerName: string | null;
  playerClub: string | null;
  playerPhotoUrl: string | null;
  playerContact: string | null;
  playerPosition: string | null;
  playerDob: string | null;
  playerFoot: string | null;
  playerFpfLink: string | null;
  playerZzLink: string | null;
  /** Contact purpose label (only for pipeline_contact) */
  contactPurpose: string | null;
  /** Due date ISO string */
  dueDate: string | null;
  /** Training escalão */
  trainingEscalao: string | null;
  /** Kind (training-sessions Fase 6). Default 'created' para manter compat. */
  kind?: NotificationKind;
}

/* ───────────── Main ───────────── */

/**
 * Send email notification for a task assignment.
 * Skips silently if:
 * - Target user is the same as assigner (self-assignment)
 * - Target user has disabled email notifications
 * - Target user email not found
 * - RESEND_API_KEY not configured
 *
 * Fire-and-forget — never throws, never blocks caller.
 */
export async function notifyTaskAssigned(ctx: TaskNotificationContext): Promise<void> {
  try {
    // Skip self-assignment — no email when assigning to yourself
    if (ctx.assignedByUserId === ctx.targetUserId) return;

    const serviceClient = await createServiceClient();

    // Check notification preferences (default: all enabled)
    const { data: prefs } = await serviceClient
      .from('user_notification_preferences')
      .select('email_all, email_on_contact, email_on_meeting, email_on_training, email_on_signing')
      .eq('user_id', ctx.targetUserId)
      .eq('club_id', ctx.clubId)
      .maybeSingle();

    if (prefs) {
      // Master toggle — disables all
      if (prefs.email_all === false) return;

      // Granular toggles per task source
      const sourceToField: Record<string, boolean | null> = {
        pipeline_contact: prefs.email_on_contact,
        pipeline_meeting: prefs.email_on_meeting,
        pipeline_training: prefs.email_on_training,
        pipeline_signing: prefs.email_on_signing,
      };
      const fieldValue = sourceToField[ctx.taskSource];
      if (fieldValue === false) return;
    }

    // Fetch target user's email and name from auth + profiles
    const { data: authData } = await serviceClient.auth.admin.getUserById(ctx.targetUserId);
    const email = authData?.user?.email;
    if (!email) return;

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', ctx.targetUserId)
      .single();

    const recipientName = profile?.full_name ?? 'Utilizador';

    // Format due date — use string slicing to avoid timezone conversion
    // (pipeline dates are wall-clock values stored without meaningful offset)
    let formattedDate: string | null = null;
    if (ctx.dueDate) {
      try {
        const datePart = ctx.dueDate.slice(0, 10);
        const [year, month, day] = datePart.split('-').map(Number);
        // Build weekday + day + month via Date at noon (avoids DST boundary)
        const d = new Date(year, month - 1, day, 12);
        const weekday = d.toLocaleString('pt-PT', { weekday: 'long' });
        const monthName = d.toLocaleString('pt-PT', { month: 'long' });
        const timePart = ctx.dueDate.length > 10 && ctx.dueDate.includes('T') ? ctx.dueDate.slice(11, 16) : null;
        const hasTime = timePart && timePart !== '00:00';
        formattedDate = hasTime
          ? `${weekday}, ${day} ${monthName}, ${timePart}`
          : `${weekday}, ${day} ${monthName}`;
      } catch {
        formattedDate = ctx.dueDate;
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eskout.com';

    const emailData: TaskEmailData = {
      to: email,
      recipientName,
      assignedByName: ctx.assignedByName,
      taskTitle: ctx.taskTitle,
      taskSource: ctx.taskSource,
      playerName: ctx.playerName,
      playerClub: ctx.playerClub,
      playerPhotoUrl: ctx.playerPhotoUrl,
      playerContact: ctx.playerContact,
      playerPosition: ctx.playerPosition,
      playerDob: ctx.playerDob,
      playerFoot: ctx.playerFoot,
      playerFpfLink: ctx.playerFpfLink,
      playerZzLink: ctx.playerZzLink,
      contactPurpose: ctx.contactPurpose,
      dueDate: formattedDate,
      trainingEscalao: ctx.trainingEscalao,
      tasksUrl: `${appUrl}/tarefas`,
      clubName: ctx.clubName,
      kind: ctx.kind ?? 'created',
    };

    await sendTaskEmail(emailData);
  } catch (err) {
    // Never block the calling action
    console.error('[notifications] Failed to send task notification:', err);
  }
}

// src/actions/notifications.ts
// Server-side notification dispatcher — sends email when tasks are assigned to other users
// Checks user preferences before sending, fetches email from auth.users via service role
// RELEVANT FILES: src/lib/email.ts, src/actions/tasks.ts, src/actions/pipeline.ts

import { createServiceClient } from '@/lib/supabase/server';
import { sendTaskEmail, type TaskEmailData } from '@/lib/email';

/* ───────────── Types ───────────── */

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
  playerContact: string | null;
  /** Contact purpose label (only for pipeline_contact) */
  contactPurpose: string | null;
  /** Due date ISO string */
  dueDate: string | null;
  /** Training escalão */
  trainingEscalao: string | null;
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
    // Skip self-assignment
    if (ctx.assignedByUserId === ctx.targetUserId) return;

    const serviceClient = await createServiceClient();

    // Check notification preferences (default: enabled)
    const { data: prefs } = await serviceClient
      .from('user_notification_preferences')
      .select('email_on_task_assigned')
      .eq('user_id', ctx.targetUserId)
      .eq('club_id', ctx.clubId)
      .maybeSingle();

    // If preference row exists and email is disabled, skip
    if (prefs && prefs.email_on_task_assigned === false) return;

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

    // Format due date
    let formattedDate: string | null = null;
    if (ctx.dueDate) {
      try {
        formattedDate = new Date(ctx.dueDate).toLocaleString('pt-PT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        });
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
      playerContact: ctx.playerContact,
      contactPurpose: ctx.contactPurpose,
      dueDate: formattedDate,
      trainingEscalao: ctx.trainingEscalao,
      tasksUrl: `${appUrl}/tarefas`,
      clubName: ctx.clubName,
    };

    await sendTaskEmail(emailData);
  } catch (err) {
    // Never block the calling action
    console.error('[notifications] Failed to send task notification:', err);
  }
}

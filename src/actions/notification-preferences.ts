// src/actions/notification-preferences.ts
// Server Actions for user notification preferences (email opt-in/opt-out)
// Each user can toggle email notifications per club
// RELEVANT FILES: src/app/preferencias/page.tsx, src/actions/notifications.ts, supabase/migrations/069_notification_preferences.sql

'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Read ───────────── */

/** Get whether email notifications are enabled for the current user+club (default: true) */
export async function getEmailNotificationsEnabled(): Promise<boolean> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_notification_preferences')
    .select('email_on_task_assigned')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle();

  // Default: enabled (no row = enabled)
  return data?.email_on_task_assigned ?? true;
}

/* ───────────── Write ───────────── */

/** Toggle email notifications for the current user+club */
export async function setEmailNotificationsEnabled(enabled: boolean): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Upsert — create or update
  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: userId,
        club_id: clubId,
        email_on_task_assigned: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,club_id' }
    );

  if (error) {
    return { success: false, error: `Erro ao guardar preferência: ${error.message}` };
  }

  return { success: true };
}

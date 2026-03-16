// src/actions/notification-preferences.ts
// Server Actions for user notification preferences (email opt-in/opt-out)
// Granular toggles per task type + master toggle
// RELEVANT FILES: src/app/preferencias/page.tsx, src/actions/notifications.ts, supabase/migrations/069_notification_preferences.sql

'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface NotificationPreferences {
  emailAll: boolean;
  emailOnContact: boolean;
  emailOnMeeting: boolean;
  emailOnTraining: boolean;
  emailOnSigning: boolean;
}

const DEFAULTS: NotificationPreferences = {
  emailAll: true,
  emailOnContact: true,
  emailOnMeeting: true,
  emailOnTraining: true,
  emailOnSigning: true,
};

/* ───────────── Read ───────────── */

/** Get notification preferences for the current user+club (defaults: all enabled) */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_notification_preferences')
    .select('email_all, email_on_contact, email_on_meeting, email_on_training, email_on_signing')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .maybeSingle();

  if (!data) return DEFAULTS;

  return {
    emailAll: data.email_all ?? true,
    emailOnContact: data.email_on_contact ?? true,
    emailOnMeeting: data.email_on_meeting ?? true,
    emailOnTraining: data.email_on_training ?? true,
    emailOnSigning: data.email_on_signing ?? true,
  };
}

/* ───────────── Write ───────────── */

/** Update notification preferences for the current user+club */
export async function updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    user_id: userId,
    club_id: clubId,
    updated_at: new Date().toISOString(),
  };

  if (prefs.emailAll !== undefined) payload.email_all = prefs.emailAll;
  if (prefs.emailOnContact !== undefined) payload.email_on_contact = prefs.emailOnContact;
  if (prefs.emailOnMeeting !== undefined) payload.email_on_meeting = prefs.emailOnMeeting;
  if (prefs.emailOnTraining !== undefined) payload.email_on_training = prefs.emailOnTraining;
  if (prefs.emailOnSigning !== undefined) payload.email_on_signing = prefs.emailOnSigning;

  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert(payload, { onConflict: 'user_id,club_id' });

  if (error) {
    return { success: false, error: `Erro ao guardar preferências: ${error.message}` };
  }

  return { success: true };
}

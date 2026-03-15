// src/actions/scraping/fpf-competitions/permissions.ts
// Manage delegated access to FPF competition data — superadmin grants/revokes viewing rights
// Controls the can_view_competitions flag on profiles (independent of club roles)
// RELEVANT FILES: src/lib/supabase/club-context.ts, src/middleware.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Auth Helper ───────────── */

async function requireSuperadmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin) return null;
  return { supabase, userId: user.id };
}

/* ───────────── Types ───────────── */

export interface CompetitionUser {
  id: string;
  name: string;
  email: string;
  canViewCompetitions: boolean;
  isSuperadmin: boolean;
}

/* ───────────── Get Users with Access ───────────── */

/** List all users with their competition access status */
export async function getCompetitionUsers(): Promise<ActionResponse<CompetitionUser[]>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('id, name, email, can_view_competitions, is_superadmin')
    .order('name');

  if (error) return { success: false, error: error.message };

  const users: CompetitionUser[] = (data ?? []).map((p: {
    id: string;
    name: string | null;
    email: string | null;
    can_view_competitions: boolean;
    is_superadmin: boolean;
  }) => ({
    id: p.id,
    name: p.name ?? '',
    email: p.email ?? '',
    canViewCompetitions: p.can_view_competitions ?? false,
    isSuperadmin: p.is_superadmin ?? false,
  }));

  return { success: true, data: users };
}

/* ───────────── Grant Access ───────────── */

export async function grantCompetitionAccess(userId: string): Promise<ActionResponse<void>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const { error } = await auth.supabase
    .from('profiles')
    .update({ can_view_competitions: true })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

/* ───────────── Revoke Access ───────────── */

export async function revokeCompetitionAccess(userId: string): Promise<ActionResponse<void>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  // Don't allow revoking from superadmins (they always have access via is_superadmin)
  const { data: target } = await auth.supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', userId)
    .single();

  if (target?.is_superadmin) {
    return { success: false, error: 'Superadmins têm sempre acesso' };
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({ can_view_competitions: false })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// src/actions/clubs.ts
// Server Actions for club management — selection, creation (superadmin), and membership
// Used by club picker, superadmin panel, and invitation system
// RELEVANT FILES: src/lib/supabase/club-context.ts, src/app/escolher-clube/page.tsx, src/app/master/clubes/page.tsx

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { setActiveClub, CLUB_COOKIE } from '@/lib/supabase/club-context';
import type { ActionResponse, UserRole } from '@/lib/types';
import { cookies } from 'next/headers';

/* ───────────── Select Club (for club picker) ───────────── */

export async function selectClub(clubId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  // Verify membership (service client to bypass RLS)
  const service = await createServiceClient();
  const { data: membership } = await service
    .from('club_memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .single();

  if (!membership) throw new Error('Sem acesso a este clube');

  await setActiveClub(clubId);
  redirect('/');
}

/* ───────────── Clear Club Selection (for switching) ───────────── */

export async function clearClubSelection(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CLUB_COOKIE);
  redirect('/escolher-clube');
}

/* ───────────── Create Club (superadmin only) ───────────── */

export async function createClub(data: {
  name: string;
  slug: string;
  logoUrl?: string;
}): Promise<ActionResponse<{ id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Verify superadmin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_superadmin) return { success: false, error: 'Acesso negado' };

  const service = await createServiceClient();

  // Validate slug uniqueness
  const { data: existing } = await service
    .from('clubs')
    .select('id')
    .eq('slug', data.slug)
    .maybeSingle();
  if (existing) return { success: false, error: 'Slug já existe' };

  const { data: club, error } = await service
    .from('clubs')
    .insert({
      name: data.name,
      slug: data.slug,
      logo_url: data.logoUrl || null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/master/clubes');
  return { success: true, data: { id: club!.id } };
}

/* ───────────── Update Club (superadmin only) ───────────── */

export async function updateClub(
  clubId: string,
  updates: { name?: string; logoUrl?: string; isActive?: boolean; features?: Record<string, boolean> }
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_superadmin) return { success: false, error: 'Acesso negado' };

  const service = await createServiceClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;
  if (updates.features !== undefined) payload.features = updates.features;

  const { error } = await service
    .from('clubs')
    .update(payload)
    .eq('id', clubId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/master/clubes');
  return { success: true };
}

/* ───────────── Update Club Details (club admin or superadmin) ───────────── */

export async function updateMyClubDetails(
  updates: { name?: string; logoUrl?: string }
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Get active club from cookie
  const cookieStore = await cookies();
  const clubId = cookieStore.get(CLUB_COOKIE)?.value;
  if (!clubId) return { success: false, error: 'Nenhum clube selecionado' };

  // Verify user is admin of this club or superadmin
  const { data: membership } = await supabase
    .from('club_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .single();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  const isAdmin = membership?.role === 'admin';
  const isSuperadmin = profile?.is_superadmin ?? false;

  if (!isAdmin && !isSuperadmin) {
    return { success: false, error: 'Sem permissão — apenas admins podem alterar dados do clube' };
  }

  const service = await createServiceClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl.trim() || null;

  const { error } = await service
    .from('clubs')
    .update(payload)
    .eq('id', clubId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/definicoes');
  revalidatePath('/escolher-clube');
  revalidatePath('/');
  return { success: true };
}

/* ───────────── Invite User to Club ───────────── */

export async function inviteUserToClub(
  clubId: string,
  email: string,
  role: UserRole,
  fullName: string,
): Promise<ActionResponse> {
  const service = await createServiceClient();
  const supabase = await createClient();

  // Verify caller is club admin or superadmin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  const isSuperadmin = profile?.is_superadmin ?? false;

  if (!isSuperadmin) {
    // Check if club admin
    const { data: membership } = await supabase
      .from('club_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();
    if (membership?.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
  }

  // Check if user already exists by email
  const { data: authData } = await service.auth.admin.listUsers();
  const existingUser = authData?.users?.find((u) => u.email === email);

  if (existingUser) {
    // Check if already a member of this club
    const { data: existingMembership } = await service
      .from('club_memberships')
      .select('id')
      .eq('user_id', existingUser.id)
      .eq('club_id', clubId)
      .maybeSingle();

    if (existingMembership) {
      return { success: false, error: 'Este utilizador já é membro deste clube' };
    }

    // Create membership for existing user
    const { error: membershipErr } = await service
      .from('club_memberships')
      .insert({
        user_id: existingUser.id,
        club_id: clubId,
        role,
        invited_by: user.id,
      });

    if (membershipErr) return { success: false, error: membershipErr.message };
  } else {
    // Create new user via invite
    const { data: newUser, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
    });

    if (inviteErr) {
      if (inviteErr.message.includes('already been registered')) {
        return { success: false, error: 'Este email já está registado' };
      }
      return { success: false, error: inviteErr.message };
    }

    if (!newUser.user) return { success: false, error: 'Erro ao criar utilizador' };

    // Create profile
    await service.from('profiles').upsert({
      id: newUser.user.id,
      full_name: fullName,
      role, // Legacy field — kept for backward compat
    });

    // Create membership
    const { error: membershipErr } = await service
      .from('club_memberships')
      .insert({
        user_id: newUser.user.id,
        club_id: clubId,
        role,
        invited_by: user.id,
      });

    if (membershipErr) return { success: false, error: membershipErr.message };
  }

  revalidatePath('/admin/utilizadores');
  revalidatePath(`/master/clubes/${clubId}`);
  return { success: true };
}

/* ───────────── Update Club Membership Role ───────────── */

export async function updateMembershipRole(
  membershipId: string,
  newRole: UserRole,
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const service = await createServiceClient();

  // Fetch the membership to verify ownership
  const { data: membership } = await service
    .from('club_memberships')
    .select('user_id, club_id')
    .eq('id', membershipId)
    .single();

  if (!membership) return { success: false, error: 'Membro não encontrado' };

  // Prevent self-demotion
  if (membership.user_id === user.id) {
    return { success: false, error: 'Não podes alterar o teu próprio role' };
  }

  const { error } = await service
    .from('club_memberships')
    .update({ role: newRole })
    .eq('id', membershipId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/utilizadores');
  return { success: true };
}

/* ───────────── Remove Club Membership ───────────── */

export async function removeMembership(
  membershipId: string,
): Promise<ActionResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const service = await createServiceClient();

  // Fetch the membership
  const { data: membership } = await service
    .from('club_memberships')
    .select('user_id')
    .eq('id', membershipId)
    .single();

  if (!membership) return { success: false, error: 'Membro não encontrado' };

  // Prevent self-removal
  if (membership.user_id === user.id) {
    return { success: false, error: 'Não podes remover-te a ti próprio' };
  }

  const { error } = await service
    .from('club_memberships')
    .delete()
    .eq('id', membershipId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/utilizadores');
  return { success: true };
}

/* ───────────── Seed Age Groups for Club ───────────── */

export async function seedAgeGroupsForClub(clubId: string): Promise<ActionResponse> {
  const service = await createServiceClient();

  // Dynamic age group calculation (same logic as constants.ts)
  const now = new Date();
  const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const season = `${startYear}/${endYear}`;

  const groups = [
    { name: 'Sénior', generation_year: endYear - 20 },
    ...[19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7].map((n) => ({
      name: `Sub-${n}`,
      generation_year: endYear - n,
    })),
  ];

  const rows = groups.map((g) => ({
    club_id: clubId,
    name: g.name,
    generation_year: g.generation_year,
    season,
  }));

  const { error } = await service.from('age_groups').insert(rows);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

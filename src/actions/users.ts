// src/actions/users.ts
// Server Actions for user management — invite, list, update role, delete
// Admin-only operations using Supabase Admin API (service role key), scoped to active club
// RELEVANT FILES: src/app/admin/utilizadores/page.tsx, src/lib/supabase/server.ts, src/lib/supabase/club-context.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import type { UserRole } from '@/lib/types';

/* ───────────── Auth Guard ───────────── */

async function requireAdmin() {
  const ctx = await getAuthContext();
  if (ctx.role !== 'admin') throw new Error('Acesso negado');
  return ctx;
}

/* ───────────── Types ───────────── */

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
  lastSignIn: string | null;
  active: boolean;
}

/* ───────────── List Users ───────────── */

export async function listUsers(): Promise<{ success: boolean; users: UserListItem[]; error?: string }> {
  try {
    const { clubId } = await requireAdmin();
    const service = await createServiceClient();

    // Fetch club memberships for the active club
    const { data: memberships, error: membershipsErr } = await service
      .from('club_memberships')
      .select('user_id, role')
      .eq('club_id', clubId);

    if (membershipsErr || !memberships) return { success: false, users: [], error: `Erro ao carregar utilizadores: ${membershipsErr?.message}` };

    if (memberships.length === 0) return { success: true, users: [] };

    const memberUserIds = memberships.map((m) => m.user_id);
    const roleMap = new Map(memberships.map((m) => [m.user_id, m.role as UserRole]));

    // Fetch profiles for these users
    const { data: profiles, error: profilesErr } = await service
      .from('profiles')
      .select('id, full_name, created_at, active')
      .in('id', memberUserIds);

    if (profilesErr || !profiles) return { success: false, users: [], error: `Erro ao carregar perfis: ${profilesErr?.message}` };

    // Fetch auth users for email + last sign in
    const { data: authData, error: authErr } = await service.auth.admin.listUsers();
    if (authErr) return { success: false, users: [], error: `Erro ao carregar dados de autenticação: ${authErr.message}` };

    const authMap = new Map(authData.users.map((u) => [u.id, u]));

    const users: UserListItem[] = profiles
      .sort((a, b) => {
        // Sort active first, then by created_at
        if ((a.active ?? true) !== (b.active ?? true)) return (b.active ?? true) ? 1 : -1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
      .map((p) => {
        const auth = authMap.get(p.id);
        return {
          id: p.id,
          email: auth?.email ?? '—',
          fullName: p.full_name,
          role: roleMap.get(p.id) ?? ('scout' as UserRole),
          createdAt: p.created_at,
          lastSignIn: auth?.last_sign_in_at ?? null,
          active: p.active ?? true,
        };
      });

    return { success: true, users };
  } catch (e) {
    return { success: false, users: [], error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Get Club Members (any authenticated member) ───────────── */

export async function getClubMembers(): Promise<{ id: string; fullName: string; role: string }[]> {
  const { getAllProfiles } = await import('@/lib/supabase/queries');
  const profiles = await getAllProfiles();
  return profiles.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }));
}

/* ───────────── Invite User ───────────── */

export async function inviteUser(
  email: string,
  role: UserRole,
  fullName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clubId } = await requireAdmin();
    const service = await createServiceClient();

    // Invite via Supabase Admin API — sends magic link email.
    // redirectTo lands the invitee on /definir-password after the link is verified,
    // so they set a password on first access instead of being stuck without credentials.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eskout.com';
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, role },
      redirectTo: `${appUrl}/definir-password`,
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        return { success: false, error: 'Este email já está registado' };
      }
      return { success: false, error: error.message };
    }

    if (!data.user) return { success: false, error: 'Erro ao criar utilizador' };

    // Create profile row
    const { error: profileErr } = await service
      .from('profiles')
      .upsert({
        id: data.user.id,
        full_name: fullName,
        role,
      });

    if (profileErr) return { success: false, error: 'Utilizador criado mas erro ao guardar perfil' };

    // Create club membership for the active club (upsert in case a DB trigger already created one)
    const { error: membershipErr } = await service
      .from('club_memberships')
      .upsert({
        user_id: data.user.id,
        club_id: clubId,
        role,
      }, { onConflict: 'user_id,club_id' });

    if (membershipErr) return { success: false, error: 'Utilizador criado mas erro ao associar ao clube' };

    revalidatePath('/admin/utilizadores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Update Role ───────────── */

export async function updateUserRole(
  userId: string,
  newRole: UserRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { clubId, userId: currentUserId } = await requireAdmin();

    // Prevent self-demotion
    if (userId === currentUserId) return { success: false, error: 'Não podes alterar o teu próprio role' };

    const service = await createServiceClient();

    // Update the club membership role (not the profile role)
    const { error } = await service
      .from('club_memberships')
      .update({ role: newRole })
      .eq('user_id', userId)
      .eq('club_id', clubId);

    if (error) return { success: false, error: 'Erro ao atualizar role' };

    revalidatePath('/admin/utilizadores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Deactivate User (soft delete) ───────────── */

export async function deleteUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: currentUserId } = await requireAdmin();

    // Prevent self-deactivation
    if (userId === currentUserId) return { success: false, error: 'Não podes desativar a tua própria conta' };

    const service = await createServiceClient();

    // Soft delete: mark profile inactive and ban auth user. profiles.active is the
    // source of truth (club_memberships has no `active` column — it's unused anyway).
    const { error: profileErr } = await service
      .from('profiles')
      .update({ active: false })
      .eq('id', userId);

    if (profileErr) return { success: false, error: 'Erro ao desativar utilizador' };

    // Ban auth user so they can't login
    const { error: authErr } = await service.auth.admin.updateUserById(userId, {
      ban_duration: '876000h', // ~100 years
    });
    if (authErr) return { success: false, error: 'Perfil desativado mas erro ao bloquear login' };

    revalidatePath('/admin/utilizadores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Set User Password (manual override) ───────────── */

export async function setUserPassword(
  userId: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId: currentUserId } = await requireAdmin();

    // Self-change must go through the normal auth flow (not this admin override)
    if (userId === currentUserId) return { success: false, error: 'Não podes alterar a tua própria password por aqui' };

    // Mirrors Supabase `minimum_password_length` in config.toml
    if (password.length < 6) return { success: false, error: 'A password deve ter pelo menos 6 caracteres' };

    const service = await createServiceClient();
    const { error } = await service.auth.admin.updateUserById(userId, { password });

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

/* ───────────── Reactivate User ───────────── */

export async function reactivateUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const service = await createServiceClient();

    const { error: profileErr } = await service
      .from('profiles')
      .update({ active: true })
      .eq('id', userId);

    if (profileErr) return { success: false, error: 'Erro ao reativar utilizador' };

    // Unban auth user
    const { error: authErr } = await service.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
    if (authErr) return { success: false, error: 'Perfil reativado mas erro ao desbloquear login' };

    revalidatePath('/admin/utilizadores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

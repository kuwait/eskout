// src/actions/master-users.ts
// Server Actions for superadmin user management — delete users globally
// Removes auth user, profile, and all club memberships
// RELEVANT FILES: src/app/master/utilizadores/page.tsx, src/actions/clubs.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Delete User (superadmin only) ───────────── */

export async function deleteUser(userId: string): Promise<ActionResponse> {
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

  // Prevent self-deletion
  if (userId === user.id) {
    return { success: false, error: 'Não podes eliminar a tua própria conta' };
  }

  const service = await createServiceClient();

  // Delete club memberships
  await service
    .from('club_memberships')
    .delete()
    .eq('user_id', userId);

  // Delete profile
  await service
    .from('profiles')
    .delete()
    .eq('id', userId);

  // Delete auth user
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { success: false, error: error.message };

  revalidatePath('/master/utilizadores');
  revalidatePath('/master');
  return { success: true };
}

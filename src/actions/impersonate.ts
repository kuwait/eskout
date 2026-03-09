// src/actions/impersonate.ts
// Server action for superadmin role impersonation — set/clear role override cookie
// Allows superadmins to test the app as any role without changing their actual permissions
// RELEVANT FILES: src/lib/supabase/club-context.ts, src/components/layout/RoleImpersonator.tsx, src/middleware.ts

'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ROLE_OVERRIDE_COOKIE } from '@/lib/supabase/club-context';
import type { UserRole } from '@/lib/types';

const VALID_ROLES: UserRole[] = ['admin', 'editor', 'scout', 'recruiter'];

/** Verify the current user is a superadmin */
async function requireSuperadmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin) throw new Error('NOT_SUPERADMIN');
}

/** Set a role override (superadmin only) */
export async function setRoleOverride(role: UserRole): Promise<void> {
  await requireSuperadmin();
  if (!VALID_ROLES.includes(role)) throw new Error('INVALID_ROLE');

  const cookieStore = await cookies();
  cookieStore.set(ROLE_OVERRIDE_COOKIE, role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 4, // 4 hours max — auto-expires as safety net
  });
}

/** Clear role override — return to real role */
export async function clearRoleOverride(): Promise<void> {
  await requireSuperadmin();
  const cookieStore = await cookies();
  cookieStore.delete(ROLE_OVERRIDE_COOKIE);
}

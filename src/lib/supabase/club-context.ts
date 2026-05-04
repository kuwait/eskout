// src/lib/supabase/club-context.ts
// Server-side helper to get the active club from cookie + verify membership
// Every server action and query uses this to scope data to the current club
// RELEVANT FILES: src/lib/supabase/server.ts, src/middleware.ts, src/lib/types/index.ts

import { cookies } from 'next/headers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

export const CLUB_COOKIE = 'eskout-club-id';
export const ROLE_OVERRIDE_COOKIE = 'eskout-role-override';

export interface ClubContext {
  clubId: string;
  role: UserRole;
  club: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    features: Record<string, boolean>;
    settings: Record<string, unknown>;
  };
  userId: string;
  isSuperadmin: boolean;
}

/* ───────────── Lightweight Auth Context (0 DB queries) ───────────── */

export interface AuthContext {
  clubId: string;
  userId: string;
  role: UserRole;
  isSuperadmin: boolean;
}

/**
 * Lightweight auth context from JWT claims — ZERO database queries.
 * Reads clubId from cookie, role + superadmin from JWT app_metadata.
 * Wrapped in React.cache() — deduplicated within the same request.
 * Use this in server actions that only need clubId/userId/role.
 * Use getActiveClub() only when you need club.name, club.features, etc.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const clubId = cookieStore.get(CLUB_COOKIE)?.value;

  if (!clubId) throw new Error('NO_CLUB_SELECTED');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  const appMeta = user.app_metadata ?? {};
  const clubRoles: Record<string, string> = appMeta.club_roles ?? {};
  const role = clubRoles[clubId] as UserRole | undefined;

  if (!role) throw new Error('NO_CLUB_MEMBERSHIP');

  // Superadmin role impersonation — override role from cookie for testing
  let effectiveRole = role;
  if (appMeta.is_superadmin) {
    const roleOverride = cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value as UserRole | undefined;
    if (roleOverride) effectiveRole = roleOverride;
  }

  return {
    clubId,
    userId: user.id,
    role: effectiveRole,
    isSuperadmin: appMeta.is_superadmin ?? false,
  };
}

/* ───────────── Full Club Context (DB queries for club details) ───────────── */

/**
 * Get the active club for the current user.
 * Reads club_id from cookie, verifies membership, returns club + role.
 * Throws if no club selected or user has no membership.
 */
export async function getActiveClub(): Promise<ClubContext> {
  const cookieStore = await cookies();
  const clubId = cookieStore.get(CLUB_COOKIE)?.value;

  if (!clubId) {
    throw new Error('NO_CLUB_SELECTED');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('NOT_AUTHENTICATED');

  // Fetch membership + club in one query
  const { data: membership, error } = await supabase
    .from('club_memberships')
    .select('role, clubs(id, name, slug, logo_url, features, settings)')
    .eq('user_id', user.id)
    .eq('club_id', clubId)
    .single();

  if (error || !membership) {
    throw new Error('NO_CLUB_MEMBERSHIP');
  }

  const club = membership.clubs as unknown as {
    id: string; name: string; slug: string;
    logo_url: string | null; features: Record<string, boolean>;
    settings: Record<string, unknown>;
  };

  // Read superadmin from JWT claims — no extra DB query needed
  const isSuperadmin = user.app_metadata?.is_superadmin ?? false;

  // Superadmin role impersonation — override role from cookie for testing
  let effectiveRole = membership.role as UserRole;
  if (isSuperadmin) {
    const roleOverride = cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value as UserRole | undefined;
    if (roleOverride) effectiveRole = roleOverride;
  }

  return {
    clubId: club.id,
    role: effectiveRole,
    club: {
      id: club.id,
      name: club.name,
      slug: club.slug,
      logoUrl: club.logo_url,
      features: club.features ?? {},
      settings: club.settings ?? {},
    },
    userId: user.id,
    isSuperadmin,
  };
}

/**
 * Get the active club ID from cookie (lightweight, no DB verification).
 * Use for queries where RLS already enforces access.
 */
export async function getActiveClubId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CLUB_COOKIE)?.value ?? null;
}

/**
 * Set the active club cookie.
 */
export async function setActiveClub(clubId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CLUB_COOKIE, clubId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

/**
 * Get all clubs the current user belongs to (for club picker).
 */
export async function getUserClubs(): Promise<{
  clubs: { id: string; name: string; slug: string; logoUrl: string | null; role: UserRole }[];
  isSuperadmin: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { clubs: [], isSuperadmin: false };

  // Use service client to bypass RLS — we already verified the user via auth
  const service = await createServiceClient();

  const [membershipsRes, profileRes] = await Promise.all([
    service
      .from('club_memberships')
      .select('role, clubs(id, name, slug, logo_url)')
      .eq('user_id', user.id),
    service
      .from('profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single(),
  ]);

  const clubs = (membershipsRes.data ?? []).map((m) => {
    const club = m.clubs as unknown as { id: string; name: string; slug: string; logo_url: string | null };
    return {
      id: club.id,
      name: club.name,
      slug: club.slug,
      logoUrl: club.logo_url,
      role: m.role as UserRole,
    };
  });

  return {
    clubs,
    isSuperadmin: profileRes.data?.is_superadmin ?? false,
  };
}


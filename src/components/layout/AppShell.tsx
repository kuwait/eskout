// src/components/layout/AppShell.tsx
// Application shell that fetches age groups, alert counts, and club context server-side
// Wraps authenticated pages with sidebar (desktop) and mobile drawer
// RELEVANT FILES: src/app/layout.tsx, src/components/layout/Sidebar.tsx, src/lib/supabase/club-context.ts

import { cookies } from 'next/headers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getActiveClubId, ROLE_OVERRIDE_COOKIE } from '@/lib/supabase/club-context';
import { AppShellClient } from '@/components/layout/AppShellClient';
import type { AgeGroup } from '@/lib/types';

/** Lightweight list info for sidebar navigation */
export interface SidebarList {
  id: number;
  name: string;
  emoji: string;
  isSystem: boolean;
  isSharedWithMe?: boolean;
}

export interface AlertCounts {
  urgente: number;
  importante: number;
  pendingReports: number;
  pendingPlayers: number;
  pendingTasks: number;
  newFeedbacks: number;
  observationCount: number;
}

export interface ClubInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  features: Record<string, boolean>;
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let ageGroups: AgeGroup[] = [];
  let alertCounts: AlertCounts = { urgente: 0, importante: 0, pendingReports: 0, pendingPlayers: 0, pendingTasks: 0, newFeedbacks: 0, observationCount: 0 };
  let userRole = 'scout';
  let userId = '';
  let userName = '';
  let clubInfo: ClubInfo | null = null;
  let isSuperadmin = false;
  let canViewCompetitions = false;
  let sidebarLists: SidebarList[] = [];

  try {
    const supabase = await createClient();
    const clubId = await getActiveClubId();

    // Fetch user info
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return <>{children}</>;
    }

    userId = user.id;

    if (clubId) {
      // Fetch profile, membership, club, age groups, sidebar lists, and ALL alert counts — in parallel
      // Alert counts consolidated in a single RPC (get_appshell_counts) instead of 7+ separate queries
      // Fetch all shell data in a single Promise.all — profile, membership, club, age groups,
      // sidebar lists, and shared list IDs (was partially sequential before)
      const [profileRes, membershipRes, clubRes, agRes, sidebarListsRes, sharedListIdsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_superadmin, full_name, can_view_competitions')
          .eq('id', user.id)
          .single(),
        supabase
          .from('club_memberships')
          .select('role')
          .eq('user_id', user.id)
          .eq('club_id', clubId)
          .single(),
        supabase
          .from('clubs')
          .select('id, name, slug, logo_url, features')
          .eq('id', clubId)
          .single(),
        supabase
          .from('age_groups')
          .select('id, name, generation_year, season')
          .eq('club_id', clubId)
          .order('generation_year', { ascending: false }),
        // Sidebar lists — lightweight query for nav sub-items
        supabase
          .from('player_lists')
          .select('id, name, emoji, is_system')
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .order('is_system', { ascending: false })
          .order('name', { ascending: true }),
        // Shared list IDs for sidebar (fetched in parallel instead of sequentially)
        supabase
          .from('player_list_shares')
          .select('list_id')
          .eq('user_id', user.id),
      ]);

      isSuperadmin = profileRes.data?.is_superadmin ?? false;
      canViewCompetitions = profileRes.data?.can_view_competitions ?? false;
      userName = profileRes.data?.full_name ?? user.email ?? '';

      if (membershipRes.data) {
        userRole = membershipRes.data.role;
        // Superadmin role impersonation — override role from cookie
        if (isSuperadmin) {
          const cookieStore = await cookies();
          const roleOverride = cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value;
          if (roleOverride) userRole = roleOverride;
        }
      }

      if (clubRes.data) {
        clubInfo = {
          id: clubRes.data.id,
          name: clubRes.data.name,
          slug: clubRes.data.slug,
          logoUrl: clubRes.data.logo_url,
          features: (clubRes.data.features ?? {}) as Record<string, boolean>,
        };
      }

      if (agRes.data) {
        ageGroups = agRes.data.map((row) => ({
          id: row.id,
          name: row.name,
          generationYear: row.generation_year,
          season: row.season,
        }));
      }

      // Map sidebar lists for nav sub-items (own lists)
      if (sidebarListsRes.data) {
        sidebarLists = sidebarListsRes.data.map((row: { id: number; name: string; emoji: string; is_system: boolean }) => ({
          id: row.id,
          name: row.name,
          emoji: row.emoji,
          isSystem: row.is_system,
        }));
      }

      // Alert counts RPC (needs resolved role) + shared list details — run in parallel
      const sharedListIds = sharedListIdsRes.data;
      const [countsRes, sharedListsRes] = await Promise.all([
        supabase.rpc('get_appshell_counts', {
          p_club_id: clubId,
          p_user_id: userId,
          p_user_role: userRole,
        }),
        sharedListIds?.length
          ? createServiceClient().then(service =>
              service
                .from('player_lists')
                .select('id, name, emoji, is_system')
                .in('id', sharedListIds.map(s => s.list_id))
                .order('name', { ascending: true })
            )
          : Promise.resolve({ data: null }),
      ]);

      const c = countsRes.data as { urgente: number; importante: number; pending_reports: number; pending_tasks: number; observation_count: number; pending_players: number; new_feedbacks: number } | null;
      alertCounts = {
        urgente: c?.urgente ?? 0,
        importante: c?.importante ?? 0,
        pendingReports: c?.pending_reports ?? 0,
        pendingPlayers: c?.pending_players ?? 0,
        pendingTasks: c?.pending_tasks ?? 0,
        newFeedbacks: c?.new_feedbacks ?? 0,
        observationCount: c?.observation_count ?? 0,
      };

      if (sharedListsRes.data?.length) {
        for (const row of sharedListsRes.data) {
          sidebarLists.push({
            id: row.id,
            name: row.name,
            emoji: row.emoji,
            isSystem: row.is_system,
            isSharedWithMe: true,
          });
        }
      }
    } else {
      // No club selected — still fetch profile for userName
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_superadmin, full_name')
        .eq('id', user.id)
        .single();
      isSuperadmin = profile?.is_superadmin ?? false;
      userName = profile?.full_name ?? user.email ?? '';
    }
  } catch {
    // Supabase not configured yet — app still renders without data
  }

  return (
    <AppShellClient
      ageGroups={ageGroups}
      alertCounts={alertCounts}
      userRole={userRole}
      userId={userId}
      userName={userName}
      clubInfo={clubInfo}
      isSuperadmin={isSuperadmin}
      canViewCompetitions={canViewCompetitions}
      sidebarLists={sidebarLists}
    >
      {children}
    </AppShellClient>
  );
}

// src/components/layout/AppShell.tsx
// Application shell that fetches age groups, alert counts, and club context server-side
// Wraps authenticated pages with sidebar (desktop) and mobile drawer
// RELEVANT FILES: src/app/layout.tsx, src/components/layout/Sidebar.tsx, src/lib/supabase/club-context.ts

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getActiveClubId, ROLE_OVERRIDE_COOKIE } from '@/lib/supabase/club-context';
import { AppShellClient } from '@/components/layout/AppShellClient';
import type { AgeGroup } from '@/lib/types';

export interface AlertCounts {
  urgente: number;
  importante: number;
  pendingReports: number;
  pendingPlayers: number;
  pendingTasks: number;
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
  let alertCounts: AlertCounts = { urgente: 0, importante: 0, pendingReports: 0, pendingPlayers: 0, pendingTasks: 0, observationCount: 0 };
  let userRole = 'scout';
  let userId = '';
  let userName = '';
  let clubInfo: ClubInfo | null = null;
  let isSuperadmin = false;

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
      // Fetch profile, membership, club, age groups, alert counts, and task count — ALL in parallel
      const [profileRes, membershipRes, clubRes, agRes, urgRes, impRes, pendingRes, taskCountRes, obsCountRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_superadmin, full_name')
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
        supabase
          .from('observation_notes')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'urgente')
          .eq('club_id', clubId),
        supabase
          .from('observation_notes')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'importante')
          .eq('club_id', clubId),
        supabase
          .from('scouting_reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pendente')
          .eq('club_id', clubId),
        supabase
          .from('user_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', clubId)
          .eq('user_id', user.id)
          .eq('completed', false),
        supabase
          .from('user_observation_list')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', clubId)
          .eq('user_id', user.id),
      ]);

      isSuperadmin = profileRes.data?.is_superadmin ?? false;
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

      // Per-user badge: count players added by others minus this user's dismissals
      let pendingPlayersCount = 0;
      if (userRole === 'admin' || userRole === 'editor') {
        const [playersRes, dismissedRes] = await Promise.all([
          supabase
            .from('players')
            .select('id', { count: 'exact', head: true })
            .eq('club_id', clubId)
            .neq('created_by', userId),
          supabase
            .from('player_added_dismissals')
            .select('player_id', { count: 'exact', head: true })
            .eq('user_id', userId),
        ]);
        pendingPlayersCount = Math.max(0, (playersRes.count ?? 0) - (dismissedRes.count ?? 0));
      }

      alertCounts = {
        urgente: urgRes.count ?? 0,
        importante: impRes.count ?? 0,
        pendingReports: pendingRes.count ?? 0,
        pendingPlayers: pendingPlayersCount,
        pendingTasks: taskCountRes.count ?? 0,
        observationCount: obsCountRes.count ?? 0,
      };
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
    >
      {children}
    </AppShellClient>
  );
}

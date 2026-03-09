// src/components/layout/AppShell.tsx
// Application shell that fetches age groups, alert counts, and club context server-side
// Wraps authenticated pages with sidebar (desktop) and mobile drawer
// RELEVANT FILES: src/app/layout.tsx, src/components/layout/Sidebar.tsx, src/lib/supabase/club-context.ts

import { createClient } from '@/lib/supabase/server';
import { getActiveClubId } from '@/lib/supabase/club-context';
import { AppShellClient } from '@/components/layout/AppShellClient';
import type { AgeGroup } from '@/lib/types';

export interface AlertCounts {
  urgente: number;
  importante: number;
  pendingReports: number;
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
  let alertCounts: AlertCounts = { urgente: 0, importante: 0, pendingReports: 0 };
  let userRole = 'scout';
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

    // Fetch profile (superadmin flag)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single();
    isSuperadmin = profile?.is_superadmin ?? false;

    if (clubId) {
      // Fetch club membership role
      const { data: membership } = await supabase
        .from('club_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();

      if (membership) userRole = membership.role;

      // Fetch club info
      const { data: club } = await supabase
        .from('clubs')
        .select('id, name, slug, logo_url, features')
        .eq('id', clubId)
        .single();

      if (club) {
        clubInfo = {
          id: club.id,
          name: club.name,
          slug: club.slug,
          logoUrl: club.logo_url,
          features: (club.features ?? {}) as Record<string, boolean>,
        };
      }

      // Fetch age groups, alerts, and pending reports — all club-scoped
      const [agRes, urgRes, impRes, pendingRes] = await Promise.all([
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
      ]);

      if (agRes.data) {
        ageGroups = agRes.data.map((row) => ({
          id: row.id,
          name: row.name,
          generationYear: row.generation_year,
          season: row.season,
        }));
      }

      alertCounts = {
        urgente: urgRes.count ?? 0,
        importante: impRes.count ?? 0,
        pendingReports: pendingRes.count ?? 0,
      };
    }
  } catch {
    // Supabase not configured yet — app still renders without data
  }

  return (
    <AppShellClient
      ageGroups={ageGroups}
      alertCounts={alertCounts}
      userRole={userRole}
      clubInfo={clubInfo}
      isSuperadmin={isSuperadmin}
    >
      {children}
    </AppShellClient>
  );
}

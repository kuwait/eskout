// src/components/layout/AppShell.tsx
// Application shell that fetches age groups and alert counts server-side
// Wraps authenticated pages with sidebar (desktop) and bottom nav (mobile)
// RELEVANT FILES: src/app/layout.tsx, src/components/layout/Sidebar.tsx, src/components/layout/MobileNav.tsx

import { createClient } from '@/lib/supabase/server';
import { AppShellClient } from '@/components/layout/AppShellClient';
import type { AgeGroup } from '@/lib/types';

export interface AlertCounts {
  urgente: number;
  importante: number;
  pendingReports: number;
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let ageGroups: AgeGroup[] = [];
  let alertCounts: AlertCounts = { urgente: 0, importante: 0, pendingReports: 0 };
  let userRole = 'scout';

  try {
    const supabase = await createClient();
    const [agRes, urgRes, impRes, pendingRes, userRes] = await Promise.all([
      supabase
        .from('age_groups')
        .select('id, name, generation_year, season')
        .order('generation_year', { ascending: false }),
      supabase
        .from('observation_notes')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'urgente'),
      supabase
        .from('observation_notes')
        .select('id', { count: 'exact', head: true })
        .eq('priority', 'importante'),
      supabase
        .from('scout_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente'),
      // Fetch current user's role
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return null;
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        return data;
      }),
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

    if (userRes?.role) userRole = userRes.role;
  } catch {
    // Supabase not configured yet — app still renders without age groups
  }

  return (
    <AppShellClient ageGroups={ageGroups} alertCounts={alertCounts} userRole={userRole}>
      {children}
    </AppShellClient>
  );
}

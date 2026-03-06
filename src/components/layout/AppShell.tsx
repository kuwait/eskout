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
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  let ageGroups: AgeGroup[] = [];
  let alertCounts: AlertCounts = { urgente: 0, importante: 0 };

  try {
    const supabase = await createClient();
    const [agRes, urgRes, impRes] = await Promise.all([
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
    };
  } catch {
    // Supabase not configured yet — app still renders without age groups
  }

  return (
    <AppShellClient ageGroups={ageGroups} alertCounts={alertCounts}>
      {children}
    </AppShellClient>
  );
}

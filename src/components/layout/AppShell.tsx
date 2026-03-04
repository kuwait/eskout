// src/components/layout/AppShell.tsx
// Application shell that fetches age groups server-side and provides them to the client layout
// Wraps authenticated pages with sidebar (desktop) and bottom nav (mobile)
// RELEVANT FILES: src/app/layout.tsx, src/components/layout/Sidebar.tsx, src/components/layout/MobileNav.tsx

import { createClient } from '@/lib/supabase/server';
import { AppShellClient } from '@/components/layout/AppShellClient';
import type { AgeGroup } from '@/lib/types';

export async function AppShell({ children }: { children: React.ReactNode }) {
  let ageGroups: AgeGroup[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('age_groups')
      .select('id, name, generation_year, season')
      .order('generation_year', { ascending: false });

    if (data) {
      ageGroups = data.map((row) => ({
        id: row.id,
        name: row.name,
        generationYear: row.generation_year,
        season: row.season,
      }));
    }
  } catch {
    // Supabase not configured yet — app still renders without age groups
  }

  return (
    <AppShellClient ageGroups={ageGroups}>
      {children}
    </AppShellClient>
  );
}

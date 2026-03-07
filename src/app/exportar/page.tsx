// src/app/exportar/page.tsx
// Excel export page — admin/editor selects filters, downloads .xlsx with matching players
// Server component fetches age groups + clubs, client component handles filter UI + download
// RELEVANT FILES: src/app/api/export/route.ts, src/lib/constants.ts, src/components/players/PlayerFilters.tsx

import { createClient } from '@/lib/supabase/server';
import { ExportForm } from './ExportForm';

export default async function ExportarPage() {
  const supabase = await createClient();

  // Fetch age groups and distinct clubs for filter dropdowns
  const [agRes, clubRes] = await Promise.all([
    supabase.from('age_groups').select('id, name, generation_year').order('generation_year', { ascending: false }),
    supabase.from('players').select('club').not('club', 'is', null).order('club'),
  ]);

  const ageGroups = (agRes.data ?? []).map((r) => ({ id: r.id, name: r.name }));
  // Distinct clubs
  const clubs = [...new Set((clubRes.data ?? []).map((r) => r.club as string).filter(Boolean))];

  return (
    <div className="p-4 lg:p-6 max-w-2xl">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Exportar</h1>
      <ExportForm ageGroups={ageGroups} clubs={clubs} />
    </div>
  );
}

// src/app/campo/sombra/page.tsx
// Plantel Sombra page — shows shadow squad players grouped by position
// Shadow squads depend on age group selection — no server-side data (selectedId is client-side)
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/layout/Sidebar.tsx, src/app/campo/real/page.tsx

import { SquadPanelView } from '@/components/squad/SquadPanelView';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';

export default async function PlantelSombraPage() {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  // Fetch shadow age group IDs server-side (needed for AgeGroupSelector filtering)
  // Can't pre-fetch squad data because age group selection is client-side
  const { data } = await supabase.rpc('get_squad_panel', {
    p_club_id: clubId,
    p_squad_type: 'shadow',
  });

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Planteis Sombra</h1>
      <SquadPanelView squadType="shadow" clubId={clubId} initialData={data} />
    </div>
  );
}

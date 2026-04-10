// src/app/campo/real/page.tsx
// Plantel page — shows real squad players grouped by position
// Fetches initial squad data server-side for instant render
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/layout/Sidebar.tsx, src/app/campo/sombra/page.tsx

import { SquadPanelView } from '@/components/squad/SquadPanelView';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';

export default async function PlantelRealPage() {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  // Server-side fetch: squads + squad_players + player details in one RPC
  const { data } = await supabase.rpc('get_squad_panel', {
    p_club_id: clubId,
    p_squad_type: 'real',
  });

  return (
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-bold lg:text-2xl">Planteis</h1>
      <SquadPanelView squadType="real" clubId={clubId} initialData={data} />
    </div>
  );
}

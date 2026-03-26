// src/app/jogadores/page.tsx
// Player database page — lists all players for the selected age group
// Fetches first page + dropdown options server-side for instant render
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/players/PlayerTable.tsx, src/components/players/PlayerFilters.tsx

import { PlayersView } from '@/components/players/PlayersView';
import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';

export default async function JogadoresPage() {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Server-side: first page of 50 players + dropdown options in 1 RPC
  const { data } = await supabase.rpc('get_players_page', { p_club_id: clubId });

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
      </div>
      <PlayersView clubId={clubId} initialData={data} />
    </div>
  );
}

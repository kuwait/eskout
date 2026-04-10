// src/app/jogadores/page.tsx
// Player database page — lists all players for the selected age group
// Fetches first page + dropdown options server-side for instant render
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/players/PlayerTable.tsx, src/components/players/PlayerFilters.tsx

import { PlayersView } from '@/components/players/PlayersView';
import { getAuthContext } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { getPlayingUpPlayerIds } from '@/actions/players';

export default async function JogadoresPage() {
  const { clubId } = await getAuthContext();
  const supabase = await createClient();

  // Fetch all initial data server-side — avoids client-side server action POSTs on mount
  const [playersRes, playingUp] = await Promise.all([
    supabase.rpc('get_players_page', { p_club_id: clubId }),
    getPlayingUpPlayerIds(clubId),
  ]);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
      </div>
      <PlayersView clubId={clubId} initialData={playersRes.data} initialPlayingUp={playingUp} />
    </div>
  );
}

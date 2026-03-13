// src/app/jogadores/page.tsx
// Player database page — lists all players for the selected age group
// Server component that renders client-side table/card/filter components
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

import { PlayersView } from '@/components/players/PlayersView';
import { getActiveClub } from '@/lib/supabase/club-context';

export default async function JogadoresPage() {
  const { clubId } = await getActiveClub();

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
      </div>
      <PlayersView clubId={clubId} />
    </div>
  );
}

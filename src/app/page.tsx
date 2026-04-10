// src/app/page.tsx
// Home page — renders the Jogadores (players) view directly
// Fetches initial data server-side for instant render (same as /jogadores)
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/hooks/useAgeGroup.tsx, src/app/jogadores/page.tsx

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayersView } from '@/components/players/PlayersView';
import { getActiveClub } from '@/lib/supabase/club-context';
import { createClient } from '@/lib/supabase/server';
import { getPlayingUpPlayerIds } from '@/actions/players';

export default async function HomePage() {
  const ctx = await getActiveClub();
  const hideEvaluations = ctx.role === 'recruiter';
  const isScout = ctx.role === 'scout';
  const supabase = await createClient();

  // Fetch all initial data server-side — avoids client-side server action POSTs on mount
  const [playersRes, playingUp] = await Promise.all([
    supabase.rpc('get_players_page', { p_club_id: ctx.clubId }),
    getPlayingUpPlayerIds(ctx.clubId),
  ]);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
        {!isScout && (
          <Button asChild size="sm">
            <Link href="/jogadores/novo">
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Link>
          </Button>
        )}
      </div>
      <PlayersView hideEvaluations={hideEvaluations || isScout} hideScoutingData={isScout} clubId={ctx.clubId} initialData={playersRes.data} initialPlayingUp={playingUp} />
    </div>
  );
}

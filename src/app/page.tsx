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

export default async function HomePage() {
  const ctx = await getActiveClub();
  const hideEvaluations = ctx.role === 'recruiter';
  const supabase = await createClient();

  // Server-side: first page of 50 players + dropdown options in 1 RPC
  const { data } = await supabase.rpc('get_players_page', { p_club_id: ctx.clubId });

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Jogadores</h1>
        <Button asChild size="sm">
          <Link href="/jogadores/novo">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Link>
        </Button>
      </div>
      <PlayersView hideEvaluations={hideEvaluations} clubId={ctx.clubId} initialData={data} />
    </div>
  );
}

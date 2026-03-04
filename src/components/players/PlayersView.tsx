// src/components/players/PlayersView.tsx
// Client component orchestrating the player list: fetches data, handles search/filters
// Shows PlayerTable on desktop and PlayerCard list on mobile
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayerTable } from '@/components/players/PlayerTable';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerFilters } from '@/components/players/PlayerFilters';
import type { Player, PlayerRow } from '@/lib/types';

export interface PlayerFilterState {
  position: string;
  club: string;
  opinion: string;
  foot: string;
  status: string;
  shadowSquad: string;
  realSquad: string;
}

const EMPTY_FILTERS: PlayerFilterState = {
  position: '',
  club: '',
  opinion: '',
  foot: '',
  status: '',
  shadowSquad: '',
  realSquad: '',
};

export function PlayersView() {
  const { selectedId } = useAgeGroup();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>(EMPTY_FILTERS);

  // Fetch players when age group changes
  useEffect(() => {
    if (!selectedId) return;

    const supabase = createClient();

    supabase
      .from('players')
      .select('*')
      .eq('age_group_id', selectedId)
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          startTransition(() => {
            setPlayers((data as PlayerRow[]).map(mapPlayerRow));
          });
        }
      });
  }, [selectedId]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = players;

    // Search by name
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Filters
    if (filters.position) result = result.filter((p) => p.positionNormalized === filters.position);
    if (filters.club) result = result.filter((p) => p.club === filters.club);
    if (filters.opinion) result = result.filter((p) => p.departmentOpinion === filters.opinion);
    if (filters.foot) result = result.filter((p) => p.foot === filters.foot);
    if (filters.status) result = result.filter((p) => p.recruitmentStatus === filters.status);
    if (filters.shadowSquad === 'yes') result = result.filter((p) => p.isShadowSquad);
    if (filters.shadowSquad === 'no') result = result.filter((p) => !p.isShadowSquad);
    if (filters.realSquad === 'yes') result = result.filter((p) => p.isRealSquad);
    if (filters.realSquad === 'no') result = result.filter((p) => !p.isRealSquad);

    return result;
  }, [players, search, filters]);

  // Unique clubs for filter dropdown
  const clubs = useMemo(() => {
    const set = new Set(players.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort();
  }, [players]);

  if (!selectedId) {
    return <p className="text-muted-foreground">Selecione um escalão para ver os jogadores.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Search + Add button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar jogador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Pesquisar jogador"
          />
        </div>
        <Button asChild size="sm">
          <Link href="/jogadores/novo">
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Adicionar</span>
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <PlayerFilters
        filters={filters}
        onFiltersChange={setFilters}
        clubs={clubs}
      />

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}
      </p>

      {/* Loading state */}
      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-neutral-100" />
          ))}
        </div>
      )}

      {/* Desktop: Table / Mobile: Cards */}
      {!isPending && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <PlayerTable players={filtered} />
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum jogador encontrado.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

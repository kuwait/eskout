// src/components/players/PlayersView.tsx
// Client component orchestrating the player list: fetches data, handles search/filters
// Shows PlayerTable on desktop and PlayerCard list on mobile
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { fuzzyMatch } from '@/lib/utils';
import { getObservationTier } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { PlayerTable } from '@/components/players/PlayerTable';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerFilters } from '@/components/players/PlayerFilters';
import type { DepartmentOpinion, Player, PlayerRow } from '@/lib/types';

export interface PlayerFilterState {
  position: string;
  club: string;
  opinion: string;
  foot: string;
  status: string;
  shadowSquad: string;
  realSquad: string;
  birthYear: string;
  dobFrom: string;
  dobTo: string;
  observationTier: string;
}

const EMPTY_FILTERS: PlayerFilterState = {
  position: '',
  club: '',
  opinion: '',
  foot: '',
  status: '',
  shadowSquad: '',
  realSquad: '',
  birthYear: '',
  dobFrom: '',
  dobTo: '',
  observationTier: '',
};

export function PlayersView() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>(EMPTY_FILTERS);

  // Fetch all players once
  useEffect(() => {
    const supabase = createClient();
    supabase.from('players').select('*').order('name').then(({ data, error }) => {
      if (!error && data) {
        startTransition(() => {
          setPlayers((data as PlayerRow[]).map(mapPlayerRow));
        });
      }
    });
  }, []);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = players;

    // Search by name
    if (search) {
      result = result.filter((p) => fuzzyMatch(p.name, search));
    }

    // Filters
    if (filters.position) result = result.filter((p) => p.positionNormalized === filters.position);
    if (filters.club) result = result.filter((p) => p.club === filters.club);
    if (filters.opinion) result = result.filter((p) => p.departmentOpinion.includes(filters.opinion as DepartmentOpinion));
    if (filters.foot) result = result.filter((p) => p.foot === filters.foot);
    if (filters.status) result = result.filter((p) => (p.recruitmentStatus ?? '') === filters.status);
    if (filters.shadowSquad === 'yes') result = result.filter((p) => p.isShadowSquad);
    if (filters.shadowSquad === 'no') result = result.filter((p) => !p.isShadowSquad);
    if (filters.realSquad === 'yes') result = result.filter((p) => p.isRealSquad);
    if (filters.realSquad === 'no') result = result.filter((p) => !p.isRealSquad);

    // Observation tier filter
    if (filters.observationTier) {
      result = result.filter((p) => getObservationTier(p) === filters.observationTier);
    }

    // Birth year filter
    if (filters.birthYear) {
      const yr = parseInt(filters.birthYear, 10);
      result = result.filter((p) => p.dob && new Date(p.dob).getFullYear() === yr);
    }

    // Date range filter (born between two dates)
    if (filters.dobFrom) {
      result = result.filter((p) => p.dob && p.dob >= filters.dobFrom);
    }
    if (filters.dobTo) {
      result = result.filter((p) => p.dob && p.dob <= filters.dobTo);
    }

    return result;
  }, [players, search, filters]);

  // Unique clubs for filter dropdown
  const clubs = useMemo(() => {
    const set = new Set(players.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort();
  }, [players]);

  // Unique birth years for filter dropdown
  const birthYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of players) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [players]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar jogador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Pesquisar jogador"
        />
      </div>

      {/* Filters */}
      <PlayerFilters
        filters={filters}
        onFiltersChange={setFilters}
        clubs={clubs}
        birthYears={birthYears}
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

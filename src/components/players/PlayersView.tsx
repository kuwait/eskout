// src/components/players/PlayersView.tsx
// Client component orchestrating the player list: fetches data, handles search/filters
// Shows PlayerTable on desktop and PlayerCard list on mobile with infinite scroll
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { fuzzyMatch } from '@/lib/utils';
import { getObservationTier } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerTable } from '@/components/players/PlayerTable';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerFilters } from '@/components/players/PlayerFilters';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
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

/* ───────────── Infinite Scroll Page Size ───────────── */

const PAGE_SIZE = 40;

export function PlayersView() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* Sentinel ref for infinite scroll */
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch all players + ratings client-side — .range(0, 4999) bypasses Supabase 1000 row default
  useEffect(() => {
    const supabase = createClient();
    const MAX = 4999;

    Promise.all([
      supabase.from('players').select('*').order('name').range(0, MAX),
      supabase.from('scouting_reports').select('player_id, rating').not('rating', 'is', null).range(0, MAX),
      supabase.from('scout_evaluations').select('player_id, rating').range(0, MAX),
      supabase.from('observation_notes').select('player_id, content, created_at').order('created_at', { ascending: false }).range(0, MAX),
    ]).then(([playersRes, reportsRes, evalsRes, notesRes]) => {
      if (playersRes.error || !playersRes.data?.length) {
        setLoading(false);
        return;
      }

      // Build map: playerId → all note contents (newest first, already sorted)
      const notesMap = new Map<number, string[]>();
      if (notesRes.data) {
        for (const n of notesRes.data) {
          const arr = notesMap.get(n.player_id) ?? [];
          arr.push(n.content);
          notesMap.set(n.player_id, arr);
        }
      }

      const mapped = (playersRes.data as unknown as PlayerRow[]).map((row) => {
        const player = mapPlayerRow(row);
        player.observationNotePreviews = notesMap.get(row.id) ?? [];
        return player;
      });

      // Build rating aggregates: { playerId → { sum, count } }
      const agg = new Map<number, { sum: number; count: number }>();
      const addRating = (playerId: number, rating: number) => {
        const existing = agg.get(playerId) ?? { sum: 0, count: 0 };
        existing.sum += rating;
        existing.count += 1;
        agg.set(playerId, existing);
      };

      if (reportsRes.data) {
        for (const r of reportsRes.data) addRating(r.player_id, r.rating!);
      }
      if (evalsRes.data) {
        for (const e of evalsRes.data) addRating(e.player_id, e.rating);
      }

      // Merge into players
      for (const p of mapped) {
        const stats = agg.get(p.id);
        if (stats) {
          p.reportAvgRating = Math.round((stats.sum / stats.count) * 10) / 10;
          p.reportRatingCount = stats.count;
        }
      }

      setPlayers(mapped);
      setLoading(false);
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

  // Reset visible count when filters/search change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filters]);

  // Infinite scroll via IntersectionObserver
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

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

  const hasFilters = Object.values(filters).some(Boolean);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const mobileSlice = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-4">
      {/* Search + filter button */}
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

        {/* Mobile filter button — opens bottom sheet */}
        <div className="relative shrink-0 overflow-visible md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {activeFilterCount > 0 && (
            <span className="pointer-events-none absolute top-[-6px] right-[-6px] flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
      </div>

      {/* Desktop filters — always visible inline */}
      <div className="hidden md:block">
        <PlayerFilters
          filters={filters}
          onFiltersChange={setFilters}
          clubs={clubs}
          birthYears={birthYears}
        />
      </div>

      {/* Mobile filter bottom sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl" showCloseButton={false}>
          <SheetHeader className="flex-row items-center justify-between">
            <SheetTitle>Filtros</SheetTitle>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setFilters(EMPTY_FILTERS);
                }}>
                  <X className="mr-1 h-3 w-3" />
                  Limpar
                </Button>
              )}
              <Button size="sm" onClick={() => setFiltersOpen(false)}>Aplicar</Button>
            </div>
          </SheetHeader>
          <SheetDescription className="sr-only">Filtros de pesquisa de jogadores</SheetDescription>
          <div className="px-4 pb-6">
            <PlayerFilters
              filters={filters}
              onFiltersChange={setFilters}
              clubs={clubs}
              birthYears={birthYears}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5">
              <div className="h-[50px] w-[50px] shrink-0 animate-pulse rounded-xl bg-neutral-200" />
              <div className="h-[50px] w-[50px] shrink-0 animate-pulse rounded-xl bg-neutral-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: Table / Mobile: Cards with infinite scroll */}
      {!loading && players.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <PlayerTable players={filtered} />
          </div>

          {/* Mobile cards — paginated with infinite scroll */}
          <div className="space-y-2 md:hidden">
            {mobileSlice.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum jogador encontrado.
              </p>
            )}
            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <span className="text-xs text-muted-foreground">A carregar mais...</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

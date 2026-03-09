// src/components/players/PlayersView.tsx
// Client component orchestrating the player list with client-side pagination (50/page)
// Fetches all players from Supabase once, applies multi-field search + filters in-memory
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { getObservationTier, POSITIONS } from '@/lib/constants';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerTable } from '@/components/players/PlayerTable';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerFilters } from '@/components/players/PlayerFilters';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
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

/* ───────────── Config ───────────── */

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const SUPABASE_PAGE = 1000;

/* ───────────── Accent-insensitive search helpers ───────────── */

/** Strip diacritics: "Famalicão" → "famalicao" */
function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Map position code → searchable label (e.g. "DC" → "dc defesa central") */
const POSITION_SEARCH_MAP = new Map<string, string>(
  POSITIONS.map((p) => [p.code, normalize(`${p.code} ${p.labelPt}`)])
);

/**
 * Multi-field fuzzy search: each word must match name, club, or position (code + label).
 * Accent-insensitive comparison.
 */
function multiFieldMatch(player: Player, words: string[]): boolean {
  const nameNorm = normalize(player.name);
  const clubNorm = normalize(player.club);
  const posNorm = player.positionNormalized
    ? (POSITION_SEARCH_MAP.get(player.positionNormalized) ?? normalize(player.positionNormalized))
    : '';

  return words.every((word) =>
    nameNorm.includes(word) || clubNorm.includes(word) || posNorm.includes(word)
  );
}

export function PlayersView() {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);

  /* ───────────── Debounce search input ───────────── */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /* ───────────── Fetch all players (paginated past Supabase 1000-row limit) ───────────── */

  /** Paginate through all rows to bypass the 1000-row Supabase limit */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fetchAll<T>(supabase: ReturnType<typeof createClient>, buildQuery: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
    return (async () => {
      const all: T[] = [];
      let offset = 0;
      for (;;) {
        const { data, error } = await buildQuery(offset, offset + SUPABASE_PAGE - 1);
        if (error || !data?.length) break;
        all.push(...(data as T[]));
        if (data.length < SUPABASE_PAGE) break;
        offset += SUPABASE_PAGE;
      }
      return all;
    })();
  }

  function fetchPlayers() {
    const supabase = createClient();

    Promise.all([
      fetchAll<PlayerRow>(supabase, (from, to) => supabase.from('players').select('*').eq('pending_approval', false).order('name').range(from, to)),
      fetchAll<{ player_id: number; rating: number }>(supabase, (from, to) => supabase.from('scouting_reports').select('player_id, rating').not('rating', 'is', null).range(from, to)),
      fetchAll<{ player_id: number; rating: number }>(supabase, (from, to) => supabase.from('scout_evaluations').select('player_id, rating').range(from, to)),
      fetchAll<{ player_id: number; content: string; created_at: string }>(supabase, (from, to) => supabase.from('observation_notes').select('player_id, content, created_at').order('created_at', { ascending: false }).range(from, to)),
    ]).then(([playersData, reportsData, evalsData, notesData]) => {
      if (!playersData.length) {
        setLoading(false);
        return;
      }

      // Build map: playerId → all note contents (newest first, already sorted)
      const notesMap = new Map<number, string[]>();
      for (const n of notesData) {
        const arr = notesMap.get(n.player_id) ?? [];
        arr.push(n.content);
        notesMap.set(n.player_id, arr);
      }

      const mapped = playersData.map((row) => {
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

      for (const r of reportsData) addRating(r.player_id, r.rating);
      for (const e of evalsData) addRating(e.player_id, e.rating);

      // Merge into players
      for (const p of mapped) {
        const stats = agg.get(p.id);
        if (stats) {
          p.reportAvgRating = Math.round((stats.sum / stats.count) * 10) / 10;
          p.reportRatingCount = stats.count;
        }
      }

      setAllPlayers(mapped);
      setLoading(false);
    });
  }

  useEffect(() => {
    fetchPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────────── Realtime: refetch when other users modify players ───────────── */

  useRealtimeTable('players', { onAny: () => fetchPlayers() });

  /* ───────────── Client-side filtering + search ───────────── */

  const filtered = useMemo(() => {
    let result = allPlayers;

    // Multi-field search (accent-insensitive)
    if (debouncedSearch) {
      const words = normalize(debouncedSearch).split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        result = result.filter((p) => multiFieldMatch(p, words));
      }
    }

    // Dropdown filters
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

    // Date range filter
    if (filters.dobFrom) result = result.filter((p) => p.dob && p.dob >= filters.dobFrom);
    if (filters.dobTo) result = result.filter((p) => p.dob && p.dob <= filters.dobTo);

    return result;
  }, [allPlayers, debouncedSearch, filters]);

  // Reset to first page when filters/search change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filters]);

  // Unique clubs for filter dropdown
  const clubs = useMemo(() => {
    const set = new Set(allPlayers.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort();
  }, [allPlayers]);

  // Unique birth years for filter dropdown
  const birthYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of allPlayers) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [allPlayers]);

  const hasFilters = Object.values(filters).some(Boolean);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Search + filter button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar jogador, clube, posição..."
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

      {/* Players + pagination */}
      {!loading && (
        <>
          {/* Results count */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}</span>
            {totalPages > 1 && (
              <span>Página {page + 1} de {totalPages}</span>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <PlayerTable players={pageSlice} />
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {pageSlice.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum jogador encontrado.
              </p>
            )}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

/* ───────────── Pagination Controls ───────────── */

function PaginationControls({ page, totalPages, onPageChange }: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Show at most 5 page buttons centered around current page
  const maxButtons = 5;
  let start = Math.max(0, page - Math.floor(maxButtons / 2));
  const end = Math.min(totalPages, start + maxButtons);
  if (end - start < maxButtons) start = Math.max(0, end - maxButtons);
  const pages = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="flex items-center justify-center gap-1 py-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((p) => (
        <Button
          key={p}
          variant={p === page ? 'default' : 'outline'}
          size="sm"
          className="h-8 w-8 px-0"
          onClick={() => onPageChange(p)}
        >
          {p + 1}
        </Button>
      ))}

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página seguinte"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

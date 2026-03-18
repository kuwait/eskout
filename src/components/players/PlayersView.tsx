// src/components/players/PlayersView.tsx
// Client component orchestrating the player list with client-side pagination (50/page)
// Fetches all players from Supabase once, applies multi-field search + filters in-memory
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { getObservationTier, POSITIONS } from '@/lib/constants';
import { getPlayingUpPlayerIds } from '@/actions/players';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerTable } from '@/components/players/PlayerTable';
import { PlayerCard } from '@/components/players/PlayerCard';
import { PlayerFilters } from '@/components/players/PlayerFilters';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import type { Player, PlayerRow } from '@/lib/types';

export interface PlayerFilterState {
  position: string;
  club: string;
  nationality: string;
  opinion: string;
  foot: string;
  status: string;
  shadowSquad: string;
  realSquad: string;
  birthYear: string;
  dobFrom: string;
  dobTo: string;
  observationTier: string;
  playingUp: string;
}

const EMPTY_FILTERS: PlayerFilterState = {
  position: '',
  club: '',
  nationality: '',
  opinion: '',
  foot: '',
  status: '',
  shadowSquad: '',
  realSquad: '',
  birthYear: '',
  dobFrom: '',
  dobTo: '',
  observationTier: '',
  playingUp: '',
};

/* ───────────── Config ───────────── */

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/* ───────────── Accent-insensitive search helpers ───────────── */

import { normalize } from '@/lib/utils';

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

export function PlayersView({ hideEvaluations = false, clubId }: { hideEvaluations?: boolean; clubId: string }) {
  const searchParams = useSearchParams();
  const initialClub = searchParams.get('clube') ?? '';
  const initialNationality = searchParams.get('nacionalidade') ?? '';
  const [pageRows, setPageRows] = useState<Player[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>({ ...EMPTY_FILTERS, club: initialClub, nationality: initialNationality });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Playing-up player IDs from ZZ+FPF (fetched once on mount)
  const [fpfPlayingUp, setFpfPlayingUp] = useState<{ regular: Set<number>; pontual: Set<number> }>({ regular: new Set(), pontual: new Set() });
  const [playingUpReady, setPlayingUpReady] = useState(false);

  // Search mode: when search is active we fetch the full pool and filter client-side
  const [searchPool, setSearchPool] = useState<Player[]>([]);
  const isSearchMode = debouncedSearch.length > 0 || filters.observationTier !== '' || (filters.playingUp !== '' && playingUpReady);

  // Dropdown options (fetched once)
  const [clubs, setClubs] = useState<string[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [birthYears, setBirthYears] = useState<number[]>([]);

  /* ───────────── Debounce search input ───────────── */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /* ───────────── Shared: build query with structural filters ───────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyStructuralFilters = useCallback((q: any) => {
    if (filters.position) q = q.or(`position_normalized.eq.${filters.position},secondary_position.eq.${filters.position},tertiary_position.eq.${filters.position}`);
    if (filters.club) q = q.eq('club', filters.club);
    if (filters.nationality) q = q.eq('nationality', filters.nationality);
    if (filters.opinion) q = q.contains('department_opinion', [filters.opinion]);
    if (filters.foot) q = q.eq('foot', filters.foot);
    if (filters.status) q = q.eq('recruitment_status', filters.status);
    if (filters.shadowSquad === 'yes') q = q.eq('is_shadow_squad', true);
    if (filters.shadowSquad === 'no') q = q.eq('is_shadow_squad', false);
    if (filters.realSquad === 'yes') q = q.eq('is_real_squad', true);
    if (filters.realSquad === 'no') q = q.eq('is_real_squad', false);
    if (filters.birthYear) {
      const yr = parseInt(filters.birthYear, 10);
      q = q.gte('dob', `${yr}-01-01`).lte('dob', `${yr}-12-31`);
    }
    if (filters.dobFrom) q = q.gte('dob', filters.dobFrom);
    if (filters.dobTo) q = q.lte('dob', filters.dobTo);
    return q;
  }, [filters.position, filters.club, filters.nationality, filters.opinion, filters.foot, filters.status, filters.shadowSquad, filters.realSquad, filters.birthYear, filters.dobFrom, filters.dobTo]);

  /* ───────────── Enrich players with ratings + notes ───────────── */

  const enrichPlayers = useCallback(async (rows: PlayerRow[]): Promise<Player[]> => {
    if (rows.length === 0) return [];
    const supabase = createClient();
    const ids = rows.map((r) => r.id);

    // Fetch ratings + notes only for these players
    const [reportsRes, evalsRes, notesRes] = await Promise.all([
      supabase.from('scouting_reports').select('player_id, rating').in('player_id', ids).not('rating', 'is', null),
      supabase.from('scout_evaluations').select('player_id, rating').in('player_id', ids),
      supabase.from('observation_notes').select('player_id, content, created_at').in('player_id', ids).order('created_at', { ascending: false }),
    ]);

    const notesMap = new Map<number, string[]>();
    for (const n of (notesRes.data ?? [])) {
      const arr = notesMap.get(n.player_id) ?? [];
      arr.push(n.content);
      notesMap.set(n.player_id, arr);
    }

    const agg = new Map<number, { sum: number; count: number }>();
    const addRating = (pid: number, r: number) => {
      const e = agg.get(pid) ?? { sum: 0, count: 0 };
      e.sum += r; e.count += 1;
      agg.set(pid, e);
    };
    for (const r of (reportsRes.data ?? [])) addRating(r.player_id, r.rating);
    for (const e of (evalsRes.data ?? [])) addRating(e.player_id, e.rating);

    return rows.map((row) => {
      const player = mapPlayerRow(row);
      player.observationNotePreviews = notesMap.get(row.id) ?? [];
      const stats = agg.get(row.id);
      if (stats) {
        player.reportAvgRating = Math.round((stats.sum / stats.count) * 10) / 10;
        player.reportRatingCount = stats.count;
      }
      return player;
    });
  }, []);

  /* ───────────── Mode 1: Server-side pagination (no search) ───────────── */

  const fetchPage = useCallback(async () => {
    if (isSearchMode) return;
    setLoading(true);
    const supabase = createClient();

    // Fetch one page + total count
    let q = supabase.from('players').select('*', { count: 'exact' }).eq('club_id', clubId).eq('pending_approval', false);
    q = applyStructuralFilters(q);

    const from = page * PAGE_SIZE;
    const { data, count, error } = await q.order('name').range(from, from + PAGE_SIZE - 1);

    if (!error && data) {
      const enriched = await enrichPlayers(data as PlayerRow[]);
      setPageRows(enriched);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [clubId, applyStructuralFilters, page, isSearchMode, enrichPlayers]);

  useEffect(() => { fetchPage(); }, [fetchPage]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch

  /* ───────────── Mode 2: Server-side search for text queries ───────────── */

  const fetchSearchPool = useCallback(async () => {
    if (!isSearchMode) { setSearchPool([]); return; }
    setLoading(true);
    const supabase = createClient();

    let q = supabase.from('players').select('*', { count: 'exact' }).eq('club_id', clubId).eq('pending_approval', false);
    q = applyStructuralFilters(q);

    // Server-side text search — up to 3 words
    if (debouncedSearch) {
      const words = debouncedSearch.trim().split(/\s+/).filter((w: string) => w.length >= 2);
      let searchWords: string[];
      if (words.length <= 3) {
        searchWords = words;
      } else {
        searchWords = [words[0], words[words.length - 2], words[words.length - 1]];
      }
      for (const word of searchWords) {
        q = q.or(`name.ilike.%${word}%,club.ilike.%${word}%`);
      }
    }

    // Playing-up filter: narrow to known IDs server-side (wait for IDs to load first)
    if (filters.playingUp && playingUpReady) {
      let ids: number[] = [];
      if (filters.playingUp === 'regular') ids = [...fpfPlayingUp.regular];
      else if (filters.playingUp === 'pontual') ids = [...fpfPlayingUp.pontual];
      else ids = [...fpfPlayingUp.regular, ...fpfPlayingUp.pontual];
      if (ids.length > 0) q = q.in('id', ids);
      else { setSearchPool([]); setLoading(false); return; }
    }

    // Fetch results — paginated up to 5000 for computed-field filters
    const { data, count, error } = await q.order('name').range(0, 4999);
    if (error || !data) { setSearchPool([]); setLoading(false); return; }

    const enriched = await enrichPlayers(data as PlayerRow[]);
    setSearchPool(enriched);
    setLoading(false);
  }, [clubId, applyStructuralFilters, isSearchMode, debouncedSearch, enrichPlayers, filters.playingUp, playingUpReady, fpfPlayingUp]);

  useEffect(() => { fetchSearchPool(); }, [fetchSearchPool]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch

  /* ───────────── Realtime ───────────── */

  useRealtimeTable('players', { onAny: () => { if (isSearchMode) fetchSearchPool(); else fetchPage(); } });

  /* ───────────── Client-side observationTier filter on search results ───────────── */

  const searchFiltered = useMemo(() => {
    if (!isSearchMode) return [];
    let result = searchPool;
    if (filters.observationTier) {
      result = result.filter((p) => getObservationTier(p) === filters.observationTier);
    }
    if (filters.playingUp) {
      result = result.filter((p) => {
        const isUp = p.playingUpRegular || p.playingUpPontual;
        if (filters.playingUp === 'regular') return p.playingUpRegular === true;
        if (filters.playingUp === 'pontual') return p.playingUpPontual === true;
        if (filters.playingUp === 'any') return isUp;
        return true;
      });
    }
    return result;
  }, [isSearchMode, searchPool, filters.observationTier, filters.playingUp]);

  /* ───────────── Unified view: pick source based on mode ───────────── */

  const effectiveTotalCount = isSearchMode ? searchFiltered.length : totalCount;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / PAGE_SIZE));
  const rawPageSlice = isSearchMode
    ? searchFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    : pageRows;

  // Enrich with FPF playing-up flags (lazy — doesn't trigger re-fetch)
  const pageSlice = useMemo(() => rawPageSlice.map((p) => {
    if (!p.playingUpRegular && fpfPlayingUp.regular.has(p.id)) return { ...p, playingUpRegular: true };
    if (!p.playingUpPontual && !p.playingUpRegular && fpfPlayingUp.pontual.has(p.id)) return { ...p, playingUpPontual: true };
    return p;
  }), [rawPageSlice, fpfPlayingUp]);

  // Reset to first page when filters/search change
  useEffect(() => { setPage(0); }, [debouncedSearch, filters]); // eslint-disable-line react-hooks/set-state-in-effect -- reset page on filter change

  /* ───────────── Fetch dropdown options once ───────────── */

  useEffect(() => {
    const supabase = createClient();
    // Fetch all unique values — use range(0, 5000) to bypass Supabase 1000-row default limit
    Promise.all([
      supabase.from('players').select('club').eq('club_id', clubId).not('club', 'is', null).range(0, 4999),
      supabase.from('players').select('nationality').eq('club_id', clubId).not('nationality', 'is', null).range(0, 4999),
      supabase.from('players').select('dob').eq('club_id', clubId).not('dob', 'is', null).range(0, 4999),
    ]).then(([clubsRes, natRes, dobRes]) => {
      if (clubsRes.data) setClubs(Array.from(new Set(clubsRes.data.map((r) => r.club as string).filter(Boolean))).sort());
      if (natRes.data) setNationalities(Array.from(new Set(natRes.data.map((r) => r.nationality as string).filter(Boolean))).sort());
      if (dobRes.data) {
        const yrs = new Set<number>();
        for (const r of dobRes.data) { const y = new Date(r.dob as string).getFullYear(); if (!isNaN(y)) yrs.add(y); }
        setBirthYears(Array.from(yrs).sort((a, b) => b - a));
      }
    });
    // Fetch playing-up IDs (ZZ + FPF combined) to enrich table badges + filter
    getPlayingUpPlayerIds(clubId).then((ids) => {
      setFpfPlayingUp({ regular: new Set(ids.regular), pontual: new Set(ids.pontual) });
      setPlayingUpReady(true);
    }).catch(() => setPlayingUpReady(true));
  }, [clubId]);

  const hasFilters = Object.values(filters).some(Boolean);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search + filter button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar jogador, clube, posição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-transparent bg-muted/50 pl-10 pr-9 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/20"
            aria-label="Pesquisar jogador"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label="Limpar pesquisa">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
          nationalities={nationalities}
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
              nationalities={nationalities}
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
            <span>{effectiveTotalCount} jogador{effectiveTotalCount !== 1 ? 'es' : ''}</span>
            {totalPages > 1 && (
              <span>Página {page + 1} de {totalPages}</span>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <PlayerTable players={pageSlice} hideEvaluations={hideEvaluations} />
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {pageSlice.map((player) => (
              <PlayerCard key={player.id} player={player} hideEvaluations={hideEvaluations} />
            ))}
            {effectiveTotalCount === 0 && (
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

// src/components/players/PlayersView.tsx
// Client component orchestrating the player list with full server-side pagination (50/page)
// All filters (including observationTier and playingUp) are applied server-side — no fetch-all
// RELEVANT FILES: src/components/players/PlayerTable.tsx, src/components/players/PlayerCard.tsx, src/components/players/PlayerFilters.tsx

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
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

/** Server-rendered initial data from get_players_page RPC */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PlayersPageData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  players: any[];
  total_count: number;
  options: { clubs: string[]; nationalities: string[]; birth_years: number[] };
}

export function PlayersView({ hideEvaluations = false, clubId, initialData }: { hideEvaluations?: boolean; clubId: string; initialData?: PlayersPageData | null }) {
  const searchParams = useSearchParams();
  const initialClub = searchParams.get('clube') ?? '';
  const initialNationality = searchParams.get('nacionalidade') ?? '';

  // Initialize from server-rendered data when available (instant render)
  const [pageRows, setPageRows] = useState<Player[]>(() => {
    if (!initialData?.players?.length) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return initialData.players.map((row: any) => {
      const player = mapPlayerRow(row as PlayerRow);
      // Hydrate enrichment from RPC (avg_rating, rating_count, note_previews)
      if (row.avg_rating != null) {
        player.reportAvgRating = Number(row.avg_rating);
        player.reportRatingCount = row.rating_count ?? 0;
      }
      if (Array.isArray(row.note_previews)) {
        player.observationNotePreviews = row.note_previews;
      }
      return player;
    });
  });
  const [totalCount, setTotalCount] = useState(initialData?.total_count ?? 0);
  const [loading, setLoading] = useState(!initialData?.players?.length);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>({ ...EMPTY_FILTERS, club: initialClub, nationality: initialNationality });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Playing-up player IDs from ZZ+FPF (fetched once on mount)
  const [fpfPlayingUp, setFpfPlayingUp] = useState<{ regular: Set<number>; pontual: Set<number> }>({ regular: new Set(), pontual: new Set() });
  const [playingUpReady, setPlayingUpReady] = useState(false);

  // Stable array of playing-up IDs — only recomputes when filter is active AND IDs change
  // Prevents applyAllFilters/fetchPage from recreating when playingUpReady changes but filter is off
  const playingUpIds = useMemo<number[] | null>(() => {
    if (!filters.playingUp || !playingUpReady) return null;
    if (filters.playingUp === 'regular') return [...fpfPlayingUp.regular];
    if (filters.playingUp === 'pontual') return [...fpfPlayingUp.pontual];
    return [...fpfPlayingUp.regular, ...fpfPlayingUp.pontual];
  }, [filters.playingUp, playingUpReady, fpfPlayingUp]);

  // Dropdown options (initialized from server data, fetched client-side as fallback)
  const [clubs, setClubs] = useState<string[]>(initialData?.options?.clubs ?? []);
  const [nationalities, setNationalities] = useState<string[]>(initialData?.options?.nationalities ?? []);
  const [birthYears, setBirthYears] = useState<number[]>(initialData?.options?.birth_years ?? []);

  // Ref to cancel stale fetches (prevents race condition when deps change mid-fetch)
  const fetchCancelRef = useRef(0);

  /* ───────────── Debounce search input ───────────── */

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  /* ───────────── Build query with ALL filters server-side ───────────── */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyAllFilters = useCallback((q: any) => {
    // Structural filters (direct column matches)
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

    // Observation tier — translated to SQL column conditions:
    // 'observado' = has at least one non-null report_link_* column
    // 'referenciado' = referred_by is not empty (and no reports)
    // 'adicionado' = no reports and no referred_by
    if (filters.observationTier === 'observado') {
      q = q.or('report_link_1.not.is.null,report_link_2.not.is.null,report_link_3.not.is.null,report_link_4.not.is.null,report_link_5.not.is.null,report_link_6.not.is.null');
    } else if (filters.observationTier === 'referenciado') {
      // No report links AND has referred_by
      q = q.is('report_link_1', null).is('report_link_2', null).is('report_link_3', null)
        .is('report_link_4', null).is('report_link_5', null).is('report_link_6', null)
        .neq('referred_by', '').not('referred_by', 'is', null);
    } else if (filters.observationTier === 'adicionado') {
      // No report links AND no referred_by
      q = q.is('report_link_1', null).is('report_link_2', null).is('report_link_3', null)
        .is('report_link_4', null).is('report_link_5', null).is('report_link_6', null)
        .or('referred_by.is.null,referred_by.eq.');
    }

    // Playing-up filter: narrow to known IDs server-side
    if (filters.playingUp && playingUpIds) {
      if (playingUpIds.length > 0) q = q.in('id', playingUpIds);
      else q = q.in('id', [-1]); // no matches — impossible ID to return empty
    }

    // Text search — server-side ilike, up to 3 words
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

    return q;
  }, [filters, debouncedSearch, playingUpIds]);

  /* ───────────── Enrich players with ratings + notes ───────────── */

  const enrichPlayers = useCallback(async (rows: PlayerRow[]): Promise<Player[]> => {
    if (rows.length === 0) return [];
    const supabase = createClient();
    const ids = rows.map((r) => r.id);

    // Fetch ratings + notes only for these players (scoped to page — max 50 IDs)
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

  /* ───────────── Unified server-side paginated fetch ───────────── */

  // Track the previous playingUpReady to detect when ONLY it changed (causes useless refetch)
  // prevPlayingUpReadyRef removed — needsFetch pattern handles skip logic

  const fetchPage = useCallback(async (fetchId?: number) => {
    setLoading(true);
    const supabase = createClient();

    let q = supabase.from('players').select('*', { count: 'exact' }).eq('club_id', clubId).eq('pending_approval', false);
    q = applyAllFilters(q);

    const from = page * PAGE_SIZE;
    const { data, count, error } = await q.order('name').range(from, from + PAGE_SIZE - 1);

    // Stale fetch guard
    if (fetchId !== undefined && fetchId !== fetchCancelRef.current) return;

    if (!error && data) {
      const enriched = await enrichPlayers(data as PlayerRow[]);
      // Check stale again after async enrichment
      if (fetchId !== undefined && fetchId !== fetchCancelRef.current) return;
      setPageRows(enriched);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [clubId, applyAllFilters, page, enrichPlayers]);

  // Tracks whether the user has changed search/filter/page since mount.
  // When initialData is provided, the first render already has page 0 data — skip fetch until user acts.
  const needsFetch = useRef(!initialData?.players?.length || !!initialClub || !!initialNationality);
  useEffect(() => {
    if (!needsFetch.current) return;
    const id = ++fetchCancelRef.current;
    fetchPage(id);
  }, [fetchPage]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch

  // When search, filters, or page change, mark that we need to fetch
  // Skip on mount (initial values aren't user-driven)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    needsFetch.current = true;
  }, [debouncedSearch, filters, page]);

  /* ───────────── Realtime ───────────── */

  useRealtimeTable('players', { onAny: () => { needsFetch.current = true; fetchPage(++fetchCancelRef.current); } });

  /* ───────────── Enrich with FPF playing-up flags (lazy overlay) ───────────── */

  const pageSlice = useMemo(() => pageRows.map((p) => {
    if (!p.playingUpRegular && fpfPlayingUp.regular.has(p.id)) return { ...p, playingUpRegular: true };
    if (!p.playingUpPontual && !p.playingUpRegular && fpfPlayingUp.pontual.has(p.id)) return { ...p, playingUpPontual: true };
    return p;
  }), [pageRows, fpfPlayingUp]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Reset to first page when filters/search change
  useEffect(() => { setPage(0); }, [debouncedSearch, filters]); // eslint-disable-line react-hooks/set-state-in-effect -- reset page on filter change

  /* ───────────── Fetch dropdown options once via RPC ───────────── */

  // Fetch dropdown options only if NOT already provided by server
  const hasServerOptions = useRef(clubs.length > 0);
  useEffect(() => {
    if (!hasServerOptions.current) {
      const supabase = createClient();
      supabase.rpc('distinct_player_options', { p_club_id: clubId }).then(({ data, error }) => {
        if (!error && data) {
          const opts = data as { clubs: string[]; nationalities: string[]; birth_years: number[] };
          setClubs(opts.clubs ?? []);
          setNationalities(opts.nationalities ?? []);
          setBirthYears(opts.birth_years ?? []);
        }
      });
    }
    // Fetch playing-up IDs (ZZ + FPF combined) to enrich table badges + filter
    getPlayingUpPlayerIds(clubId).then((ids) => {
      setFpfPlayingUp({ regular: new Set(ids.regular), pontual: new Set(ids.pontual) });
      setPlayingUpReady(true);
    }).catch(() => setPlayingUpReady(true));
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps -- hasServerOptions is stable ref

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
            <span>{totalCount} jogador{totalCount !== 1 ? 'es' : ''}</span>
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
            {totalCount === 0 && (
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

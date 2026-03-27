// src/app/observacoes/[id]/browse-fpf/BrowseFpfClient.tsx
// Client component for the FPF live match browser — filters, results, multi-select, batch add
// Mobile-first fullscreen layout for coordinators to discover and add FPF matches to a round
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse-by-date.ts, src/actions/scouting-games.ts, fpf-data.ts

'use client';

import { useState, useMemo, useCallback, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe, Search, Loader2, AlertCircle, RefreshCw, Plus, X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { browseFpfByDate } from '@/actions/scraping/fpf-competitions/browse-by-date';
import { addBatchGames } from '@/actions/scouting-games';
import { FPF_ASSOCIATIONS, FPF_FOOTBALL_CLASSES } from '@/actions/scraping/fpf-competitions/fpf-data';
import type { FpfBrowseCompetition, FpfBrowseMatch } from '@/actions/scraping/fpf-competitions/fpf-data';
import type { ScoutingRound, ScoutingGame } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ───────────── Types ───────────── */

interface BrowseSource {
  type: 'FPF' | 'Association';
  id?: number;
  label: string;
}

type TimePeriod = 'all' | 'morning' | 'afternoon' | 'evening';

/* ───────────── Constants ───────────── */

const DEFAULT_SOURCES: BrowseSource[] = [
  { type: 'Association', id: 232, label: 'AF Porto' },
  { type: 'FPF', label: 'FPF Nacional' },
];

const TIME_PERIODS: { value: TimePeriod; label: string; short: string }[] = [
  { value: 'all', label: 'Todos', short: 'Todos' },
  { value: 'morning', label: 'Manhã', short: 'M' },
  { value: 'afternoon', label: 'Tarde', short: 'T' },
  { value: 'evening', label: 'Noite', short: 'N' },
];

/* ───────────── Helpers ───────────── */

/** Get day tabs for the round date range */
function getRoundDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const current = new Date(sy, sm - 1, sd);
  while (true) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (dateStr > endDate) break;
    days.push(dateStr);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/** Format a date string as "Sáb 28" */
function formatDayTab(date: string): string {
  const d = new Date(date + 'T12:00:00');
  const weekday = d.toLocaleDateString('pt-PT', { weekday: 'short' });
  const day = d.getDate();
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day}`;
}

/** Check if a match time falls in a period */
function matchTimeInPeriod(matchTime: string | null, period: TimePeriod): boolean {
  if (period === 'all') return true;
  if (!matchTime) return true; // Show matches without time in all periods
  const [h] = matchTime.split(':').map(Number);
  if (period === 'morning') return h < 12;
  if (period === 'afternoon') return h >= 12 && h < 18;
  return h >= 18; // evening
}

/** Build composite key for dedup (same logic as server) */
function buildGameKey(g: ScoutingGame): string {
  return `${g.homeTeam.toLowerCase()}|${g.awayTeam.toLowerCase()}|${g.matchDate}|${g.matchTime ?? ''}`;
}

/** Cache key for results */
function cacheKey(day: string, source: BrowseSource, classId: number | null): string {
  return `${day}|${source.type}|${source.id ?? ''}|${classId ?? 'all'}`;
}

/* ───────────── localStorage Persistence ───────────── */

const STORAGE_KEY = 'fpf-browse-filters';

function loadSavedFilters(): { classes: number[]; sources: BrowseSource[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.classes) && Array.isArray(parsed.sources)) {
      return { classes: parsed.classes, sources: parsed.sources };
    }
  } catch { /* ignore */ }
  return null;
}

function saveFilters(classes: number[], sources: BrowseSource[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ classes, sources }));
  } catch { /* ignore */ }
}

/* ───────────── Component ───────────── */

export function BrowseFpfClient({
  round,
  existingGames,
}: {
  round: ScoutingRound;
  existingGames: ScoutingGame[];
}) {
  const days = useMemo(() => getRoundDays(round.startDate, round.endDate), [round.startDate, round.endDate]);

  // Load saved filters from localStorage (or use defaults)
  const savedFilters = useMemo(() => loadSavedFilters(), []);

  /* ── State ── */
  const [activeDay, setActiveDay] = useState(days[0] ?? round.startDate);
  const [selectedClasses, setSelectedClasses] = useState<number[]>(savedFilters?.classes ?? []);
  const [selectedSources, setSelectedSources] = useState<BrowseSource[]>(savedFilters?.sources ?? DEFAULT_SOURCES);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [resultsCache, setResultsCache] = useState<Map<string, FpfBrowseCompetition[]>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() =>
    new Set(existingGames.map(buildGameKey)),
  );
  const [showAssocPicker, setShowAssocPicker] = useState(false);
  const [collapsedComps, setCollapsedComps] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── Fetch logic ── */
  const fetchMatches = useCallback(async () => {
    if (selectedSources.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Build requests for each (source, classId) combination
      const requests: { source: BrowseSource; classId: number | null; key: string }[] = [];

      for (const source of selectedSources) {
        if (selectedClasses.length === 0) {
          // "Todos" — one request without classId per source
          const k = cacheKey(activeDay, source, null);
          if (!resultsCache.has(k)) {
            requests.push({ source, classId: null, key: k });
          }
        } else {
          for (const classId of selectedClasses) {
            const k = cacheKey(activeDay, source, classId);
            if (!resultsCache.has(k)) {
              requests.push({ source, classId, key: k });
            }
          }
        }
      }

      if (requests.length === 0) {
        setLoading(false);
        return; // All data already cached
      }

      // Execute in parallel
      const results = await Promise.all(
        requests.map(async (req) => {
          const res = await browseFpfByDate({
            date: activeDay,
            organizationType: req.source.type,
            associationId: req.source.id,
            footballClassId: req.classId ?? undefined,
          });
          return { key: req.key, data: res.success ? res.data ?? [] : [], error: res.success ? null : res.error };
        }),
      );

      // Update cache
      setResultsCache((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          next.set(r.key, r.data);
        }
        return next;
      });

      // Check for errors
      const errors = results.filter((r) => r.error);
      if (errors.length === results.length) {
        setError(errors[0]?.error ?? 'Erro ao carregar jogos');
      }
    } catch {
      setError('Erro inesperado ao carregar jogos da FPF');
    } finally {
      setLoading(false);
    }
  }, [activeDay, selectedSources, selectedClasses, resultsCache]);

  // Fetch on filter changes
  useEffect(() => {
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, selectedSources, selectedClasses]);

  // Persist filter choices to localStorage
  useEffect(() => {
    saveFilters(selectedClasses, selectedSources);
  }, [selectedClasses, selectedSources]);

  /* ── Merged + filtered results ── */
  const displayResults = useMemo(() => {
    const allComps: FpfBrowseCompetition[] = [];
    const seenCompKeys = new Set<string>();

    for (const source of selectedSources) {
      const classIds = selectedClasses.length === 0 ? [null] : selectedClasses;
      for (const classId of classIds) {
        const k = cacheKey(activeDay, source, classId);
        const comps = resultsCache.get(k);
        if (!comps) continue;
        for (const comp of comps) {
          // Dedup competitions by name (same comp may appear in multiple requests)
          const compKey = `${comp.name}|${comp.competitionId}`;
          if (seenCompKeys.has(compKey)) continue;
          seenCompKeys.add(compKey);
          allComps.push(comp);
        }
      }
    }

    // Apply client-side filters
    const searchLower = teamSearch.toLowerCase().trim();

    return allComps.map((comp) => ({
      ...comp,
      series: comp.series
        .map((s) => ({
          ...s,
          matches: s.matches.filter((m) => {
            // Time filter
            if (!matchTimeInPeriod(m.matchTime, timePeriod)) return false;
            // Team search
            if (searchLower && !m.homeTeam.toLowerCase().includes(searchLower) && !m.awayTeam.toLowerCase().includes(searchLower)) {
              return false;
            }
            return true;
          }),
        }))
        .filter((s) => s.matches.length > 0),
    })).filter((comp) => comp.series.length > 0);
  }, [resultsCache, activeDay, selectedSources, selectedClasses, timePeriod, teamSearch]);

  /* ── Total match count ── */
  const totalMatches = useMemo(
    () => displayResults.reduce((sum, c) => sum + c.series.reduce((s2, s) => s2 + s.matches.length, 0), 0),
    [displayResults],
  );

  /* ── Toggle selection ── */
  const toggleMatch = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── Batch add ── */
  const handleAdd = useCallback(() => {
    // Collect selected matches from results
    const matchesMap = new Map<string, FpfBrowseMatch>();
    for (const comp of displayResults) {
      for (const s of comp.series) {
        for (const m of s.matches) {
          if (selected.has(m.key)) matchesMap.set(m.key, m);
        }
      }
    }

    const matchesToAdd = Array.from(matchesMap.values());
    if (!matchesToAdd.length) return;

    startTransition(async () => {
      const result = await addBatchGames(
        round.id,
        matchesToAdd.map((m) => ({
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          matchDate: m.matchDate,
          matchTime: m.matchTime ?? undefined,
          venue: m.venue ?? undefined,
          competitionName: m.competitionName,
          escalao: m.escalao ?? undefined,
        })),
      );

      if (result.success && result.data) {
        const { added, duplicates } = result.data;
        if (duplicates > 0) {
          toast.success(`${added} jogo${added !== 1 ? 's' : ''} adicionado${added !== 1 ? 's' : ''}, ${duplicates} duplicado${duplicates !== 1 ? 's' : ''} ignorado${duplicates !== 1 ? 's' : ''}`);
        } else {
          toast.success(`${added} jogo${added !== 1 ? 's' : ''} adicionado${added !== 1 ? 's' : ''}`);
        }
        // Update added keys so they show as disabled
        setAddedKeys((prev) => {
          const next = new Set(prev);
          for (const m of matchesToAdd) next.add(m.key);
          return next;
        });
        setSelected(new Set());
      } else {
        toast.error(result.error ?? 'Erro ao adicionar jogos');
      }
    });
  }, [displayResults, selected, round.id, startTransition]);

  /* ── Toggle class filter ── */
  const toggleClass = useCallback((classId: number) => {
    setSelectedClasses((prev) =>
      prev.includes(classId) ? prev.filter((c) => c !== classId) : [...prev, classId],
    );
  }, []);

  /* ── Remove source ── */
  const removeSource = useCallback((label: string) => {
    setSelectedSources((prev) => prev.filter((s) => s.label !== label));
  }, []);

  /* ── Add association ── */
  const addAssociation = useCallback((assoc: { id: number; name: string }) => {
    setSelectedSources((prev) => {
      if (prev.some((s) => s.type === 'Association' && s.id === assoc.id)) return prev;
      return [...prev, { type: 'Association', id: assoc.id, label: assoc.name }];
    });
    setShowAssocPicker(false);
  }, []);

  /* ── Force refresh (clear cache for current filters) ── */
  const forceRefresh = useCallback(() => {
    setResultsCache((prev) => {
      const next = new Map(prev);
      for (const source of selectedSources) {
        const classIds = selectedClasses.length === 0 ? [null] : selectedClasses;
        for (const classId of classIds) {
          next.delete(cacheKey(activeDay, source, classId));
        }
      }
      return next;
    });
    // fetchMatches will re-trigger via useEffect
  }, [activeDay, selectedSources, selectedClasses]);

  /* ── Available associations (not already selected) ── */
  const availableAssociations = useMemo(() => {
    const selectedIds = new Set(selectedSources.filter((s) => s.type === 'Association').map((s) => s.id));
    return FPF_ASSOCIATIONS.filter((a) => !selectedIds.has(a.id));
  }, [selectedSources]);

  const hasResults = !loading && !error && displayResults.length > 0;
  const isEmpty = !loading && !error && displayResults.length === 0 && resultsCache.size > 0;

  /* ───────────── Render ───────────── */
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href={`/observacoes/${round.id}`} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <Globe className="h-4 w-4 shrink-0 text-blue-500" />
              Jogos FPF
            </h1>
            <p className="truncate text-xs text-muted-foreground">{round.name}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={forceRefresh} disabled={loading} className="h-8 w-8 p-0">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {/* ── Day Tabs ── */}
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition',
                day === activeDay
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {formatDayTab(day)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="space-y-3 border-b px-4 py-3">
        {/* Escalão chips */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Escalão</p>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setSelectedClasses([])}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition',
                selectedClasses.length === 0
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              Todos
            </button>
            {FPF_FOOTBALL_CLASSES.map((cls) => (
              <button
                key={cls.id}
                onClick={() => toggleClass(cls.id)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition',
                  selectedClasses.includes(cls.id)
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {cls.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source chips */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fonte</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedSources.map((src) => (
              <span
                key={src.label}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              >
                {src.label}
                <button onClick={() => removeSource(src.label)} className="ml-0.5 hover:text-blue-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="relative">
              <button
                onClick={() => setShowAssocPicker(!showAssocPicker)}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80"
              >
                <Plus className="h-3 w-3" />
                Outra
                <ChevronDown className="h-3 w-3" />
              </button>
              {showAssocPicker && (
                <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {/* FPF Nacional option */}
                  {!selectedSources.some((s) => s.type === 'FPF') && (
                    <button
                      onClick={() => {
                        setSelectedSources((prev) => [...prev, { type: 'FPF', label: 'FPF Nacional' }]);
                        setShowAssocPicker(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      FPF Nacional
                    </button>
                  )}
                  {availableAssociations.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addAssociation(a)}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Time period + search row */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border p-0.5">
            {TIME_PERIODS.map((tp) => (
              <button
                key={tp.value}
                onClick={() => setTimePeriod(tp.value)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] font-medium transition',
                  tp.value === timePeriod
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="hidden sm:inline">{tp.label}</span>
                <span className="sm:hidden">{tp.short}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Pesquisar equipa..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {teamSearch && (
              <button
                onClick={() => setTeamSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto pb-20">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">A carregar jogos FPF...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <AlertCircle className="h-6 w-6 text-red-500" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={forceRefresh} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Empty */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Globe className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sem jogos encontrados para este dia e filtros</p>
          </div>
        )}

        {/* No sources selected */}
        {selectedSources.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <p className="text-sm text-muted-foreground">Seleciona pelo menos uma fonte (associação ou FPF)</p>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div>
            {/* Summary bar */}
            <div className="flex items-center justify-between border-b px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {totalMatches} jogo{totalMatches !== 1 ? 's' : ''} de {displayResults.length} competiç{displayResults.length !== 1 ? 'ões' : 'ão'}
              </p>
              <button
                onClick={() => {
                  setCollapsedComps((prev) => {
                    if (prev.size === displayResults.length) return new Set();
                    return new Set(displayResults.map((c) => `${c.name}|${c.competitionId}`));
                  });
                }}
                className="text-xs font-medium text-blue-600 hover:text-blue-500"
              >
                {collapsedComps.size === displayResults.length ? 'Expandir todas' : 'Colapsar todas'}
              </button>
            </div>

            {/* Competition blocks */}
            {displayResults.map((comp) => {
              const compKey = `${comp.name}|${comp.competitionId}`;
              const isCollapsed = collapsedComps.has(compKey);
              const compMatchCount = comp.series.reduce((sum, s) => sum + s.matches.length, 0);

              return (
              <div key={compKey}>
                {/* Competition header — clickable to collapse/expand */}
                <button
                  onClick={() => setCollapsedComps((prev) => {
                    const next = new Set(prev);
                    if (next.has(compKey)) next.delete(compKey);
                    else next.add(compKey);
                    return next;
                  })}
                  className="mt-1 flex w-full items-center gap-2 border-l-2 border-neutral-900 bg-muted px-4 py-2 text-left first:mt-0 dark:border-white"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{comp.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {comp.jornada ? `${comp.jornada} · ` : ''}{compMatchCount} jogo{compMatchCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>

                {!isCollapsed && comp.series.map((series, si) => (
                  <div key={`${comp.name}-s${si}`}>
                    {/* Series separator */}
                    {series.name && (
                      <div className="px-4 py-1">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          ── {series.name} ──
                        </p>
                      </div>
                    )}

                    {/* Match cards */}
                    {series.matches.map((match) => {
                      const isAdded = addedKeys.has(match.key);
                      const isSelected = selected.has(match.key);

                      return (
                        <div
                          key={match.key}
                          className={cn(
                            'flex items-start gap-3 border-b px-4 py-2.5 transition',
                            isAdded && 'opacity-50',
                            isSelected && !isAdded && 'bg-blue-50 dark:bg-blue-950/20',
                          )}
                        >
                          {/* Checkbox */}
                          <div className="pt-0.5">
                            {isAdded ? (
                              <div className="flex h-4 w-4 items-center justify-center rounded border bg-green-100 dark:bg-green-900/30">
                                <Check className="h-3 w-3 text-green-600" />
                              </div>
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleMatch(match.key)}
                                className="h-4 w-4"
                              />
                            )}
                          </div>

                          {/* Match info */}
                          <div className="min-w-0 flex-1" onClick={() => !isAdded && toggleMatch(match.key)}>
                            <div className="flex items-center gap-2">
                              {match.matchTime && (
                                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium">
                                  {match.matchTime}
                                </span>
                              )}
                              <p className="truncate text-sm font-medium">
                                {match.homeTeam} <span className="text-muted-foreground">vs</span> {match.awayTeam}
                              </p>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {match.venue && <span className="truncate">{match.venue}</span>}
                              {isAdded && (
                                <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Já adicionado
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sticky Bottom Bar ── */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur-sm safe-area-pb">
          <Button
            onClick={handleAdd}
            disabled={isPending}
            className="w-full gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

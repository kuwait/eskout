// src/components/squad/AddToSquadDialog.tsx
// Dialog to search and add a player to real or shadow squad at a specific position
// Fetches players lazily via searchPickerPlayers when opened; text search server-side via ilike
// RELEVANT FILES: src/actions/squads.ts, src/actions/player-lists.ts, src/components/squad/SquadPanelView.tsx, src/lib/constants.ts

'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { POSITION_LABELS, POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import { addToShadowSquad, toggleRealSquad } from '@/actions/squads';
import { searchPickerPlayers, getPickerClubs } from '@/actions/player-lists';
import type { DepartmentOpinion, PickerPlayer } from '@/lib/types';

interface AddToSquadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: string;
  squadType: 'real' | 'shadow';
  /** IDs of players already in the squad — excluded from results */
  excludeIds?: Set<number>;
  /** Pre-fill year filter (generation year of selected age group) */
  initialYear?: string;
  /** Legacy: server action + refetch (used by CampoView) */
  onAdded?: () => void;
  /** Optimistic: parent handles add instantly (used by SquadPanelView) */
  onAddPlayer?: (player: PickerPlayer) => void;
}

interface Filters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
  year: string;
}

const EMPTY_FILTERS: Filters = { search: '', position: '', club: '', opinion: '', foot: '', year: '' };

export function AddToSquadDialog({
  open,
  onOpenChange,
  position,
  squadType,
  excludeIds,
  initialYear,
  onAdded,
  onAddPlayer,
}: AddToSquadDialogProps) {
  /* ───────────── Lazy-loaded player pool ───────────── */

  const [pool, setPool] = useState<PickerPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [clubs, setClubs] = useState<string[]>([]);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Debounce search — same pattern as pipeline dialog */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Pre-fill position + year filters when dialog opens
  // DC_E/DC_D → DC for the position filter (base position code)
  /* eslint-disable react-hooks/set-state-in-effect -- resets filter form when dialog opens with new position/year */
  useEffect(() => {
    if (open) {
      const basePos = position === 'DC_E' || position === 'DC_D' ? 'DC' : position;
      setFilters({
        ...EMPTY_FILTERS,
        position: basePos,
        year: initialYear ?? '',
      });
      setDebouncedSearch('');
      setErrorMsg(null);
    } else {
      // Clean up when dialog closes
      setPool([]);
    }
  }, [open, position, initialYear]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch distinct clubs when dialog opens
  useEffect(() => {
    if (!open) return;
    getPickerClubs().then(setClubs);
  }, [open]);

  // Fetch players via server action when dialog opens or filters change
  // When text search is active, search server-side (fast ilike) and relax position filter
  useEffect(() => {
    if (!open) return;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- data fetch

    const excludeArray = excludeIds ? Array.from(excludeIds) : [];
    searchPickerPlayers({
      search: debouncedSearch || undefined,
      position: filters.position || undefined,
      club: filters.club || undefined,
      opinion: filters.opinion || undefined,
      foot: filters.foot || undefined,
      excludeIds: excludeArray.length > 0 ? excludeArray : undefined,
    }).then((results) => {
      setPool(results);
      setLoading(false);
    });
  }, [open, debouncedSearch, filters.position, filters.club, filters.opinion, filters.foot, excludeIds]);

  const posLabel = (POSITION_LABELS as Record<string, string>)[position] ?? position;
  const title = squadType === 'shadow'
    ? `Plantel Sombra — ${position} (${posLabel})`
    : `Plantel — ${position} (${posLabel})`;

  /** Extract unique birth years from the pool for year filter */
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of pool) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [pool]);

  /* ───────────── Client-side text search + year filter ───────────── */

  const filtered = useMemo(() => {
    let result = pool;
    // Text search is now server-side — only year filter remains client-side
    if (filters.year) {
      const yr = parseInt(filters.year, 10);
      result = result.filter((p) => p.dob && new Date(p.dob).getFullYear() === yr);
    }
    return result.slice(0, 50);
  }, [pool, filters.year]);

  // Shadow squad: year is always locked, so don't count it as a clearable filter
  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot || (squadType === 'real' && filters.year);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleAdd(player: PickerPlayer) {
    setErrorMsg(null);

    // Optimistic path: parent handles state + persistence
    if (onAddPlayer) {
      onAddPlayer(player);
      setFilters({ ...EMPTY_FILTERS, year: squadType === 'shadow' ? (initialYear ?? '') : '' });
      return;
    }

    // Legacy path: dialog handles server action
    startTransition(async () => {
      try {
        const result = squadType === 'shadow'
          ? await addToShadowSquad(player.id, position)
          : await toggleRealSquad(player.id, true, position);

        if (result.success) {
          onAdded?.();
          setFilters({ ...EMPTY_FILTERS, year: squadType === 'shadow' ? (initialYear ?? '') : '' });
          setErrorMsg(null);
          onOpenChange(false);
        } else {
          setErrorMsg(result.error ?? 'Erro desconhecido');
        }
      } catch (err) {
        setErrorMsg(`Erro inesperado: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (isPending) return;
      if (!v) setErrorMsg(null);
      onOpenChange(v);
    }}>
      <DialogContent
        className="max-h-[85vh] overflow-hidden sm:max-w-lg"
        onInteractOutside={(e) => { if (isPending) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Error banner */}
        {errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {errorMsg}
          </div>
        )}



        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar jogador, clube, posição..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="h-10 rounded-xl border-transparent bg-muted/50 pl-10 pr-9 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/20"
            autoFocus
          />
          {filters.search && (
            <button type="button" onClick={() => updateFilter('search', '')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label="Limpar pesquisa">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          <Select value={filters.position || 'all'} onValueChange={(v) => updateFilter('position', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Posição" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Posição</SelectItem>
              {POSITIONS.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.code} — {p.labelPt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.club || 'all'} onValueChange={(v) => updateFilter('club', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Clube" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Clube</SelectItem>
              {clubs.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.opinion || 'all'} onValueChange={(v) => updateFilter('opinion', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Opinião" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Opinião</SelectItem>
              {DEPARTMENT_OPINIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.foot || 'all'} onValueChange={(v) => updateFilter('foot', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Pé" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Pé</SelectItem>
              {FOOT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Year filter — only for real squad (shadow already filtered by year) */}
          {squadType === 'real' && (
            <Select value={filters.year || 'all'} onValueChange={(v) => updateFilter('year', v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ano</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters({
              ...EMPTY_FILTERS,
              // Preserve search text when clearing structural filters
              search: filters.search,
              // Shadow squad: year is always locked to the generation — never cleared
              year: squadType === 'shadow' ? (initialYear ?? '') : '',
            })}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>

        {/* Results count / loading */}
        <p className="text-xs text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              A carregar jogadores...
            </span>
          ) : (
            `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`
          )}
        </p>

        {/* Player list */}
        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {!loading && filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {filtered.map((player) => (
            <div key={player.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{player.name}</p>
                  <OpinionBadge opinion={(player.departmentOpinion[0] as DepartmentOpinion) ?? null} className="shrink-0" />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {player.club}
                  {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                  {player.foot ? ` · ${player.foot}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={isPending}
                onClick={(e) => { e.stopPropagation(); handleAdd(player); }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Adicionar
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

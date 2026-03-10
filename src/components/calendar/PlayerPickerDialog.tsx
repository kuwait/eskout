// src/components/calendar/PlayerPickerDialog.tsx
// Dialog to search and select a single player from the full database
// Same filter pattern as AddToSquadDialog: name/club search, position, opinion, foot, year
// RELEVANT FILES: src/components/squad/AddToSquadDialog.tsx, src/components/calendar/EventForm.tsx, src/lib/constants.ts

'use client';

import { useState, useMemo } from 'react';
import { Search, X, Check } from 'lucide-react';
import { fuzzyMatch } from '@/lib/utils';
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
import { POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import type { DepartmentOpinion, Player } from '@/lib/types';

/* ───────────── Props ───────────── */

interface PlayerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allPlayers: Player[];
  /** Currently selected player ID (shows checkmark) */
  selectedId?: number;
  onSelect: (player: Player) => void;
  /** Allow clearing the selection */
  onClear?: () => void;
}

/* ───────────── Filters ───────────── */

interface Filters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
  year: string;
}

const EMPTY_FILTERS: Filters = { search: '', position: '', club: '', opinion: '', foot: '', year: '' };

/* ───────────── Component ───────────── */

export function PlayerPickerDialog({
  open,
  onOpenChange,
  allPlayers,
  selectedId,
  onSelect,
  onClear,
}: PlayerPickerDialogProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // Derive unique club and year lists from player data
  const clubs = useMemo(() => {
    const set = new Set(allPlayers.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort();
  }, [allPlayers]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of allPlayers) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [allPlayers]);

  // Apply filters with 30-result limit
  const filtered = useMemo(() => {
    let result = allPlayers;
    if (filters.search) {
      result = result.filter((p) => fuzzyMatch(`${p.name} ${p.club}`, filters.search));
    }
    // Match primary, secondary, or tertiary position
    if (filters.position) result = result.filter((p) =>
      p.positionNormalized === filters.position ||
      p.secondaryPosition === filters.position ||
      p.tertiaryPosition === filters.position
    );
    if (filters.club) result = result.filter((p) => p.club === filters.club);
    if (filters.opinion) result = result.filter((p) => p.departmentOpinion.includes(filters.opinion as DepartmentOpinion));
    if (filters.foot) result = result.filter((p) => p.foot === filters.foot);
    if (filters.year) {
      const yr = parseInt(filters.year, 10);
      result = result.filter((p) => p.dob && new Date(p.dob).getFullYear() === yr);
    }
    return result.slice(0, 30);
  }, [allPlayers, filters]);

  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot || filters.year;

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSelect(player: Player) {
    onSelect(player);
    setFilters(EMPTY_FILTERS);
    onOpenChange(false);
  }

  function handleClear() {
    onClear?.();
    setFilters(EMPTY_FILTERS);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Selecionar Jogador</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar nome ou clube..."
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

          <Select value={filters.year || 'all'} onValueChange={(v) => updateFilter('year', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ano</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          {filtered.length === 30 && ' (limite)'}
        </p>

        {/* Clear selection button */}
        {selectedId && onClear && (
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleClear}>
            <X className="mr-1 h-3 w-3" />
            Remover jogador selecionado
          </Button>
        )}

        {/* Player list */}
        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {filtered.map((player) => {
            const isSelected = player.id === selectedId;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => handleSelect(player)}
                className="flex w-full items-center justify-between rounded-md border p-2 text-left transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {isSelected && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    <p className="truncate text-sm font-medium">{player.name}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {player.club}
                    {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                    {player.foot ? ` · ${player.foot}` : ''}
                  </p>
                </div>
                <OpinionBadge opinion={player.departmentOpinion} />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// src/components/players/PlayerFilters.tsx
// Multi-filter panel for the player database — birth year, position, club, opinion, foot, status, date range
// Client component with select dropdowns that update parent filter state
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, CalendarRange } from 'lucide-react';
import { POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS, RECRUITMENT_STATUSES, OBSERVATION_TIERS, getNationalityFlag } from '@/lib/constants';
import type { PlayerFilterState } from '@/components/players/PlayersView';

interface PlayerFiltersProps {
  filters: PlayerFilterState;
  onFiltersChange: (filters: PlayerFilterState) => void;
  clubs: string[];
  nationalities: string[];
  birthYears: number[];
}

export function PlayerFilters({ filters, onFiltersChange, clubs, nationalities, birthYears }: PlayerFiltersProps) {
  const [showDateRange, setShowDateRange] = useState(false);

  function update(key: keyof PlayerFilterState, value: string) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function clear() {
    onFiltersChange({
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
    });
    setShowDateRange(false);
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const hasDateRange = filters.dobFrom || filters.dobTo;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Birth Year */}
        <Select value={filters.birthYear || 'all'} onValueChange={(v) => update('birthYear', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[110px]" aria-label="Filtrar por ano de nascimento">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ano</SelectItem>
            {birthYears.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Position */}
        <Select value={filters.position || 'all'} onValueChange={(v) => update('position', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[130px]" aria-label="Filtrar por posição">
            <SelectValue placeholder="Posição" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Posição</SelectItem>
            {POSITIONS.map((p) => (
              <SelectItem key={p.code} value={p.code}>{p.code} — {p.labelPt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Club */}
        <Select value={filters.club || 'all'} onValueChange={(v) => update('club', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]" aria-label="Filtrar por clube">
            <SelectValue placeholder="Clube" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Clube</SelectItem>
            {clubs.map((club) => (
              <SelectItem key={club} value={club}>{club}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Nationality */}
        {nationalities.length > 0 && (
          <Select value={filters.nationality || 'all'} onValueChange={(v) => update('nationality', v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[160px]" aria-label="Filtrar por nacionalidade">
              <SelectValue placeholder="Nacionalidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Nacionalidade</SelectItem>
              {nationalities.map((n) => (
                <SelectItem key={n} value={n}>{getNationalityFlag(n)} {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Department Opinion */}
        <Select value={filters.opinion || 'all'} onValueChange={(v) => update('opinion', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por opinião">
            <SelectValue placeholder="Opinião" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Opinião</SelectItem>
            {DEPARTMENT_OPINIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Foot */}
        <Select value={filters.foot || 'all'} onValueChange={(v) => update('foot', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[120px]" aria-label="Filtrar por pé">
            <SelectValue placeholder="Pé" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Pé</SelectItem>
            {FOOT_OPTIONS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Recruitment Status */}
        <Select value={filters.status || 'all'} onValueChange={(v) => update('status', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Estado</SelectItem>
            {RECRUITMENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.labelPt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Observation Tier */}
        <Select value={filters.observationTier || 'all'} onValueChange={(v) => update('observationTier', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado de observação">
            <SelectValue placeholder="Observação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Observação</SelectItem>
            {OBSERVATION_TIERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.labelPt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Toggle date range filter — defaults to Jul 1 – Dec 31 of selected birth year */}
        <Button
          variant={showDateRange || hasDateRange ? 'default' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => {
            if (showDateRange) {
              // Closing: clear date range
              onFiltersChange({ ...filters, dobFrom: '', dobTo: '' });
              setShowDateRange(false);
            } else {
              // Opening: pre-fill with birth year defaults if available
              const yr = filters.birthYear;
              if (yr) {
                onFiltersChange({ ...filters, dobFrom: `${yr}-07-01`, dobTo: `${yr}-12-31` });
              }
              setShowDateRange(true);
            }
          }}
        >
          <CalendarRange className="mr-1 h-3.5 w-3.5" />
          Data nascimento
        </Button>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-9">
            <X className="mr-1 h-3 w-3" />
            Limpar
          </Button>
        )}
      </div>

      {/* Date range inputs — collapsible */}
      {(showDateRange || hasDateRange) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2">
          <span className="text-xs text-muted-foreground">Nascidos entre</span>
          <Input
            type="date"
            value={filters.dobFrom}
            onChange={(e) => update('dobFrom', e.target.value)}
            className="h-8 w-[150px] text-xs"
            aria-label="Data de nascimento desde"
          />
          <span className="text-xs text-muted-foreground">e</span>
          <Input
            type="date"
            value={filters.dobTo}
            onChange={(e) => update('dobTo', e.target.value)}
            className="h-8 w-[150px] text-xs"
            aria-label="Data de nascimento até"
          />
          {hasDateRange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                onFiltersChange({ ...filters, dobFrom: '', dobTo: '' });
              }}
            >
              <X className="mr-1 h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

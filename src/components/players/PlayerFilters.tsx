// src/components/players/PlayerFilters.tsx
// Multi-filter panel for the player database — position, club, opinion, foot, status, squad membership
// Client component with select dropdowns that update parent filter state
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS, RECRUITMENT_STATUSES } from '@/lib/constants';
import type { PlayerFilterState } from '@/components/players/PlayersView';

interface PlayerFiltersProps {
  filters: PlayerFilterState;
  onFiltersChange: (filters: PlayerFilterState) => void;
  clubs: string[];
}

export function PlayerFilters({ filters, onFiltersChange, clubs }: PlayerFiltersProps) {
  function update(key: keyof PlayerFilterState, value: string) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function clear() {
    onFiltersChange({
      position: '',
      club: '',
      opinion: '',
      foot: '',
      status: '',
      shadowSquad: '',
      realSquad: '',
    });
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Position */}
      <Select value={filters.position} onValueChange={(v) => update('position', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[130px]" aria-label="Filtrar por posição">
          <SelectValue placeholder="Posição" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {POSITIONS.map((p) => (
            <SelectItem key={p.code} value={p.code}>{p.code} — {p.labelPt}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Club */}
      <Select value={filters.club} onValueChange={(v) => update('club', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[160px]" aria-label="Filtrar por clube">
          <SelectValue placeholder="Clube" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {clubs.map((club) => (
            <SelectItem key={club} value={club}>{club}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Department Opinion */}
      <Select value={filters.opinion} onValueChange={(v) => update('opinion', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[150px]" aria-label="Filtrar por opinião">
          <SelectValue placeholder="Opinião" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {DEPARTMENT_OPINIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Foot */}
      <Select value={filters.foot} onValueChange={(v) => update('foot', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[120px]" aria-label="Filtrar por pé">
          <SelectValue placeholder="Pé" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {FOOT_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Recruitment Status */}
      <Select value={filters.status} onValueChange={(v) => update('status', v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {RECRUITMENT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.labelPt}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clear} className="h-9">
          <X className="mr-1 h-3 w-3" />
          Limpar
        </Button>
      )}
    </div>
  );
}

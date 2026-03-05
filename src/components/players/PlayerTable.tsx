// src/components/players/PlayerTable.tsx
// Desktop data table for the player database with sortable and resizable columns
// Shows: name, DOB, position, club, foot, opinion, status
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/OpinionBadge.tsx, src/hooks/useResizableColumns.ts

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import type { Player } from '@/lib/types';
import { ArrowUpDown } from 'lucide-react';

type SortKey = 'name' | 'dob' | 'position' | 'club' | 'opinion' | 'foot' | 'status';
type SortDir = 'asc' | 'desc';

interface PlayerTableProps {
  players: Player[];
}

/* ───────────── Column Config ───────────── */

const COLUMN_KEYS: SortKey[] = ['name', 'dob', 'position', 'club', 'foot', 'opinion', 'status'];

const DEFAULT_WIDTHS: Record<string, number> = {
  name: 200,
  dob: 95,
  position: 70,
  club: 160,
  foot: 55,
  opinion: 115,
  status: 105,
};

const COLUMN_LABELS: Record<SortKey, string> = {
  name: 'Nome',
  dob: 'Nasc.',
  position: 'Pos.',
  club: 'Clube',
  foot: 'Pé',
  opinion: 'Opinião',
  status: 'Estado',
};

/* ───────────── Sort Header Button ───────────── */

function SortHeader({ label, sortKeyName, onSort }: {
  label: string;
  sortKeyName: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button onClick={() => onSort(sortKeyName)} className="flex items-center gap-1 text-left font-medium">
      {label}
      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

/* ───────────── Player Table ───────────── */

export function PlayerTable({ players }: PlayerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { widths, handleMouseDown } = useResizableColumns({
    columnKeys: COLUMN_KEYS,
    defaultWidths: DEFAULT_WIDTHS,
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...players].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name':     return a.name.localeCompare(b.name) * dir;
      case 'dob':      return (a.dob ?? '').localeCompare(b.dob ?? '') * dir;
      case 'position': return (a.positionNormalized || 'ZZZ').localeCompare(b.positionNormalized || 'ZZZ') * dir;
      case 'club':     return a.club.localeCompare(b.club) * dir;
      case 'opinion':  return (a.departmentOpinion[0] ?? '').localeCompare(b.departmentOpinion[0] ?? '') * dir;
      case 'foot':     return (a.foot || '').localeCompare(b.foot || '') * dir;
      case 'status':   return (a.recruitmentStatus ?? '').localeCompare(b.recruitmentStatus ?? '') * dir;
      default:         return 0;
    }
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            {COLUMN_KEYS.map((key) => (
              <TableHead
                key={key}
                className="relative select-none"
                style={{ width: widths[key] }}
              >
                <SortHeader label={COLUMN_LABELS[key]} sortKeyName={key} onSort={handleSort} />
                {/* Resize handle — wider hit area (12px) with visible center line on hover */}
                <div
                  className="absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center hover:after:absolute hover:after:h-full hover:after:w-0.5 hover:after:bg-blue-400"
                  onMouseDown={(e) => handleMouseDown(key, e)}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((player) => (
            <TableRow key={player.id} className="cursor-pointer hover:bg-neutral-50">
              <TableCell className="truncate" style={{ width: widths.name }}>
                <Link href={`/jogadores/${player.id}`} className="font-medium text-neutral-900 hover:underline">
                  {player.name}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground" style={{ width: widths.dob }}>
                {player.dob ? formatDate(player.dob) : '—'}
              </TableCell>
              <TableCell className="text-sm" style={{ width: widths.position }}>
                {player.positionNormalized || '—'}
              </TableCell>
              <TableCell className="truncate text-sm" style={{ width: widths.club }}>{player.club || '—'}</TableCell>
              <TableCell className="text-sm" style={{ width: widths.foot }}>{player.foot || '—'}</TableCell>
              <TableCell style={{ width: widths.opinion }}><OpinionBadge opinion={player.departmentOpinion} /></TableCell>
              <TableCell style={{ width: widths.status }}>
                {player.recruitmentStatus && (
                  <StatusBadge status={player.recruitmentStatus} />
                )}
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Nenhum jogador encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}

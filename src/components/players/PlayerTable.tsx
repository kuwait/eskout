// src/components/players/PlayerTable.tsx
// Desktop data table for the player database with sortable columns
// Shows all key player data with opinion color coding
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/OpinionBadge.tsx, src/lib/constants.ts

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { POSITION_LABELS } from '@/lib/constants';
import type { Player, PositionCode } from '@/lib/types';
import { ArrowUpDown } from 'lucide-react';

type SortKey = 'name' | 'position' | 'club' | 'opinion' | 'foot' | 'status';
type SortDir = 'asc' | 'desc';

interface PlayerTableProps {
  players: Player[];
}

/* ───────────── Sort Header Button ───────────── */

function SortHeader({
  label,
  sortKeyName,
  onSort,
}: {
  label: string;
  sortKeyName: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onSort(sortKeyName)}
      className="flex items-center gap-1 text-left font-medium"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

/* ───────────── Player Table ───────────── */

export function PlayerTable({ players }: PlayerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
      case 'name': return a.name.localeCompare(b.name) * dir;
      case 'position': return (a.positionNormalized || 'ZZZ').localeCompare(b.positionNormalized || 'ZZZ') * dir;
      case 'club': return a.club.localeCompare(b.club) * dir;
      case 'opinion': return (a.departmentOpinion || '').localeCompare(b.departmentOpinion || '') * dir;
      case 'foot': return (a.foot || '').localeCompare(b.foot || '') * dir;
      case 'status': return a.recruitmentStatus.localeCompare(b.recruitmentStatus) * dir;
      default: return 0;
    }
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortHeader label="Nome" sortKeyName="name" onSort={handleSort} /></TableHead>
            <TableHead><SortHeader label="Posição" sortKeyName="position" onSort={handleSort} /></TableHead>
            <TableHead><SortHeader label="Clube" sortKeyName="club" onSort={handleSort} /></TableHead>
            <TableHead><SortHeader label="Pé" sortKeyName="foot" onSort={handleSort} /></TableHead>
            <TableHead><SortHeader label="Opinião" sortKeyName="opinion" onSort={handleSort} /></TableHead>
            <TableHead><SortHeader label="Estado" sortKeyName="status" onSort={handleSort} /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((player) => (
            <TableRow key={player.id} className="cursor-pointer hover:bg-neutral-50">
              <TableCell>
                <Link
                  href={`/jogadores/${player.id}`}
                  className="font-medium text-neutral-900 hover:underline"
                >
                  {player.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {player.positionNormalized
                  ? `${player.positionNormalized} — ${POSITION_LABELS[player.positionNormalized as PositionCode]}`
                  : '—'}
              </TableCell>
              <TableCell className="text-sm">{player.club || '—'}</TableCell>
              <TableCell className="text-sm">{player.foot || '—'}</TableCell>
              <TableCell>
                <OpinionBadge opinion={player.departmentOpinion} />
              </TableCell>
              <TableCell>
                <StatusBadge status={player.recruitmentStatus} />
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                Nenhum jogador encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

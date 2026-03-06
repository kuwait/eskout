// src/components/players/PlayerTable.tsx
// Desktop data table for the player database with sortable and resizable columns
// Shows: eval, name, DOB, position, club, foot, opinion, status — eval first for quick scanning
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/OpinionBadge.tsx, src/hooks/useResizableColumns.ts

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ClubBadge } from '@/components/common/ClubBadge';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { getPrimaryRating } from '@/lib/constants';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import { PitchCanvas } from '@/components/common/MiniPitch';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { Player, PositionCode } from '@/lib/types';
import { ArrowUpDown } from 'lucide-react';

type SortKey = 'eval' | 'name' | 'dob' | 'position' | 'opinion' | 'status';
type SortDir = 'asc' | 'desc';

interface PlayerTableProps {
  players: Player[];
}

/* ───────────── Rating Colors (matches PlayerProfile) ───────────── */

const RATING_COLORS: Record<number, { dot: string; num: string }> = {
  1: { dot: 'bg-red-500', num: 'text-red-600' },
  2: { dot: 'bg-orange-400', num: 'text-orange-600' },
  3: { dot: 'bg-blue-400', num: 'text-blue-600' },
  4: { dot: 'bg-emerald-400', num: 'text-emerald-600' },
  5: { dot: 'bg-emerald-600', num: 'text-emerald-700' },
};
const RATING_DEFAULT = { dot: 'bg-neutral-300', num: 'text-neutral-400' };

/** Parse "4 - Muito Bom" → { rating: 4, label: "Muito Bom" } */
function parseEval(value: string): { rating: number; label: string } {
  const m = value.match(/^(\d)/);
  const rating = m ? parseInt(m[1], 10) : 0;
  const label = value.replace(/^\d\s*-\s*/, '');
  return { rating, label };
}

/* ───────────── Column Config ───────────── */

const COLUMN_KEYS: SortKey[] = ['eval', 'name', 'dob', 'position', 'opinion', 'status'];

const DEFAULT_WIDTHS: Record<string, number> = {
  eval: 110,
  name: 240,
  dob: 120,
  position: 130,
  opinion: 115,
  status: 105,
};

const COLUMN_LABELS: Record<SortKey, string> = {
  eval: 'Avaliação',
  name: 'Nome',
  dob: 'Nasc.',
  position: 'Posição',
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
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('eval');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  /** Extract hybrid rating for sorting (report avg > manual eval > 0) */
  const evalNum = (p: Player) => {
    const primary = getPrimaryRating(p);
    return primary ? primary.value : 0;
  };

  const sorted = [...players].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'eval':     return (evalNum(a) - evalNum(b)) * dir;
      case 'name':     return a.name.localeCompare(b.name) * dir;
      case 'dob':      return (a.dob ?? '').localeCompare(b.dob ?? '') * dir;
      case 'position': return (a.positionNormalized || 'ZZZ').localeCompare(b.positionNormalized || 'ZZZ') * dir;
      case 'opinion':  return (a.departmentOpinion[0] ?? '').localeCompare(b.departmentOpinion[0] ?? '') * dir;
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
          {sorted.map((player) => {
            // Build positions string: primary + secondary + tertiary
            const positions = [
              player.positionNormalized,
              player.secondaryPosition,
              player.tertiaryPosition,
            ].filter(Boolean);

            const photoUrl = player.photoUrl || player.zzPhotoUrl;

            return (
              <TableRow
                key={player.id}
                className="cursor-pointer hover:bg-neutral-50"
                onClick={() => router.push(`/jogadores/${player.id}`)}
                onAuxClick={(e) => { if (e.button === 1) window.open(`/jogadores/${player.id}`, '_blank'); }}
              >
                <TableCell style={{ width: widths.eval }}>
                  <EvalCell player={player} />
                </TableCell>
                <TableCell style={{ width: widths.name }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {photoUrl ? (
                      <HoverCard openDelay={300} closeDelay={100}>
                        <HoverCardTrigger asChild>
                          <Image
                            src={photoUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="h-14 w-14 shrink-0 rounded-full object-cover"
                            unoptimized
                          />
                        </HoverCardTrigger>
                        <HoverCardContent side="right" align="start" className="w-auto p-1">
                          <Image
                            src={photoUrl}
                            alt={player.name}
                            width={320}
                            height={320}
                            className="h-72 w-72 rounded-lg object-cover"
                            unoptimized
                          />
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                        <User className="h-6 w-6" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium text-neutral-900">
                        <ObservationBadge player={player} />
                        <span className="truncate">{player.name}</span>
                      </p>
                      {player.club && (
                        <ClubBadge club={player.club} logoUrl={player.clubLogoUrl} size="sm" className="text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell style={{ width: widths.dob }}>
                  {player.dob ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs">{formatDate(player.dob)}</span>
                      <span className="text-[10px] text-neutral-400">{calcAge(player.dob)} anos</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell style={{ width: widths.position }}>
                  {positions.length > 0 ? (
                    <HoverCard openDelay={300} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <div className="flex flex-col gap-0.5 cursor-pointer">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-700">{positions[0]}</span>
                              {positions.slice(1).map((pos, i) => (
                                <span key={pos} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  i === 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-50 text-orange-700'
                                }`}>{pos}</span>
                              ))}
                            </div>
                            {player.foot && (
                              <span className="text-[10px] text-neutral-400">Pé {player.foot === 'Dir' ? 'Direito' : player.foot === 'Esq' ? 'Esquerdo' : 'Ambidestro'}</span>
                            )}
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent side="bottom" align="start" className="w-auto p-2">
                        <PitchCanvas
                          primaryPosition={positions[0] as PositionCode}
                          secondaryPosition={(positions[1] as PositionCode) ?? null}
                          tertiaryPosition={(positions[2] as PositionCode) ?? null}
                          size="lg"
                        />
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell style={{ width: widths.opinion }}><OpinionBadge opinion={player.departmentOpinion} /></TableCell>
                <TableCell style={{ width: widths.status }}>
                  {player.recruitmentStatus && (
                    <StatusBadge status={player.recruitmentStatus} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
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

/* ───────────── Eval Cell (hybrid rating — report avg > manual eval) ───────────── */

function EvalCell({ player }: { player: Player }) {
  const primary = getPrimaryRating(player);
  if (!primary) return <span className="text-xs text-neutral-300">—</span>;

  const ratingInt = Math.round(primary.value);
  const c = RATING_COLORS[ratingInt] ?? RATING_DEFAULT;

  // Display value: decimal for averages, integer for manual
  const displayValue = primary.isAverage ? primary.value.toFixed(1) : String(primary.value);
  // Label: report count for averages, text label for manual
  const label = primary.isAverage
    ? `${player.reportRatingCount} aval.`
    : (player.observerEval ? parseEval(player.observerEval).label : '');

  return (
    <div className="inline-flex items-center gap-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${primary.isAverage ? 'text-xs' : 'text-sm'} font-bold text-white ${c.dot}`}>
        {displayValue}
      </span>
      <span className={`text-xs font-medium ${c.num}`}>{label}</span>
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

function calcAge(dateStr: string): number {
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

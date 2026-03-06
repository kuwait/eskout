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

type SortKey = 'eval' | 'name' | 'dob' | 'position' | 'opinion' | 'status' | 'notes';
type SortDir = 'asc' | 'desc';

interface PlayerTableProps {
  players: Player[];
}

/* ───────────── Rating Colors (card-style badge, same palette as PlayerProfile) ───────────── */

const RATING_COLORS: Record<number, { num: string; bg: string; border: string }> = {
  1: { num: 'text-red-600', bg: 'bg-red-50/80', border: 'border-red-200' },
  2: { num: 'text-orange-600', bg: 'bg-orange-50/80', border: 'border-orange-200' },
  3: { num: 'text-blue-600', bg: 'bg-blue-50/80', border: 'border-blue-200' },
  4: { num: 'text-emerald-600', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
  5: { num: 'text-emerald-700', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
};
const RATING_DEFAULT = { num: 'text-neutral-400', bg: 'bg-neutral-50', border: 'border-neutral-200' };

/** Parse "4 - Muito Bom" → { rating: 4, label: "Muito Bom" } */
function parseEval(value: string): { rating: number; label: string } {
  const m = value.match(/^(\d)/);
  const rating = m ? parseInt(m[1], 10) : 0;
  const label = value.replace(/^\d\s*-\s*/, '');
  return { rating, label };
}

/* ───────────── Column Config ───────────── */

const COLUMN_KEYS: SortKey[] = ['eval', 'name', 'dob', 'position', 'opinion', 'status', 'notes'];

const DEFAULT_WIDTHS: Record<string, number> = {
  eval: 78,
  name: 240,
  dob: 120,
  position: 130,
  opinion: 115,
  status: 105,
  notes: 200,
};

const COLUMN_LABELS: Record<SortKey, string> = {
  eval: 'Avaliação',
  name: 'Nome',
  dob: 'Nasc.',
  position: 'Posição',
  opinion: 'Opinião',
  status: 'Estado',
  notes: 'Observações',
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

  const { widths, handleMouseDown, handleDoubleClick, tableRef } = useResizableColumns({
    columnKeys: COLUMN_KEYS,
    defaultWidths: DEFAULT_WIDTHS,
    minWidths: { eval: 20 },
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
      case 'notes':    return (a.notes || '').localeCompare(b.notes || '') * dir;
      default:         return 0;
    }
  });

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="table-fixed" ref={tableRef as React.Ref<HTMLTableElement>}>
        <TableHeader>
          <TableRow>
            {COLUMN_KEYS.map((key) => (
              <TableHead
                key={key}
                className="relative select-none overflow-visible"
                style={{ width: widths[key] }}
              >
                <SortHeader label={COLUMN_LABELS[key]} sortKeyName={key} onSort={handleSort} />
                {/* Resize handle — always visible separator, wide hit area for drag */}
                <div
                  className="absolute -right-[7px] top-0 z-20 flex h-full w-[14px] cursor-col-resize items-center justify-center"
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(key, e); }}
                  onDoubleClick={() => handleDoubleClick(key)}
                >
                  <div className="h-full w-px bg-neutral-200 hover:w-[2px] hover:bg-blue-400" />
                </div>
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
                <TableCell style={{ width: widths.eval }} className="!py-1 overflow-hidden">
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
                <TableCell style={{ width: widths.notes }} className="overflow-hidden">
                  <NotesCell notes={player.observationNotePreviews} fallback={player.notes} />
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_KEYS.length} className="py-8 text-center text-muted-foreground">
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

  // Card-style badge matching PlayerProfile desktop widget (compact, fixed size)
  return (
    <div className={`flex h-[58px] w-[62px] flex-col items-center justify-center rounded-xl border ${c.bg} ${c.border}`}>
      <span className={`text-lg font-black leading-tight ${c.num}`}>
        {displayValue}
      </span>
      {label && <span className={`text-[10px] font-semibold leading-tight ${c.num} opacity-70`}>{label}</span>}
    </div>
  );
}

/* ───────────── Notes Cell (observation notes as compact bullet list) ───────────── */

function NotesCell({ notes, fallback }: { notes: string[]; fallback: string }) {
  // Combine observation notes + fallback field notes
  const all = [...notes];
  if (fallback && !all.includes(fallback)) all.push(fallback);

  if (all.length === 0) return <span className="text-xs text-neutral-300">—</span>;

  return (
    <div className="max-h-[72px] overflow-hidden">
      {all.map((note, i) => (
        <p key={i} className="truncate text-[10px] leading-[14px] text-muted-foreground">
          <span className="text-neutral-300">•</span> {note}
        </p>
      ))}
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

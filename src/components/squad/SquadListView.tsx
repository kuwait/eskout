// src/components/squad/SquadListView.tsx
// List view of squad players grouped by position — rich cards with photo, info, rank
// Clean white background, no pitch. Ideal for reviewing the full squad linearly.
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/lib/constants.ts

'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SQUAD_SLOTS, POSITION_LABELS } from '@/lib/constants';
import type { Player, PositionCode } from '@/lib/types';

/* ───────────── Rank styling ───────────── */

const RANK_BORDER: Record<number, string> = {
  0: 'border-l-3 border-l-amber-400',
  1: 'border-l-3 border-l-neutral-400',
  2: 'border-l-3 border-l-amber-700',
};

const RANK_CORNER: Record<number, string> = {
  0: 'bg-amber-400 text-white',
  1: 'bg-neutral-300 text-white',
  2: 'bg-amber-700 text-white',
};

/** First + last name for long names */
function displayName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/* ───────────── Props ───────────── */

interface SquadListViewProps {
  byPosition: Record<string, Player[]>;
  squadType: 'real' | 'shadow';
  onAdd: (position: string) => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
}

/* ───────────── Component ───────────── */

export function SquadListView({ byPosition, squadType, onAdd, onRemovePlayer, onPlayerClick, onToggleDoubt }: SquadListViewProps) {
  return (
    <div className="space-y-4">
      {SQUAD_SLOTS.map(({ slot, label }) => {
        const players = byPosition[slot] ?? [];

        return (
          <div key={slot} className="rounded-lg border bg-white">
            {/* Position header */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold text-white">
                  {slot}
                </span>
                <span className="text-sm font-semibold">{label}</span>
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {players.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onAdd(slot)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Adicionar
              </Button>
            </div>

            {/* Player cards */}
            {players.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Sem jogadores nesta posição
              </p>
            ) : (
              <div className="divide-y">
                {players.map((player, index) => {
                  const photoUrl = player.photoUrl || player.zzPhotoUrl;
                  const posLabel = player.positionNormalized
                    ? (POSITION_LABELS[player.positionNormalized as PositionCode] ?? player.positionNormalized)
                    : null;
                  const dobLabel = player.dob
                    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return player.dob; } })()
                    : null;

                  return (
                    <div
                      key={player.id}
                      className={`group relative flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-neutral-50 ${
                        player.isDoubt ? 'border border-dashed border-amber-400 bg-amber-50/50' : ''
                      } ${
                        squadType === 'shadow' ? (RANK_BORDER[index] ?? 'border-l-2 border-l-neutral-200') : ''
                      }`}
                      onClick={() => onPlayerClick?.(player.id)}
                    >
                      {/* Rank corner */}
                      {squadType === 'shadow' && (
                        <span className={`absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-bl-md text-[10px] font-bold ${RANK_CORNER[index] ?? 'bg-neutral-100 text-neutral-400'}`}>
                          {index + 1}
                        </span>
                      )}

                      {/* Photo */}
                      <PlayerAvatar
                        player={{
                          name: player.name,
                          photoUrl,
                          club: player.club,
                          position: player.positionNormalized,
                          dob: player.dob,
                          foot: player.foot,
                        }}
                        size={44}
                      />

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {displayName(player.name)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-neutral-500">
                          {player.club || '—'}
                        </p>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px]">
                          {posLabel && (
                            <span>
                              <span className="text-neutral-400">Pos: </span>
                              <span className="font-medium text-neutral-600">{posLabel}</span>
                            </span>
                          )}
                          {player.foot && (
                            <span>
                              <span className="text-neutral-400">Pé: </span>
                              <span className="font-medium text-neutral-600">{player.foot}</span>
                            </span>
                          )}
                          {dobLabel && (
                            <span>
                              <span className="text-neutral-400">Nasc: </span>
                              <span className="font-medium text-neutral-600">{dobLabel}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[9px]" />
                          {player.recruitmentStatus && (
                            <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[9px]" />
                          )}
                          {player.isDoubt && (
                            <span className="rounded bg-amber-100 px-1 py-0 text-[9px] font-medium text-amber-700">DÚVIDA</span>
                          )}
                          {!player.isDoubt && player.recruitmentStatus === 'assinou' && (
                            <span className="rounded bg-green-100 px-1 py-0 text-[9px] font-medium text-green-700">ASSINOU</span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {onToggleDoubt && (
                          <button
                            className={`rounded px-2 py-1 text-[10px] font-medium ${
                              player.isDoubt
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            onClick={(e) => { e.stopPropagation(); onToggleDoubt(player.id, !player.isDoubt); }}
                            aria-label={player.isDoubt ? 'Remover dúvida' : 'Marcar como dúvida'}
                          >
                            {player.isDoubt ? '✓ Dúvida' : '? Dúvida'}
                          </button>
                        )}
                        <button
                          className="flex items-center gap-0.5 rounded bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100"
                          onClick={(e) => { e.stopPropagation(); onRemovePlayer(player.id); }}
                          aria-label={`Remover ${player.name}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Remover</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

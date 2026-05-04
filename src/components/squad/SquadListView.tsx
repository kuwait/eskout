// src/components/squad/SquadListView.tsx
// List view of squad players grouped by position — rich cards with photo, info, rank
// Clean white background, no pitch. Ideal for reviewing the full squad linearly.
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadPanelView.tsx, src/lib/constants.ts

'use client';

import Image from 'next/image';
import { Plus, Trash2, Footprints, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SQUAD_SLOTS, POSITION_LABELS, POSITION_CHIP_SOLID } from '@/lib/constants';
import type { Player, PositionCode } from '@/lib/types';
import type { SquadSignStatus } from '@/actions/squads';

/** Compute the next sign status in the cycle: none → will_sign → signed → none */
function nextSignStatus(isWillSign: boolean | undefined, isSigned: boolean | undefined): SquadSignStatus {
  if (isSigned) return 'none';
  if (isWillSign) return 'signed';
  return 'will_sign';
}

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
  onSetSignStatus?: (playerId: number, status: SquadSignStatus) => void;
  onTogglePreseason?: (playerId: number, isPreseason: boolean) => void;
}

/* ───────────── Component ───────────── */

export function SquadListView({ byPosition, squadType, onAdd, onRemovePlayer, onPlayerClick, onToggleDoubt, onSetSignStatus, onTogglePreseason }: SquadListViewProps) {
  return (
    <div className="space-y-4">
      {SQUAD_SLOTS.map(({ slot, label }) => {
        const players = byPosition[slot] ?? [];

        return (
          <div key={slot} className="rounded-lg border bg-white">
            {/* Position header — slot pill hidden on mobile (the textual label already says it).
                Desktop keeps the pill to mirror the visual hierarchy of the formation grid. */}
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="hidden rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold text-white lg:inline-block">
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
                  const posCode = player.positionNormalized as PositionCode | undefined;
                  const posLabel = posCode ? (POSITION_LABELS[posCode] ?? posCode) : null;
                  // Compact dd/MM/yy keeps the meta strip on a single line on mobile.
                  const dobShort = player.dob
                    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return player.dob; } })()
                    : null;

                  return (
                    <div
                      key={player.id}
                      className={`group relative overflow-hidden transition-colors hover:bg-neutral-50 ${
                        player.isDoubt
                          ? 'border border-dashed border-amber-400 bg-amber-50/50'
                          : player.isPreseason
                            ? 'border border-dashed border-sky-400 bg-sky-50/50'
                            : player.isWillSign && !player.isSigned
                              ? 'border border-dashed border-green-400 bg-green-50/40'
                              : ''
                      } ${
                        squadType === 'shadow' ? (RANK_BORDER[index] ?? 'border-l-2 border-l-neutral-200') : ''
                      }`}
                    >
                      {/* Rank corner */}
                      {squadType === 'shadow' && (
                        <span className={`absolute top-0 right-0 z-10 flex h-5 w-5 items-center justify-center rounded-bl-md text-[10px] font-bold ${RANK_CORNER[index] ?? 'bg-neutral-100 text-neutral-400'}`}>
                          {index + 1}
                        </span>
                      )}

                      {/* Top row: photo (flush left, full row height) + info + desktop hover
                          actions. items-stretch lets the photo div fill the row vertically;
                          min-h-[60px] keeps a sensible card height when text content is short. */}
                      <div
                        className="flex min-h-[60px] cursor-pointer items-stretch"
                        onClick={() => onPlayerClick?.(player.id)}
                      >
                        {/* Photo flush left, full row height — magazine-card feel.
                            Wider on desktop where there's room (lg:w-24 ≈ 96px). */}
                        <div className="relative w-20 shrink-0 self-stretch bg-neutral-100 lg:w-24 dark:bg-neutral-800">
                          {photoUrl ? (
                            <Image
                              src={photoUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="(min-width: 1024px) 96px, 80px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-neutral-400">
                              <User className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        {/* Info — padded, vertically centered */}
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-3">
                          {/* Mobile: name + club share one truncated line (saves vertical room).
                              Desktop: name on top, club below (more breathable on wide rows). */}
                          <p className="truncate text-sm font-semibold text-neutral-900 lg:hidden">
                            {displayName(player.name)}
                            {player.club && (
                              <span className="ml-1.5 text-xs font-normal text-neutral-500">· {player.club}</span>
                            )}
                          </p>
                          <p className="hidden truncate text-sm font-semibold text-neutral-900 lg:block">
                            {displayName(player.name)}
                          </p>
                          <p className="mt-0.5 hidden truncate text-xs text-neutral-500 lg:block">
                            {player.club || '—'}
                          </p>
                          {/* Meta strip — colored position chip, foot icon, DOB icon. Tighter than labelled
                              "Pos:/Pé:/Nasc:" so it fits on one line on mobile (≥ iPhone SE 375px). */}
                          {(posCode || player.foot || dobShort) && (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                              {posCode && (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white ${POSITION_CHIP_SOLID[posCode] ?? 'bg-neutral-700'}`}
                                  title={posLabel ?? posCode}
                                >
                                  {posCode}
                                </span>
                              )}
                              {player.foot && (
                                <span className="flex items-center gap-0.5 text-neutral-600">
                                  <Footprints className="h-3 w-3 text-neutral-400" aria-hidden="true" />
                                  <span className="font-medium">{player.foot}</span>
                                </span>
                              )}
                              {dobShort && (
                                <span className="flex items-center gap-0.5 text-neutral-600">
                                  <Calendar className="h-3 w-3 text-neutral-400" aria-hidden="true" />
                                  <span className="font-medium whitespace-nowrap">{dobShort}</span>
                                </span>
                              )}
                            </div>
                          )}
                          {/* Opinion / status / state pills — desktop only. Mobile shows the same
                              info via colored borders + the bottom action bar (toggle states). */}
                          <div className="mt-1.5 hidden flex-wrap gap-1 lg:flex">
                            <OpinionBadge opinion={player.departmentOpinion} className="px-1 py-0 text-[9px]" />
                            {player.recruitmentStatus && (
                              <StatusBadge status={player.recruitmentStatus} className="px-1 py-0 text-[9px]" />
                            )}
                            {player.isDoubt && (
                              <span className="rounded bg-amber-100 px-1 py-0 text-[9px] font-medium text-amber-700">DÚVIDA</span>
                            )}
                            {!player.isDoubt && player.isPreseason && (
                              <span className="rounded bg-sky-100 px-1 py-0 text-[9px] font-medium text-sky-700">PRÉ-ÉPOCA</span>
                            )}
                            {!player.isDoubt && !player.isPreseason && player.isSigned && (
                              <span className="rounded bg-green-100 px-1 py-0 text-[9px] font-medium text-green-700">ASSINOU</span>
                            )}
                            {!player.isDoubt && !player.isPreseason && !player.isSigned && player.isWillSign && (
                              <span className="rounded bg-green-50 px-1 py-0 text-[9px] font-medium text-green-600">VAI ASSINAR</span>
                            )}
                          </div>
                        </div>

                        {/* Desktop hover-reveal action buttons — hidden on mobile (use the bottom row instead).
                            self-center + pr-3 keeps them vertically centered with the info column now
                            that the row uses items-stretch. */}
                        <div className="hidden shrink-0 items-center gap-1 self-center pr-3 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
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
                          {onTogglePreseason && (
                            <button
                              className={`rounded px-2 py-1 text-[10px] font-medium ${
                                player.isPreseason
                                  ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                                  : 'text-sky-600 hover:bg-sky-50'
                              }`}
                              onClick={(e) => { e.stopPropagation(); onTogglePreseason(player.id, !player.isPreseason); }}
                              aria-label={player.isPreseason ? 'Remover pré-época' : 'Marcar como pré-época'}
                            >
                              {player.isPreseason ? '✓ Pré-Época' : '○ Pré-Época'}
                            </button>
                          )}
                          {onSetSignStatus && (
                            <button
                              // 3-state cycle: none → will_sign → signed → none
                              className={`rounded px-2 py-1 text-[10px] font-medium ${
                                player.isSigned
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : player.isWillSign
                                    ? 'bg-green-50 text-green-600 hover:bg-green-100'
                                    : 'text-green-600 hover:bg-green-50'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetSignStatus(player.id, nextSignStatus(player.isWillSign, player.isSigned));
                              }}
                              aria-label={
                                player.isSigned
                                  ? 'Remover assinatura'
                                  : player.isWillSign
                                    ? 'Marcar como assinou'
                                    : 'Marcar como vai assinar'
                              }
                            >
                              {player.isSigned ? '✓ Assinou' : player.isWillSign ? '⏳ Vai Assinar' : '✍ Assinou'}
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

                      {/* Mobile-only action bar — always visible (no hover on touch). Tap-friendly,
                          full-width row with toggle pills + remove on the right. lg:hidden so desktop
                          keeps its hover-revealed actions intact. */}
                      <div className="flex items-stretch gap-1 border-t bg-neutral-50/60 px-2 py-1.5 lg:hidden">
                          {onToggleDoubt && (
                            <button
                              type="button"
                              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                player.isDoubt
                                  ? 'border-amber-400 bg-amber-500 text-white'
                                  : 'border-amber-300 bg-white text-amber-600'
                              }`}
                              onClick={(e) => { e.stopPropagation(); onToggleDoubt(player.id, !player.isDoubt); }}
                              aria-label={player.isDoubt ? 'Remover dúvida' : 'Marcar como dúvida'}
                            >
                              Dúvida{player.isDoubt && ' ✓'}
                            </button>
                          )}
                          {onTogglePreseason && (
                            <button
                              type="button"
                              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                player.isPreseason
                                  ? 'border-sky-400 bg-sky-500 text-white'
                                  : 'border-sky-300 bg-white text-sky-600'
                              }`}
                              onClick={(e) => { e.stopPropagation(); onTogglePreseason(player.id, !player.isPreseason); }}
                              aria-label={player.isPreseason ? 'Remover pré-época' : 'Marcar como pré-época'}
                            >
                              Pré-Época{player.isPreseason && ' ✓'}
                            </button>
                          )}
                          {onSetSignStatus && (
                            <button
                              type="button"
                              // 3-state cycle: none → will_sign → signed → none
                              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                player.isSigned
                                  ? 'border-green-400 bg-green-500 text-white'
                                  : player.isWillSign
                                    ? 'border-green-400 bg-green-400 text-white'
                                    : 'border-green-300 bg-white text-green-600'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetSignStatus(player.id, nextSignStatus(player.isWillSign, player.isSigned));
                              }}
                              aria-label={
                                player.isSigned
                                  ? 'Remover assinatura'
                                  : player.isWillSign
                                    ? 'Marcar como assinou'
                                    : 'Marcar como vai assinar'
                              }
                            >
                              {player.isSigned ? 'Assinou ✓' : player.isWillSign ? 'Vai Assinar' : 'Assinou'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="flex shrink-0 items-center justify-center rounded-md border border-red-200 bg-white px-2 py-1.5 text-red-600"
                            onClick={(e) => { e.stopPropagation(); onRemovePlayer(player.id); }}
                            aria-label={`Remover ${player.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

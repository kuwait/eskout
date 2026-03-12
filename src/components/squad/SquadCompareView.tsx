// src/components/squad/SquadCompareView.tsx
// Side-by-side comparison view — two squads compared position by position
// Color-coded sides: green tint for plantel, blue tint for shadow squad
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/common/PlayerAvatar.tsx, src/lib/constants.ts

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { SQUAD_SLOTS } from '@/lib/constants';
import type { Player } from '@/lib/types';

/* ───────────── Rank indicator ───────────── */

const RANK_COLORS: Record<number, string> = {
  0: 'bg-amber-400 text-white',
  1: 'bg-neutral-300 text-neutral-700',
  2: 'bg-amber-700 text-white',
};

/* ───────────── Compare card ───────────── */

function CompareCard({ player, rank, tint }: {
  player: Player;
  rank?: number;
  /** Color tint for the card border and background */
  tint: 'green' | 'blue';
}) {
  const borderColor = tint === 'green' ? 'border-l-green-400' : 'border-l-blue-400';
  const hoverBg = tint === 'green' ? 'hover:bg-green-50/50' : 'hover:bg-blue-50/50';

  return (
    <Link
      href={`/jogadores/${player.id}`}
      className={`group flex items-center gap-3 rounded-lg border border-l-[3px] ${borderColor} bg-white p-2.5 transition-colors ${hoverBg} dark:bg-neutral-950`}
    >
      {/* Rank */}
      {rank !== undefined && (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${RANK_COLORS[rank] ?? 'bg-neutral-200 text-neutral-500'}`}>
          {rank + 1}
        </span>
      )}

      <PlayerAvatar
        player={{
          name: player.name,
          photoUrl: player.photoUrl || player.zzPhotoUrl,
          club: player.club,
          position: player.positionNormalized,
          dob: player.dob,
          foot: player.foot,
        }}
        size={36}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{player.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {player.club || '—'}
          {player.foot ? ` · ${player.foot}` : ''}
        </p>
      </div>

      <OpinionBadge opinion={player.departmentOpinion} />
    </Link>
  );
}

/* ───────────── Props ───────────── */

interface SquadCompareViewProps {
  leftByPosition: Record<string, Player[]>;
  leftHeader: ReactNode;
  /** Tint for left side cards */
  leftTint: 'green' | 'blue';
  rightByPosition: Record<string, Player[]>;
  rightHeader: ReactNode;
  /** Tint for right side cards */
  rightTint: 'green' | 'blue';
  /** Which side gets rank dots (the shadow squad side) */
  rankSide?: 'left' | 'right';
}

/* ───────────── Component ───────────── */

export function SquadCompareView({
  leftByPosition, leftHeader, leftTint,
  rightByPosition, rightHeader, rightTint,
  rankSide,
}: SquadCompareViewProps) {
  const leftHeaderBg = leftTint === 'green'
    ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
    : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
  const rightHeaderBg = rightTint === 'green'
    ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
    : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

  return (
    <div className="space-y-1.5">
      {/* Sticky compare header — two color-coded sides with "vs" */}
      <div className="sticky top-12 z-10 -mx-4 bg-card px-4 py-2 lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className={`flex-1 rounded-lg px-3 py-2 text-center ${leftHeaderBg}`}>
            <div className="text-xs font-bold uppercase tracking-wide">{leftHeader}</div>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[10px] font-bold text-white dark:bg-neutral-600">
            vs
          </div>
          <div className={`flex-1 rounded-lg px-3 py-2 text-center ${rightHeaderBg}`}>
            <div className="text-xs font-bold uppercase tracking-wide">{rightHeader}</div>
          </div>
        </div>
      </div>

      {/* Position rows */}
      {SQUAD_SLOTS.map(({ slot, label }) => {
        const leftPlayers = leftByPosition[slot] ?? [];
        const rightPlayers = rightByPosition[slot] ?? [];
        const isEmpty = leftPlayers.length === 0 && rightPlayers.length === 0;

        if (isEmpty) return null;

        return (
          <div key={slot}>
            {/* Position header */}
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
              <span className="text-sm font-bold text-foreground">{slot}</span>
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>

            {/* Two-column grid */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
              {/* Left column */}
              <div className="space-y-1.5">
                {leftPlayers.length === 0 ? (
                  <div className="flex h-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    Sem jogador
                  </div>
                ) : (
                  leftPlayers.map((p, i) => (
                    <CompareCard key={p.id} player={p} rank={rankSide === 'left' ? i : undefined} tint={leftTint} />
                  ))
                )}
              </div>

              {/* Right column */}
              <div className="space-y-1.5">
                {rightPlayers.length === 0 ? (
                  <div className="flex h-14 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    Sem jogador
                  </div>
                ) : (
                  rightPlayers.map((p, i) => (
                    <CompareCard key={p.id} player={p} rank={rankSide === 'right' ? i : undefined} tint={rightTint} />
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

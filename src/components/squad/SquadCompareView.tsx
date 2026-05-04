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

/** Compact name for narrow cards: "F. Last" for 2+ words (mirrors FormationSlot.compactName) */
function compactName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
}

/* ───────────── Compare card ───────────── */

function CompareCard({ player, rank, tint }: {
  player: Player;
  rank?: number;
  /** Color tint for the card border and background */
  tint: 'green' | 'blue';
}) {
  const hoverBg = tint === 'green' ? 'hover:bg-green-50/50' : 'hover:bg-blue-50/50';

  // State styling — dashed border + tinted bg, mirrors SquadListView. Applied on all
  // viewports (matches list view behaviour). `isSigned` gets a SOLID green border (not
  // dashed) to convey "decision final" vs "in progress" for the other states.
  // The previous green/blue left-border tint was removed: the header at the top of the
  // compare view already indicates which side is plantel vs sombra, and the columns'
  // physical position reinforces it — the colored stripe was visual noise.
  const stateClasses = player.isDoubt
    ? 'border-dashed border-amber-400 bg-amber-50/50'
    : player.isPreseason
      ? 'border-dashed border-sky-400 bg-sky-50/50'
      : player.isSigned
        ? 'border-green-500 bg-green-50/60'
        : player.isWillSign
          ? 'border-dashed border-green-400 bg-green-50/40'
          : '';

  return (
    <Link
      href={`/jogadores/${player.id}`}
      className={`group relative flex items-center gap-2 rounded-lg border bg-white p-2 transition-colors lg:gap-3 lg:p-2.5 ${hoverBg} ${stateClasses} dark:bg-neutral-950`}
    >
      {/* Rank — mobile: tiny corner flag (top-right), no inline space cost.
          Desktop: inline circle as before so the existing layout stays intact. */}
      {rank !== undefined && (
        <>
          <span
            className={`absolute right-0 top-0 z-10 flex h-3.5 min-w-[14px] items-center justify-center rounded-bl-md rounded-tr-md px-1 text-[9px] font-bold leading-none ${RANK_COLORS[rank] ?? 'bg-neutral-200 text-neutral-500'} lg:hidden`}
            aria-label={`Ranking ${rank + 1}`}
          >
            {rank + 1}
          </span>
          <span
            className={`hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${RANK_COLORS[rank] ?? 'bg-neutral-200 text-neutral-500'} lg:flex`}
          >
            {rank + 1}
          </span>
        </>
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
        size={32}
      />

      <div className="min-w-0 flex-1">
        {/* Mobile: 2 lines (abbreviated name + club). Single-line was unreadable in the narrow
            2-col grid. Opinion badge is dropped here — see it on list/campo views. */}
        <p className="truncate text-[13px] font-semibold leading-tight lg:hidden" title={player.name}>
          {compactName(player.name)}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground lg:hidden">
          {player.club || '—'}
        </p>
        {/* Mobile state label — subtle colored text (no pill bg) so the user can tell amber from
            sky from green at a glance even on small cards. Priority: Dúvida > Pré-Época >
            Assinou > Vai Assinar (matches FormationSlot/SquadListView priority). */}
        {(player.isDoubt || player.isPreseason || player.isSigned || player.isWillSign) && (
          <p className={`mt-0.5 text-[9px] font-bold uppercase tracking-wide leading-tight lg:hidden ${
            player.isDoubt
              ? 'text-amber-700'
              : player.isPreseason
                ? 'text-sky-700'
                : player.isSigned
                  ? 'text-green-700'
                  : 'text-green-600'
          }`}>
            {player.isDoubt ? 'Dúvida' : player.isPreseason ? 'Pré-Época' : player.isSigned ? 'Assinou' : 'Vai Assinar'}
          </p>
        )}
        {/* Desktop: name on top, club + foot below, opinion badge on the right */}
        <p className="hidden truncate text-sm font-semibold lg:block">{player.name}</p>
        <p className="hidden truncate text-xs text-muted-foreground lg:block">
          {player.club || '—'}
          {player.foot ? ` · ${player.foot}` : ''}
        </p>
      </div>

      {/* Opinion — desktop only (mobile drops it for readability in the 2-column grid) */}
      <div className="hidden lg:block">
        <OpinionBadge opinion={player.departmentOpinion} />
      </div>
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
  // Lighter than the previous filled boxes — colored text + an underline matching the side
  // tint, with a small "vs" in between. Saves vertical space and stops feeling like 2 chunky
  // pills competing for attention.
  const leftHeaderColor = leftTint === 'green'
    ? 'border-green-500 text-green-700 dark:text-green-400'
    : 'border-blue-500 text-blue-700 dark:text-blue-400';
  const rightHeaderColor = rightTint === 'green'
    ? 'border-green-500 text-green-700 dark:text-green-400'
    : 'border-blue-500 text-blue-700 dark:text-blue-400';

  return (
    <div className="space-y-1.5">
      {/* Sticky compare header — items-stretch + a fixed row height keeps both sides the same
          height regardless of whether each header is plain text or a Select dropdown (the
          previous mixed-content layout caused the underlines to land at different vertical
          positions). */}
      <div className="sticky top-12 z-10 -mx-4 bg-card px-4 py-1.5 lg:-mx-6 lg:px-6">
        <div className="flex h-9 items-stretch gap-2 sm:gap-4">
          <div className={`flex flex-1 items-center justify-center border-b-2 px-1 text-center text-xs font-bold uppercase tracking-wide ${leftHeaderColor}`}>
            {leftHeader}
          </div>
          <span className="flex shrink-0 items-center text-[10px] font-medium uppercase text-muted-foreground">vs</span>
          <div className={`flex flex-1 items-center justify-center border-b-2 px-1 text-center text-xs font-bold uppercase tracking-wide ${rightHeaderColor}`}>
            {rightHeader}
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
            {/* Position header — slot code hidden on mobile (the textual label already says it).
                Desktop keeps both for the formation-grid feel. */}
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
              <span className="hidden text-sm font-bold text-foreground lg:inline">{slot}</span>
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

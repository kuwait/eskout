// src/components/squad/SquadCompareView.tsx
// Side-by-side comparison view — two squads compared position by position
// Color-coded sides: green tint for plantel, blue tint for shadow squad
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/common/PlayerAvatar.tsx, src/lib/constants.ts

'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { User } from 'lucide-react';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { SQUAD_SLOTS } from '@/lib/constants';
import { compactName } from '@/lib/utils/player-name';
import type { Player } from '@/lib/types';

/* ───────────── Rank indicator ───────────── */

const RANK_COLORS: Record<number, string> = {
  0: 'bg-amber-400 text-white',
  1: 'bg-neutral-300 text-neutral-700',
  2: 'bg-amber-700 text-white',
};

/* ───────────── Tactical role accents (slot → color theme) ───────────── */

/** Per-slot color theme for the section header — mirrors POSITION_CHIP_SOLID's tactical
 *  role grouping (GR=amber, defesa=blue, meio=orange, ataque=red). Used for the colored
 *  left stripe + soft gradient + label tint that gives each position section a strong
 *  identity at a glance. */
const SLOT_ROLE_ACCENT: Record<string, { stripe: string; tint: string; text: string }> = {
  GR:   { stripe: 'border-l-amber-500',  tint: 'from-amber-50/80 dark:from-amber-950/30',   text: 'text-amber-800 dark:text-amber-300' },
  DD:   { stripe: 'border-l-blue-600',   tint: 'from-blue-50/80 dark:from-blue-950/30',     text: 'text-blue-800 dark:text-blue-300' },
  DC_D: { stripe: 'border-l-blue-600',   tint: 'from-blue-50/80 dark:from-blue-950/30',     text: 'text-blue-800 dark:text-blue-300' },
  DC_E: { stripe: 'border-l-blue-600',   tint: 'from-blue-50/80 dark:from-blue-950/30',     text: 'text-blue-800 dark:text-blue-300' },
  DE:   { stripe: 'border-l-blue-600',   tint: 'from-blue-50/80 dark:from-blue-950/30',     text: 'text-blue-800 dark:text-blue-300' },
  MDC:  { stripe: 'border-l-orange-500', tint: 'from-orange-50/80 dark:from-orange-950/30', text: 'text-orange-800 dark:text-orange-300' },
  MC:   { stripe: 'border-l-orange-500', tint: 'from-orange-50/80 dark:from-orange-950/30', text: 'text-orange-800 dark:text-orange-300' },
  MOC:  { stripe: 'border-l-orange-500', tint: 'from-orange-50/80 dark:from-orange-950/30', text: 'text-orange-800 dark:text-orange-300' },
  ED:   { stripe: 'border-l-red-500',    tint: 'from-red-50/80 dark:from-red-950/30',       text: 'text-red-800 dark:text-red-300' },
  EE:   { stripe: 'border-l-red-500',    tint: 'from-red-50/80 dark:from-red-950/30',       text: 'text-red-800 dark:text-red-300' },
  PL:   { stripe: 'border-l-red-600',    tint: 'from-red-50/80 dark:from-red-950/30',       text: 'text-red-800 dark:text-red-300' },
};

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

  const photoUrl = player.photoUrl || player.zzPhotoUrl;

  return (
    <Link
      href={`/jogadores/${player.id}`}
      className={`group relative flex min-h-[56px] items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${hoverBg} ${stateClasses} dark:bg-neutral-950`}
    >
      {/* Rank — corner flag (top-right) on all viewports. The new flush-photo layout has no
          natural inline slot for it, so we use the same compact corner tag everywhere. */}
      {rank !== undefined && (
        <span
          className={`absolute right-0 top-0 z-10 flex h-3.5 min-w-[14px] items-center justify-center rounded-bl-md rounded-tr-md px-1 text-[9px] font-bold leading-none ${RANK_COLORS[rank] ?? 'bg-neutral-200 text-neutral-500'}`}
          aria-label={`Ranking ${rank + 1}`}
        >
          {rank + 1}
        </span>
      )}

      {/* Photo flush left, full card height (no padding around it) — magazine-card feel.
          `relative` + `next/image fill` lets the image cover the slot without explicit
          width/height matching. */}
      <div className="relative w-14 shrink-0 self-stretch bg-neutral-100 dark:bg-neutral-800">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            unoptimized
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            <User className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Text content — padded, vertically centered */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2 lg:p-2.5">
        {/* Mobile: 2 lines (abbreviated name + club). */}
        <p className="truncate text-[13px] font-semibold leading-tight lg:hidden" title={player.name}>
          {compactName(player.name)}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground lg:hidden">
          {player.club || '—'}
        </p>
        {/* Mobile state label — subtle colored text (no pill bg) so the user can tell amber from
            sky from green at a glance even on small cards. */}
        {(player.isDoubt || player.isPreseason || player.isSigned || player.isWillSign) && (
          <p className={`text-[9px] font-bold uppercase tracking-wide leading-tight lg:hidden ${
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
        {/* Desktop: name on top, club + foot below */}
        <p className="hidden truncate text-sm font-semibold lg:block">{player.name}</p>
        <p className="hidden truncate text-xs text-muted-foreground lg:block">
          {player.club || '—'}
          {player.foot ? ` · ${player.foot}` : ''}
        </p>
      </div>

      {/* Opinion — desktop only, sits on the right with its own padding (text content already
          has p-2.5 so the badge needs explicit pr-2.5 to keep symmetric). */}
      <div className="hidden shrink-0 self-center pr-2.5 lg:block">
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

        const accent = SLOT_ROLE_ACCENT[slot] ?? {
          stripe: 'border-l-neutral-300',
          tint: 'from-neutral-50 dark:from-neutral-900',
          text: 'text-foreground',
        };

        return (
          <div key={slot}>
            {/* Position section header — colored left stripe + soft gradient based on tactical
                role. Adds count badges per side ("3 vs 2") for an at-a-glance comparison signal. */}
            <div className={`mt-4 flex items-center justify-between gap-3 rounded-lg border-l-4 bg-gradient-to-r to-transparent px-3 py-2 ${accent.stripe} ${accent.tint}`}>
              <div className="flex items-baseline gap-2">
                <span className={`hidden text-[11px] font-bold tracking-[0.15em] lg:inline ${accent.text} opacity-70`}>{slot}</span>
                <span className={`text-[15px] font-bold tracking-tight ${accent.text}`}>{label}</span>
              </div>
              {/* Per-side count summary — left in tint, "vs" muted, right in tint */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
                <span className={`flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 ${
                  leftTint === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                }`}>
                  {leftPlayers.length}
                </span>
                <span className="text-[9px] text-muted-foreground/70">vs</span>
                <span className={`flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 ${
                  rightTint === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                }`}>
                  {rightPlayers.length}
                </span>
              </div>
            </div>

            {/* Two-column grid with subtle dashed center divider — reinforces the side-by-side
                comparison feel without competing with the cards themselves. The divider runs
                only along the column area (not the section header) via the inner wrapper. */}
            <div className="relative mt-2 grid grid-cols-2 gap-2 sm:gap-3">
              {/* Center divider — absolute so it doesn't take grid space; pointer-events-none
                  so it doesn't intercept clicks that hit the gap. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 border-l border-dashed border-neutral-200 dark:border-neutral-800" />
              {/* Left column */}
              <div className="space-y-1.5">
                {leftPlayers.length === 0 ? (
                  <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50/40 text-[11px] italic text-muted-foreground/60 dark:border-neutral-800 dark:bg-neutral-900/30">
                    sem jogador
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
                  <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50/40 text-[11px] italic text-muted-foreground/60 dark:border-neutral-800 dark:bg-neutral-900/30">
                    sem jogador
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

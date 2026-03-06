// src/components/players/PlayerCard.tsx
// Mobile card component for displaying a player in the player list
// Compact layout with eval rating, name, DOB, position, club, opinion badge, status — tappable to open profile
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/OpinionBadge.tsx, src/lib/constants.ts

import Link from 'next/link';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Player } from '@/lib/types';

/* ───────────── Rating Colors (same as PlayerTable/PlayerProfile) ───────────── */

const RATING_COLORS: Record<number, { dot: string; num: string }> = {
  1: { dot: 'bg-red-500', num: 'text-red-600' },
  2: { dot: 'bg-orange-400', num: 'text-orange-600' },
  3: { dot: 'bg-blue-400', num: 'text-blue-600' },
  4: { dot: 'bg-emerald-400', num: 'text-emerald-600' },
  5: { dot: 'bg-emerald-600', num: 'text-emerald-700' },
};

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const evalParsed = player.observerEval ? parseEval(player.observerEval) : null;
  const evalColors = evalParsed ? (RATING_COLORS[evalParsed.rating] ?? { dot: 'bg-neutral-300', num: 'text-neutral-400' }) : null;

  return (
    <Link
      href={`/jogadores/${player.id}`}
      className="block rounded-lg border bg-white p-3 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
    >
      <div className="flex items-start gap-2.5">
        {/* Rating circle — left side */}
        {evalParsed && evalColors ? (
          <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-white ${evalColors.dot}`}>
              {evalParsed.rating}
            </span>
            <div className="flex gap-[2px]">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={`h-1 w-2 rounded-full ${i < evalParsed.rating ? evalColors.dot : 'bg-neutral-200'}`} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 pt-0.5">
            <span className="text-[10px] font-medium text-neutral-300">—</span>
          </div>
        )}

        {/* Content — middle */}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-medium text-neutral-900">
            <ObservationBadge player={player} />
            <span className="truncate">{player.name}</span>
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            {player.positionNormalized && (
              <span className="font-medium text-neutral-600">{player.positionNormalized}</span>
            )}
            {player.club && <span className="truncate">{player.club}</span>}
          </div>
          {player.dob && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(player.dob)}
            </p>
          )}
        </div>

        {/* Badges — right side */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <OpinionBadge opinion={player.departmentOpinion} />
          {player.recruitmentStatus && (
            <StatusBadge status={player.recruitmentStatus} />
          )}
        </div>
      </div>
    </Link>
  );
}

function parseEval(value: string): { rating: number; label: string } {
  const m = value.match(/^(\d)/);
  const rating = m ? parseInt(m[1], 10) : 0;
  const label = value.replace(/^\d\s*-\s*/, '');
  return { rating, label };
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}

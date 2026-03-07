// src/components/players/PlayerCard.tsx
// Mobile card component for displaying a player in the player list
// Compact row with square rating badge, photo + name, club, DOB + position — tappable to open profile
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/ClubBadge.tsx, src/lib/constants.ts

import Image from 'next/image';
import Link from 'next/link';
import { User } from 'lucide-react';
import { ClubBadge } from '@/components/common/ClubBadge';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { getPrimaryRating } from '@/lib/constants';
import type { Player } from '@/lib/types';

/* ───────────── Rating Colors (card-style badge, same palette as PlayerTable) ───────────── */

const RATING_COLORS: Record<number, { num: string; bg: string; border: string }> = {
  1: { num: 'text-red-600', bg: 'bg-red-50/80', border: 'border-red-200' },
  2: { num: 'text-orange-600', bg: 'bg-orange-50/80', border: 'border-orange-200' },
  3: { num: 'text-blue-600', bg: 'bg-blue-50/80', border: 'border-blue-200' },
  4: { num: 'text-emerald-600', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
  5: { num: 'text-emerald-700', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
};
const RATING_DEFAULT = { num: 'text-neutral-400', bg: 'bg-neutral-50', border: 'border-neutral-200' };

/** Parse "4 - Muito Bom" → { label: "Muito Bom" } */
function parseEvalLabel(value: string): string {
  return value.replace(/^\d\s*-\s*/, '');
}

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const primary = getPrimaryRating(player);
  const ratingInt = primary ? Math.round(primary.value) : 0;

  const photoUrl = player.photoUrl || player.zzPhotoUrl;

  // Position badges: primary + secondary + tertiary
  const positions = [
    player.positionNormalized,
    player.secondaryPosition,
    player.tertiaryPosition,
  ].filter(Boolean);

  return (
    <Link
      href={`/jogadores/${player.id}`}
      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 transition-colors hover:bg-accent/50 active:bg-accent"
    >
      {/* Square rating badge — matches desktop EvalCell */}
      <EvalBadge primary={primary} ratingInt={ratingInt} player={player} />

      {/* Photo — same size and shape as rating badge */}
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={50}
          height={50}
          className="h-[50px] w-[50px] shrink-0 rounded-xl object-cover"
          unoptimized
        />
      ) : (
        <span className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-400">
          <User className="h-5 w-5" />
        </span>
      )}

      {/* Content — 3 lines */}
      <div className="min-w-0 flex-1">
        {/* Line 1: name + observation badge */}
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <ObservationBadge player={player} />
          <span className="truncate">{player.name}</span>
        </p>

        {/* Line 2: club */}
        {player.club && (
          <div className="mt-0.5">
            <ClubBadge club={player.club} logoUrl={player.clubLogoUrl} size="sm" className="text-muted-foreground" />
          </div>
        )}

        {/* Line 3: DOB + position badges */}
        <div className="mt-0.5 flex items-center gap-2">
          {player.dob && (
            <span className="text-xs text-muted-foreground">{formatDate(player.dob)}</span>
          )}
          {positions.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">{positions[0]}</span>
              {positions.slice(1).map((pos, i) => (
                <span key={pos} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  i === 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-50 text-orange-700'
                }`}>{pos}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ───────────── Square Rating Badge (matches desktop PlayerTable EvalCell) ───────────── */

function EvalBadge({ primary, ratingInt, player }: {
  primary: ReturnType<typeof getPrimaryRating>;
  ratingInt: number;
  player: Player;
}) {
  if (!primary) {
    return (
      <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50">
        <span className="text-xs text-neutral-300">—</span>
      </div>
    );
  }

  const c = RATING_COLORS[ratingInt] ?? RATING_DEFAULT;
  const displayValue = primary.isAverage ? primary.value.toFixed(1) : String(primary.value);
  const label = primary.isAverage
    ? `${player.reportRatingCount} aval.`
    : (player.observerEval ? parseEvalLabel(player.observerEval) : '');

  return (
    <div className={`flex h-[50px] w-[50px] shrink-0 flex-col items-center justify-center rounded-xl border ${c.bg} ${c.border}`}>
      <span className={`text-base font-black leading-tight ${c.num}`}>{displayValue}</span>
      {label && <span className={`text-[8px] font-semibold leading-tight ${c.num} opacity-70`}>{label}</span>}
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

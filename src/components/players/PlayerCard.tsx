// src/components/players/PlayerCard.tsx
// Mobile card component for displaying a player in the player list
// Compact row with square rating badge, photo + name, club, DOB + position — tappable to open profile
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/ClubBadge.tsx, src/lib/constants.ts

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { User } from 'lucide-react';
import { ClubBadge } from '@/components/common/ClubBadge';
import { ObservationBadge } from '@/components/common/ObservationBadge';
import { PlayingUpBadge } from '@/components/common/PlayingUpBadge';
import { ListBookmarkDropdown } from '@/components/players/ListBookmarkDropdown';
import { getPrimaryRating } from '@/lib/constants';
import type { Player } from '@/lib/types';

/* ───────────── Rating Colors (card-style badge, same palette as PlayerTable) ───────────── */

/* Unified 1-5 color scale: 1=red, 2=orange, 3=sky, 4=teal, 5=green */
const RATING_COLORS: Record<number, { num: string; bg: string; border: string }> = {
  1: { num: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  2: { num: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  3: { num: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' },
  4: { num: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200' },
  5: { num: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
};
const RATING_DEFAULT = { num: 'text-neutral-400', bg: 'bg-neutral-50', border: 'border-neutral-200' };

interface PlayerCardProps {
  player: Player;
  hideEvaluations?: boolean;
  hideScoutingData?: boolean;
}

export function PlayerCard({ player, hideEvaluations = false, hideScoutingData = false }: PlayerCardProps) {
  const primary = getPrimaryRating(player);
  const ratingInt = primary ? (Math.ceil(primary.value) || 1) : 0;

  const photoUrl = player.photoUrl || player.zzPhotoUrl;

  // Position badges: primary + secondary + tertiary
  const positions = [
    player.positionNormalized,
    player.secondaryPosition,
    player.tertiaryPosition,
  ].filter(Boolean);

  const ratingColors = ratingInt ? (RATING_COLORS[ratingInt] ?? RATING_DEFAULT) : RATING_DEFAULT;
  const ratingValue = primary ? (primary.isAverage ? primary.value.toFixed(1) : String(primary.value)) : null;

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent/50 active:bg-accent">
      {/* Navigable area — everything except bookmark */}
      <Link href={`/jogadores/${player.id}`} className="flex min-h-[68px] min-w-0 flex-1 items-stretch">
        {/* Photo flush left, full card height — magazine-card feel. Rating sticker at top-left
            of the photo (when not hidden) keeps the eval readable without claiming a separate
            column on the left. */}
        <div className="relative w-[72px] shrink-0 self-stretch bg-neutral-100 dark:bg-neutral-800">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              fill
              unoptimized
              sizes="72px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-400">
              <User className="h-6 w-6" />
            </div>
          )}
          {!hideEvaluations && primary && ratingValue && (
            <div
              className={`absolute bottom-1 left-1 flex flex-col items-center justify-center rounded-md border px-1 py-0.5 shadow-sm ${ratingColors.bg} ${ratingColors.border}`}
              title={primary.isAverage ? `${player.reportRatingCount} avaliações` : (player.observerEval ?? '')}
            >
              <span className={`text-[13px] font-black leading-none ${ratingColors.num}`}>
                {ratingValue}
              </span>
            </div>
          )}
        </div>

        {/* Content — padded, vertically centered. 3 lines. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 p-2.5">
          {/* Line 1: name + observation badge */}
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {!hideScoutingData && <ObservationBadge player={player} />}
            {!hideScoutingData && <PlayingUpBadge player={player} />}
            <span className="truncate">{player.name}</span>
          </p>

          {/* Line 2: club */}
          {player.club && (
            <ClubBadge club={player.club} logoUrl={player.clubLogoUrl} size="sm" className="text-muted-foreground" />
          )}

          {/* Line 3: DOB + position badges */}
          <div className="flex items-center gap-2">
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

      {/* Bookmark — add to list (outside Link to prevent navigation) */}
      <div className="shrink-0 self-center pr-2.5">
        <ListBookmarkDropdown playerId={player.id} compact lazy />
      </div>
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

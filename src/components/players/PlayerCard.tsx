// src/components/players/PlayerCard.tsx
// Mobile card component for displaying a player in the player list
// Compact layout with name, DOB, position, club, opinion badge, status — tappable to open profile
// RELEVANT FILES: src/components/players/PlayersView.tsx, src/components/common/OpinionBadge.tsx, src/lib/constants.ts

import Link from 'next/link';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import type { Player } from '@/lib/types';

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <Link
      href={`/jogadores/${player.id}`}
      className="block rounded-lg border bg-white p-3 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-neutral-900">{player.name}</p>
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
        <div className="flex flex-col items-end gap-1">
          <OpinionBadge opinion={player.departmentOpinion} />
          {player.recruitmentStatus && (
            <StatusBadge status={player.recruitmentStatus} />
          )}
          {player.foot && (
            <span className="text-xs text-muted-foreground">{player.foot}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}

// src/components/squad/SquadPlayerCard.tsx
// Compact player card for squad views (campo, positions)
// Shows photo/placeholder, name, club, opinion badge, foot — links to player profile
// RELEVANT FILES: src/components/common/OpinionBadge.tsx, src/components/squad/PositionGroup.tsx, src/lib/types/index.ts

'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';
import { Button } from '@/components/ui/button';
import type { Player } from '@/lib/types';

interface SquadPlayerCardProps {
  player: Player;
  /** Show remove button (admin only, shadow squad) */
  onRemove?: () => void;
  /** Compact variant for small spaces */
  compact?: boolean;
}

export function SquadPlayerCard({ player, onRemove, compact }: SquadPlayerCardProps) {
  return (
    <div className="group flex items-center gap-2 rounded-md border bg-white p-2 transition-colors hover:bg-neutral-50">
      <Link
        href={`/jogadores/${player.id}`}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <PlayerAvatar
          player={{
            name: player.name,
            photoUrl: player.photoUrl || player.zzPhotoUrl,
            club: player.club,
            position: player.positionNormalized,
            dob: player.dob,
            foot: player.foot,
          }}
          size={20}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
            {player.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {player.club}
            {player.foot ? ` · ${player.foot}` : ''}
          </p>
        </div>
        <OpinionBadge opinion={player.departmentOpinion} />
      </Link>

      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          aria-label={`Remover ${player.name} do plantel sombra`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

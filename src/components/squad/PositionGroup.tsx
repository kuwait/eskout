// src/components/squad/PositionGroup.tsx
// Displays a position label with a list of player cards grouped under it
// Reusable across Campo, Positions views — shows count badge and empty state
// RELEVANT FILES: src/components/squad/SquadPlayerCard.tsx, src/lib/constants.ts, src/lib/types/index.ts

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { POSITION_LABELS } from '@/lib/constants';
import { SquadPlayerCard } from '@/components/squad/SquadPlayerCard';
import type { Player, PositionCode } from '@/lib/types';

interface PositionGroupProps {
  position: PositionCode;
  players: Player[];
  /** Show add button */
  onAdd?: () => void;
  /** Callback when removing a player */
  onRemovePlayer?: (playerId: number) => void;
}

export function PositionGroup({
  position,
  players,
  onAdd,
  onRemovePlayer,
}: PositionGroupProps) {
  const label = POSITION_LABELS[position];
  const isEmpty = players.length === 0;

  return (
    <div className="rounded-lg border bg-white p-3">
      {/* Position header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs font-bold text-white">
            {position}
          </span>
          <span className="text-sm font-medium">{label}</span>
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-muted-foreground">
            {players.length}
          </span>
        </div>

        {onAdd && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onAdd}
            aria-label={`Adicionar jogador a ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Player cards or empty state */}
      {isEmpty ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Sem jogadores nesta posição
        </p>
      ) : (
        <div className="space-y-1.5">
          {players.map((player) => (
            <SquadPlayerCard
              key={player.id}
              player={player}
              onRemove={onRemovePlayer ? () => onRemovePlayer(player.id) : undefined}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

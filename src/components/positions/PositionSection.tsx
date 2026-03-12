// src/components/positions/PositionSection.tsx
// Shows one position with 3 sub-groups: real squad, shadow squad, pool candidates
// Includes coverage indicator (good / needs attention / empty)
// RELEVANT FILES: src/components/positions/PositionsView.tsx, src/components/squad/SquadPlayerCard.tsx, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { POSITION_LABELS } from '@/lib/constants';
import { SquadPlayerCard } from '@/components/squad/SquadPlayerCard';
import type { Player, PositionCode } from '@/lib/types';

interface PositionSectionProps {
  position: PositionCode;
  realPlayers: Player[];
  shadowPlayers: Player[];
  poolPlayers: Player[];
}

/** Coverage indicator based on real + shadow counts */
function getCoverage(real: number, shadow: number): { label: string; color: string } {
  if (real > 0 && shadow > 0) return { label: 'Coberta', color: 'bg-green-500' };
  if (real > 0 || shadow > 0) return { label: 'Parcial', color: 'bg-yellow-500' };
  return { label: 'Vazia', color: 'bg-red-500' };
}

export function PositionSection({
  position,
  realPlayers,
  shadowPlayers,
  poolPlayers,
}: PositionSectionProps) {
  const [poolExpanded, setPoolExpanded] = useState(false);
  const coverage = getCoverage(realPlayers.length, shadowPlayers.length);

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs font-bold text-white">
              {position}
            </span>
            <span className="font-medium">{POSITION_LABELS[position]}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${coverage.color}`} />
            <span className="text-xs text-muted-foreground">{coverage.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Real Squad */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Plantel ({realPlayers.length})
          </p>
          {realPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-1">
              {realPlayers.map((p) => (
                <SquadPlayerCard key={p.id} player={p} compact />
              ))}
            </div>
          )}
        </div>

        {/* Shadow Squad */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Plantel Sombra ({shadowPlayers.length})
          </p>
          {shadowPlayers.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-1">
              {shadowPlayers.map((p) => (
                <SquadPlayerCard key={p.id} player={p} compact />
              ))}
            </div>
          )}
        </div>

        {/* Pool */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
              Pool ({poolPlayers.length})
            </p>
            {poolPlayers.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                onClick={() => setPoolExpanded(!poolExpanded)}
              >
                {poolExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
          {poolExpanded && poolPlayers.length > 0 && (
            <div className="space-y-1">
              {poolPlayers.map((p) => (
                <SquadPlayerCard key={p.id} player={p} compact />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// src/components/positions/PositionsView.tsx
// Client orchestrator for the Positions page — shows all 10 positions with sub-groups
// Fetches players for the age group, groups by position into real/shadow/pool
// RELEVANT FILES: src/components/positions/PositionSection.tsx, src/hooks/useAgeGroup.tsx, src/lib/constants.ts

'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { POSITION_CODES } from '@/lib/constants';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { PositionSection } from '@/components/positions/PositionSection';
import type { Player, PlayerRow, PositionCode } from '@/lib/types';

export function PositionsView() {
  const { selectedId } = useAgeGroup();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!selectedId) return;
    const supabase = createClient();
    supabase
      .from('players')
      .select('*')
      .eq('age_group_id', selectedId)
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          startTransition(() => {
            setPlayers((data as PlayerRow[]).map(mapPlayerRow));
          });
        }
      });
  }, [selectedId]);

  /* ───────────── Group by position ───────────── */

  const positionData = useMemo(() => {
    const result: Record<PositionCode, { real: Player[]; shadow: Player[]; pool: Player[] }> =
      {} as Record<PositionCode, { real: Player[]; shadow: Player[]; pool: Player[] }>;

    for (const pos of POSITION_CODES) {
      result[pos] = { real: [], shadow: [], pool: [] };
    }

    for (const p of players) {
      // Real squad
      if (p.isRealSquad && p.positionNormalized) {
        result[p.positionNormalized as PositionCode]?.real.push(p);
      }
      // Shadow squad
      if (p.isShadowSquad && p.shadowPosition) {
        result[p.shadowPosition]?.shadow.push(p);
      }
      // Pool: not in real or shadow, has a normalized position
      if (!p.isRealSquad && !p.isShadowSquad && p.positionNormalized) {
        result[p.positionNormalized as PositionCode]?.pool.push(p);
      }
    }

    return result;
  }, [players]);

  if (!selectedId) {
    return (
      <div className="space-y-4">
        <AgeGroupSelector />
        <p className="text-muted-foreground">Selecione um escalão para ver as posições.</p>
      </div>
    );
  }

  if (isPending && players.length === 0) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-neutral-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AgeGroupSelector />

      <div className="grid gap-3 md:grid-cols-2">
        {POSITION_CODES.map((pos) => (
          <PositionSection
            key={pos}
            position={pos}
            realPlayers={positionData[pos].real}
            shadowPlayers={positionData[pos].shadow}
            poolPlayers={positionData[pos].pool}
          />
        ))}
      </div>
    </div>
  );
}

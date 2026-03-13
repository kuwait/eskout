// src/components/positions/PositionsView.tsx
// Client orchestrator for the Positions page — shows all 10 positions with sub-groups
// Fetches players for the age group, groups by position into real/shadow/pool
// RELEVANT FILES: src/components/positions/PositionSection.tsx, src/hooks/useAgeGroup.tsx, src/lib/constants.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { POSITION_CODES } from '@/lib/constants';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { PositionSection } from '@/components/positions/PositionSection';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import type { Player, PlayerRow, PositionCode } from '@/lib/types';

export function PositionsView({ clubId }: { clubId: string }) {
  const { selectedId } = useAgeGroup();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();

  const fetchPlayers = useCallback(() => {
    if (!selectedId) return;
    const supabase = createClient();
    supabase
      .from('players')
      .select('*')
      .eq('club_id', clubId)
      .eq('age_group_id', selectedId)
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          startTransition(() => {
            setPlayers((data as PlayerRow[]).map(mapPlayerRow));
          });
        }
      });
  }, [selectedId, clubId]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  /* ───────────── Realtime: refresh when players change ───────────── */
  useRealtimeTable('players', { onAny: () => fetchPlayers() });

  /* ───────────── Group by position ───────────── */

  const positionData = useMemo(() => {
    const result: Record<PositionCode, { real: Player[]; shadow: Player[]; pool: Player[] }> =
      {} as Record<PositionCode, { real: Player[]; shadow: Player[]; pool: Player[] }>;

    for (const pos of POSITION_CODES) {
      result[pos] = { real: [], shadow: [], pool: [] };
    }

    for (const p of players) {
      // Real squad — use realSquadPosition (squad slot), fall back to natural position
      const realPos = p.realSquadPosition ?? p.positionNormalized;
      if (p.isRealSquad && realPos) {
        // DC_E/DC_D → DC for position-level grouping
        const basePos = realPos === 'DC_E' || realPos === 'DC_D' ? 'DC' : realPos;
        result[basePos as PositionCode]?.real.push(p);
      }
      // Shadow squad
      if (p.isShadowSquad && p.shadowPosition) {
        const baseShadow = p.shadowPosition === 'DC_E' || p.shadowPosition === 'DC_D' ? 'DC' : p.shadowPosition;
        result[baseShadow as PositionCode]?.shadow.push(p);
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

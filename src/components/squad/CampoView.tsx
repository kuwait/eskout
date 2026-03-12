// src/components/squad/CampoView.tsx
// Client orchestrator for the Campo page — Real vs Shadow Squad comparison
// Both squads are manually built. Add/remove from either squad.
// RELEVANT FILES: src/components/squad/PositionGroup.tsx, src/components/squad/AddToSquadDialog.tsx, src/hooks/useAgeGroup.tsx

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { POSITION_CODES } from '@/lib/constants';
import { PositionGroup } from '@/components/squad/PositionGroup';
import { AddToSquadDialog } from '@/components/squad/AddToSquadDialog';
import { removeFromShadowSquad, toggleRealSquad } from '@/actions/squads';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Player, PlayerRow, PositionCode } from '@/lib/types';

type SquadType = 'real' | 'shadow';

export function CampoView() {
  const { selectedId } = useAgeGroup();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPosition, setDialogPosition] = useState<PositionCode>('GR');
  const [dialogSquadType, setDialogSquadType] = useState<SquadType>('shadow');

  /* ───────────── Fetch players ───────────── */

  const fetchPlayers = useCallback(() => {
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

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  /* ───────────── Group players by position ───────────── */

  const realByPosition = useMemo(() => {
    const map: Record<string, Player[]> = {};
    for (const pos of POSITION_CODES) map[pos] = [];
    for (const p of players) {
      if (p.isRealSquad) {
        const pos = p.realSquadPosition ?? p.positionNormalized;
        if (pos) map[pos]?.push(p);
      }
    }
    return map;
  }, [players]);

  const shadowByPosition = useMemo(() => {
    const map: Record<string, Player[]> = {};
    for (const pos of POSITION_CODES) map[pos] = [];
    for (const p of players) {
      if (p.isShadowSquad && p.shadowPosition) {
        map[p.shadowPosition]?.push(p);
      }
    }
    return map;
  }, [players]);

  // Available: not already in the target squad
  const availableForShadow = useMemo(() => players.filter((p) => !p.isShadowSquad), [players]);
  const availableForReal = useMemo(() => players.filter((p) => !p.isRealSquad), [players]);

  /* ───────────── Handlers ───────────── */

  function handleOpenAddDialog(position: PositionCode, squadType: SquadType) {
    setDialogPosition(position);
    setDialogSquadType(squadType);
    setDialogOpen(true);
  }

  function handleRemoveFromShadow(playerId: number) {
    startTransition(async () => {
      await removeFromShadowSquad(playerId);
      fetchPlayers();
    });
  }

  function handleRemoveFromReal(playerId: number) {
    startTransition(async () => {
      await toggleRealSquad(playerId, false);
      fetchPlayers();
    });
  }

  if (!selectedId) {
    return <p className="text-muted-foreground">Selecione um escalão para ver o plantel.</p>;
  }

  /* ───────────── Render ───────────── */

  const renderRealPanel = () => (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Plantel</h2>
      {POSITION_CODES.map((pos) => (
        <PositionGroup
          key={pos}
          position={pos}
          players={realByPosition[pos]}
          onAdd={() => handleOpenAddDialog(pos, 'real')}
          onRemovePlayer={handleRemoveFromReal}
        />
      ))}
    </div>
  );

  const renderShadowPanel = () => (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Plantel Sombra</h2>
      {POSITION_CODES.map((pos) => (
          <PositionGroup
            key={pos}
            position={pos}
            players={shadowByPosition[pos]}
            onAdd={() => handleOpenAddDialog(pos, 'shadow')}
            onRemovePlayer={handleRemoveFromShadow}
          />
      ))}
    </div>
  );

  return (
    <>
      {/* Loading skeleton */}
      {isPending && players.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      )}

      {/* Desktop: two columns side by side */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
        {renderRealPanel()}
        {renderShadowPanel()}
      </div>

      {/* Mobile: tabs */}
      <div className="lg:hidden">
        <Tabs defaultValue="real">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="real" className="flex-1">Plantel</TabsTrigger>
            <TabsTrigger value="shadow" className="flex-1">Plantel Sombra</TabsTrigger>
          </TabsList>
          <TabsContent value="real">{renderRealPanel()}</TabsContent>
          <TabsContent value="shadow">{renderShadowPanel()}</TabsContent>
        </Tabs>
      </div>

      {/* Add to squad dialog — supports both real and shadow */}
      <AddToSquadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={dialogPosition}
        squadType={dialogSquadType}
        availablePlayers={dialogSquadType === 'shadow' ? availableForShadow : availableForReal}
        onAdded={fetchPlayers}
      />
    </>
  );
}

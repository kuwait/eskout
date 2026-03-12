// src/components/admin/SquadManagement.tsx
// Admin section for managing custom squads — create, rename, delete, reorder
// Dedicated page at /definicoes/planteis. Two columns: real (left) + shadow (right).
// RELEVANT FILES: src/app/definicoes/planteis/page.tsx, src/actions/squads.ts, src/components/squad/CreateSquadDialog.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, LayoutGrid, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreateSquadDialog } from '@/components/squad/CreateSquadDialog';
import { DeleteSquadConfirmDialog } from '@/components/squad/DeleteSquadConfirmDialog';
import { renameSquad, updateSquadDescription, reorderSquads } from '@/actions/squads';
import { createClient } from '@/lib/supabase/client';
import { mapSquadRow } from '@/lib/supabase/mappers';
import { toast } from 'sonner';
import type { Squad, SquadRow, SquadType, AgeGroup } from '@/lib/types';

export function SquadManagement() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<SquadType>('real');
  const [createAgeGroupId, setCreateAgeGroupId] = useState<number | undefined>();

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Squad | null>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingDescId, setEditingDescId] = useState<number | null>(null);
  const [descValue, setDescValue] = useState('');

  /* ───────────── Fetch data ───────────── */

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const [squadsRes, agRes, countsRes] = await Promise.all([
      supabase.from('squads').select('*').order('name'),
      supabase.from('age_groups').select('id, name, generation_year, season').order('generation_year', { ascending: false }),
      supabase.from('squad_players').select('squad_id'),
    ]);

    if (squadsRes.data) {
      setSquads((squadsRes.data as SquadRow[]).map(mapSquadRow));
    }

    if (agRes.data) {
      setAgeGroups(agRes.data.map((r) => ({
        id: r.id,
        name: r.name,
        generationYear: r.generation_year,
        season: r.season,
      })));
    }

    // Count players per squad
    if (countsRes.data) {
      const counts = new Map<number, number>();
      for (const row of countsRes.data) {
        counts.set(row.squad_id, (counts.get(row.squad_id) ?? 0) + 1);
      }
      setPlayerCounts(counts);
    }

    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a cascading render
  useEffect(() => { fetchData(); }, [fetchData]);

  /* ───────────── Handlers ───────────── */

  async function handleRename(squadId: number) {
    if (!renameValue.trim()) return;
    const res = await renameSquad(squadId, renameValue.trim());
    if (res.success) {
      toast.success('Plantel renomeado');
      setRenamingId(null);
      fetchData();
    } else {
      toast.error(res.error ?? 'Erro ao renomear');
    }
  }

  async function handleDescSave(squadId: number) {
    const res = await updateSquadDescription(squadId, descValue.trim() || undefined);
    if (res.success) {
      toast.success('Descrição atualizada');
      setEditingDescId(null);
      fetchData();
    } else {
      toast.error(res.error ?? 'Erro ao atualizar');
    }
  }

  function openCreate(type: SquadType, ageGroupId?: number) {
    setCreateType(type);
    setCreateAgeGroupId(ageGroupId);
    setCreateOpen(true);
  }

  /** Move a squad up/down within a list and re-assign sequential sort_order to all */
  async function handleMove(list: Squad[], index: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Build new order by swapping positions in the array
    const reordered = [...list];
    [reordered[index], reordered[targetIdx]] = [reordered[targetIdx], reordered[index]];

    // Assign sequential sort_order (0, 1, 2, ...)
    const updates = reordered.map((s, i) => ({ id: s.id, sortOrder: i }));

    // Optimistic local update
    setSquads((prev) => {
      const orderMap = new Map(updates.map((u) => [u.id, u.sortOrder]));
      return prev.map((s) => orderMap.has(s.id) ? { ...s, sortOrder: orderMap.get(s.id)! } : s);
    });

    const res = await reorderSquads(updates);
    if (!res.success) {
      toast.error(res.error ?? 'Erro ao reordenar');
      fetchData();
    }
  }

  /* ───────────── Group squads by type ───────────── */

  const realSquads = squads
    .filter((s) => s.squadType === 'real')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const shadowSquads = squads
    .filter((s) => s.squadType === 'shadow')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // Group shadow squads by generation year (descending)
  const shadowByYear = shadowSquads.reduce<Map<number, Squad[]>>((map, squad) => {
    const year = ageGroups.find((a) => a.id === squad.ageGroupId)?.generationYear ?? 0;
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(squad);
    return map;
  }, new Map());
  const shadowYears = [...shadowByYear.keys()].sort((a, b) => b - a);

  /* ───────────── Render squad row ───────────── */

  function renderSquadRow(squad: Squad, list: Squad[], indexInList: number) {
    const count = playerCounts.get(squad.id) ?? 0;
    const isRenaming = renamingId === squad.id;
    const isEditingDesc = editingDescId === squad.id;
    const isFirst = indexInList === 0;
    const isLast = indexInList === list.length - 1;
    const showArrows = list.length > 1;

    return (
      <div
        key={squad.id}
        className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors"
      >
        {/* Reorder arrows */}
        {showArrows && (
          <div className="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => handleMove(list, indexInList, 'up')}
              className="rounded p-0.5 text-muted-foreground hover:bg-neutral-100 hover:text-foreground disabled:opacity-20 dark:hover:bg-neutral-800"
              title="Mover para cima"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => handleMove(list, indexInList, 'down')}
              className="rounded p-0.5 text-muted-foreground hover:bg-neutral-100 hover:text-foreground disabled:opacity-20 dark:hover:bg-neutral-800"
              title="Mover para baixo"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* Name + description pill — click to edit inline */}
          <div className="flex items-center gap-2">
            {/* Squad name — click to rename */}
            {isRenaming ? (
              <form
                className="flex items-center"
                onSubmit={(e) => { e.preventDefault(); handleRename(squad.id); }}
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="truncate rounded bg-transparent text-sm font-medium outline-none ring-1 ring-neutral-300 px-1 py-0.5 dark:ring-neutral-600"
                  autoFocus
                  onBlur={() => handleRename(squad.id)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null); }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="truncate text-sm font-medium hover:underline"
                onClick={() => { setRenamingId(squad.id); setRenameValue(squad.name); }}
              >
                {squad.name}
              </button>
            )}

            {/* Description pill (real squads only) */}
            {squad.squadType === 'real' && (
              isEditingDesc ? (
                <form
                  className="flex items-center"
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={(e) => { e.preventDefault(); handleDescSave(squad.id); }}
                >
                  <input
                    type="text"
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground outline-none ring-1 ring-neutral-300 dark:bg-neutral-800 dark:ring-neutral-600"
                    placeholder="Descrição"
                    autoFocus
                    onBlur={() => handleDescSave(squad.id)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingDescId(null); }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  onClick={() => { setEditingDescId(squad.id); setDescValue(squad.description ?? ''); }}
                >
                  {squad.description || 'descrição'}
                </button>
              )
            )}
          </div>

          {/* Player count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {count} {count === 1 ? 'jogador' : 'jogadores'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
            title="Eliminar"
            onClick={() => setDeleteTarget(squad)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="h-4 w-4" />
              Plantéis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">A carregar...</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutGrid className="h-4 w-4" />
              Plantéis Sombra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">A carregar...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ───────────── Real Squads (left) ───────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="h-4 w-4" />
                Plantéis
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openCreate('real')}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Criar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {realSquads.length > 0 ? (
              <div className="space-y-2">
                {realSquads.map((squad, i) => renderSquadRow(squad, realSquads, i))}
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">Nenhum plantel criado.</p>
            )}
          </CardContent>
        </Card>

        {/* ───────────── Shadow Squads (right) ───────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="h-4 w-4" />
                Plantéis Sombra
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => openCreate('shadow')}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Criar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {shadowSquads.length > 0 ? (
              <div className="space-y-4">
                {shadowYears.map((year) => {
                  const yearSquads = shadowByYear.get(year)!;
                  return (
                    <div key={year} className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">{year}</h4>
                      {yearSquads.map((squad, i) => renderSquadRow(squad, yearSquads, i))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">Nenhum plantel sombra criado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      <CreateSquadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        squadType={createType}
        ageGroupId={createAgeGroupId}
        ageGroups={ageGroups}
        onCreated={() => { fetchData(); }}
      />

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteSquadConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          squad={deleteTarget}
          onDeleted={() => { setDeleteTarget(null); fetchData(); }}
        />
      )}
    </>
  );
}

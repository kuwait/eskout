// src/components/players/ListBookmarkDropdown.tsx
// Dropdown to add/remove a player from user's lists — used in player profile header
// Shows all user lists with checkboxes + inline "create new list" option
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Check, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  getMyLists,
  getPlayerListMemberships,
  updatePlayerListMemberships,
  createList,
} from '@/actions/player-lists';
import { toast } from 'sonner';
import type { PlayerList } from '@/lib/types';

/* ───────────── Component ───────────── */

export function ListBookmarkDropdown({ playerId, compact = false, lazy = false }: { playerId: number; compact?: boolean; lazy?: boolean }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<PlayerList[]>([]);
  const [memberListIds, setMemberListIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const isInAnyList = memberListIds.size > 0;

  /* Fetch lists + memberships */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [allLists, memberships] = await Promise.all([
      getMyLists(),
      getPlayerListMemberships(playerId),
    ]);
    setLists(allLists);
    setMemberListIds(new Set(memberships));
    setLoading(false);
  }, [playerId]);

  /* Refetch when popover opens */
  useEffect(() => {
    if (open) {
      fetchData();
      setShowCreate(false);
      setNewName('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on open change
  }, [open]);

  /* Fetch memberships on mount to show filled/unfilled icon (skip in lazy mode to avoid N+1 queries in tables) */
  useEffect(() => {
    if (!lazy) {
      getPlayerListMemberships(playerId).then((ids) => setMemberListIds(new Set(ids)));
    }
  }, [playerId, lazy]);

  /* Toggle a list membership */
  async function handleToggle(listId: number) {
    const wasChecked = memberListIds.has(listId);
    const newSet = new Set(memberListIds);
    if (wasChecked) {
      newSet.delete(listId);
    } else {
      newSet.add(listId);
    }
    setMemberListIds(newSet);

    // Optimistic update: adjust item count shown in the dropdown
    setLists((prev) => prev.map((l) =>
      l.id === listId ? { ...l, itemCount: l.itemCount + (wasChecked ? -1 : 1) } : l
    ));

    setSaving(true);
    const result = await updatePlayerListMemberships(playerId, Array.from(newSet));
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      // Revert on failure
      fetchData();
    }
  }

  /* Create new list + add player to it */
  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const result = await createList({ name: newName.trim() });
    if (result.success && result.data) {
      // Add player to the new list
      const newSet = new Set(memberListIds);
      newSet.add(result.data.id);
      setMemberListIds(newSet);
      await updatePlayerListMemberships(playerId, Array.from(newSet));
      toast.success(`Lista "${newName.trim()}" criada`);
      setNewName('');
      setShowCreate(false);
      // Refresh lists
      fetchData();
    } else {
      toast.error(result.error ?? 'Erro ao criar lista');
    }
    setCreating(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={compact
            ? 'flex items-center justify-center rounded p-1 text-muted-foreground/40 transition-colors hover:text-primary hover:bg-accent'
            : 'flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground hover:shadow-sm'
          }
          title="Adicionar a lista"
        >
          <Bookmark className={`${compact ? 'h-3.5 w-3.5' : 'h-3.5 w-3.5'} ${isInAnyList ? 'fill-current text-primary' : ''}`} />
          {!compact && <span className="hidden sm:inline">Listas</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        {/* Header */}
        <div className="border-b px-3 py-2">
          <p className="text-xs font-semibold">Adicionar a lista</p>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto py-1">
            {lists.map((list) => {
              const checked = memberListIds.has(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => handleToggle(list.id)}
                  disabled={saving}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-neutral-300'
                  }`}>
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <span className="mr-1">{list.emoji}</span>
                  <span className="truncate">{list.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{list.itemCount}</span>
                </button>
              );
            })}

            {lists.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sem listas</p>
            )}
          </div>
        )}

        {/* Create new list */}
        <div className="border-t px-3 py-2">
          {showCreate ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da lista..."
                className="h-7 text-xs flex-1"
                maxLength={50}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setShowCreate(false); setNewName(''); }
                }}
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova lista
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// src/app/listas/ListsPageClient.tsx
// Client component for the lists index page — grid of list cards + create/rename/delete
// Shows user's lists as cards with item count, emoji, last addition date
// RELEVANT FILES: src/app/listas/page.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

'use client';

import { useState, useMemo } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Users, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createList, renameList, deleteList } from '@/actions/player-lists';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import type { PlayerList } from '@/lib/types';

/* ───────────── Constants ───────────── */

const EMOJI_OPTIONS = ['📋', '👁', '⭐', '🎯', '🔥', '💎', '⚡', '🏆', '📌', '🔖', '💡', '🎪', '🛡️', '⚽', '🥅', '🏃', '📊', '🗂️', '🔍', '❤️'];

/* ───────────── Component ───────────── */

export function ListsPageClient({
  myLists,
  allLists,
  isAdmin,
}: {
  myLists: PlayerList[];
  allLists: PlayerList[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PlayerList | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlayerList | null>(null);
  const [allPanelOpen, setAllPanelOpen] = useState(false);

  /* ───────────── Realtime ───────────── */
  useRealtimeTable('player_lists', { onAny: () => router.refresh() });
  useRealtimeTable('player_list_items', { onAny: () => router.refresh() });

  /* ───────────── Helpers ───────────── */

  // Capture "now" once on mount to avoid impure Date.now() during render
  const [now] = useState(() => Date.now());

  function formatRelativeDate(iso: string | null) {
    if (!iso) return null;
    const diff = now - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'hoje';
    if (days === 1) return 'ontem';
    if (days < 7) return `há ${days} dias`;
    if (days < 30) return `há ${Math.floor(days / 7)} sem.`;
    return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  }

  /* ───────────── Delete handler ───────────── */

  async function handleDelete() {
    if (!deleteTarget) return;
    const result = await deleteList(deleteTarget.id);
    setDeleteTarget(null);
    if (result.success) {
      toast.success('Lista eliminada');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  /* ───────────── Total items count ───────────── */
  const totalItems = myLists.reduce((sum, l) => sum + l.itemCount, 0);

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Listas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {myLists.length} {myLists.length === 1 ? 'lista' : 'listas'} · {totalItems} {totalItems === 1 ? 'jogador' : 'jogadores'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Admin: secret "view all" toggle */}
          {isAdmin && allLists.length > 0 && (
            <button
              type="button"
              onClick={() => setAllPanelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-neutral-600"
            >
              <Users className="h-3.5 w-3.5" />
              Todas
            </button>
          )}
        </div>
      </div>

      {/* Lists grid */}
      {myLists.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">Ainda não tens listas</p>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Criar lista
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {myLists.map((list) => (
            <div key={list.id} className="group relative h-full">
              <Link
                href={`/listas/${list.id}`}
                className="flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                {/* Emoji */}
                <span className="text-2xl leading-none mt-0.5">{list.emoji}</span>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold truncate">{list.name}</h2>
                    {list.isSystem && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Sistema
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {list.itemCount} {list.itemCount === 1 ? 'jogador' : 'jogadores'}
                  </p>
                  {list.lastAddedAt && (
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      Última adição {formatRelativeDate(list.lastAddedAt)}
                    </p>
                  )}
                </div>
              </Link>

              {/* Actions menu — custom lists only */}
              {!list.isSystem && (
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenameTarget(list)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(list)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}

          {/* Create list card */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary min-h-[88px]"
          >
            <Plus className="h-4 w-4" />
            Nova Lista
          </button>
        </div>
      )}

      {/* Create list dialog */}
      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          router.refresh();
          router.push(`/listas/${id}`);
        }}
      />

      {/* Rename list dialog */}
      <RenameListDialog
        list={renameTarget}
        onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
        onRenamed={() => {
          setRenameTarget(null);
          router.refresh();
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais eliminar a lista <strong>{deleteTarget?.name}</strong> e todos os jogadores nela. Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin: all lists panel */}
      {allPanelOpen && (
        <AllListsPanel
          lists={allLists}
          onClose={() => setAllPanelOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────── Create List Dialog ───────────── */

function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📋');
  const [saving, setSaving] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset on close
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) { setName(''); setEmoji('📋'); }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const result = await createList({ name: name.trim(), emoji });
    setSaving(false);
    if (result.success && result.data) {
      toast.success('Lista criada');
      onCreated(result.data.id);
    } else {
      toast.error(result.error ?? 'Erro ao criar lista');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Lista</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`h-9 w-9 rounded-md text-lg flex items-center justify-center transition-colors ${
                    emoji === e ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-accent'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label htmlFor="list-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome</label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Extremos rápidos Sub-14"
              maxLength={50}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="w-full"
          >
            {saving ? 'A criar...' : 'Criar Lista'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Rename List Dialog ───────────── */

function RenameListDialog({
  list,
  onOpenChange,
  onRenamed,
}: {
  list: PlayerList | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(list?.name ?? '');
  const [emoji, setEmoji] = useState(list?.emoji ?? '📋');
  const [saving, setSaving] = useState(false);
  const [prevId, setPrevId] = useState<number | null>(null);

  // Sync state when target changes
  if (list && list.id !== prevId) {
    setPrevId(list.id);
    setName(list.name);
    setEmoji(list.emoji);
  }

  async function handleRename() {
    if (!list || !name.trim()) return;
    setSaving(true);
    const result = await renameList({ listId: list.id, name: name.trim(), emoji });
    setSaving(false);
    if (result.success) {
      toast.success('Lista renomeada');
      onRenamed();
    } else {
      toast.error(result.error ?? 'Erro ao renomear');
    }
  }

  return (
    <Dialog open={!!list} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Renomear Lista</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`h-9 w-9 rounded-md text-lg flex items-center justify-center transition-colors ${
                    emoji === e ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-accent'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rename-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome</label>
            <Input
              id="rename-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            />
          </div>
          <Button
            onClick={handleRename}
            disabled={!name.trim() || saving}
            className="w-full"
          >
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Admin: All Lists Panel (secret) ───────────── */

function AllListsPanel({
  lists,
  onClose,
}: {
  lists: PlayerList[];
  onClose: () => void;
}) {
  /* Group by owner */
  const owners = useMemo(() => {
    const map = new Map<string, { name: string; lists: PlayerList[] }>();
    for (const l of lists) {
      const key = l.userId;
      const existing = map.get(key);
      if (existing) {
        existing.lists.push(l);
      } else {
        map.set(key, { name: l.ownerName ?? '—', lists: [l] });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, [lists]);

  const [selectedOwner, setSelectedOwner] = useState('');

  const selectedLists = useMemo(() => {
    if (!selectedOwner) return [];
    return owners.find((o) => o.name === selectedOwner)?.lists ?? [];
  }, [owners, selectedOwner]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 transition-opacity" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Todas as Listas</h2>
            <p className="text-xs text-muted-foreground">{owners.length} utilizadores · {lists.length} listas</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* User selector */}
        <div className="border-b px-5 py-3">
          <Select value={selectedOwner} onValueChange={setSelectedOwner}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecionar utilizador…" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.name} value={o.name}>
                  {o.name} ({o.lists.length} {o.lists.length === 1 ? 'lista' : 'listas'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedOwner ? (
            <p className="text-center text-sm text-muted-foreground py-12">Seleciona um utilizador</p>
          ) : selectedLists.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Sem listas</p>
          ) : (
            <div className="space-y-2">
              {selectedLists.map((l) => (
                <Link
                  key={l.id}
                  href={`/listas/${l.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <span className="text-xl">{l.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.itemCount} {l.itemCount === 1 ? 'jogador' : 'jogadores'}
                    </p>
                  </div>
                  {l.isSystem && (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Sistema
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

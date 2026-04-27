// src/app/listas/ListsPageClient.tsx
// Client component for the lists index page — grid of list cards + create/rename/delete
// Shows user's lists as cards with item count, emoji, last addition date
// RELEVANT FILES: src/app/listas/page.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

'use client';

import { useState, useMemo } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Users, X, ChevronRight, Share2, UserCheck } from 'lucide-react';
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

// App status palette (matches pipeline + department_opinion colors in CLAUDE.md).
// Full Tailwind class strings so the JIT scanner picks them up — do NOT build dynamically.
const LIST_PALETTE = [
  'bg-emerald-100 ring-emerald-300 dark:bg-emerald-950/60 dark:ring-emerald-800',
  'bg-blue-100 ring-blue-300 dark:bg-blue-950/60 dark:ring-blue-800',
  'bg-yellow-100 ring-yellow-300 dark:bg-yellow-950/60 dark:ring-yellow-800',
  'bg-orange-100 ring-orange-300 dark:bg-orange-950/60 dark:ring-orange-800',
  'bg-red-100 ring-red-300 dark:bg-red-950/60 dark:ring-red-800',
  'bg-purple-100 ring-purple-300 dark:bg-purple-950/60 dark:ring-purple-800',
  'bg-cyan-100 ring-cyan-300 dark:bg-cyan-950/60 dark:ring-cyan-800',
  'bg-slate-100 ring-slate-300 dark:bg-slate-800/60 dark:ring-slate-700',
];

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

  // Stable per-list color from a string hash, picking from the app's status palette
  // (same hues used in pipeline/squads/department-opinion). Tailwind v4 keeps these
  // class strings reachable because they appear as literals here.
  function classForList(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return LIST_PALETTE[Math.abs(h) % LIST_PALETTE.length];
  }

  // "João Carlos Silva" → "João S." — keeps share pills compact on mobile
  function shortName(full: string): string {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
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

      {/* Lists — vertical, dense, fresh */}
      {myLists.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">Ainda não tens listas</p>
          <p className="text-xs text-muted-foreground mb-5">Cria a tua primeira para começar a organizar jogadores</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Criar primeira lista
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {myLists.map((list) => {
            const colorClass = classForList(`${list.id}-${list.name}`);
            return (
              <div key={list.id} className="group relative">
                <Link
                  href={`/listas/${list.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-sm"
                >
                  {/* Emoji disc — color from app status palette (hash-stable per list) */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base shadow-sm ring-1 ${colorClass}`}>
                    {list.emoji}
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[13px] font-semibold leading-tight">{list.name}</h2>
                      {list.isSystem && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                          Sistema
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {list.lastAddedAt
                        ? <>Última adição <span className="text-foreground/70">{formatRelativeDate(list.lastAddedAt)}</span></>
                        : 'Sem jogadores ainda'}
                    </div>
                    {/* Sharing indicator — only when relevant */}
                    {list.isSharedWithMe && list.ownerName ? (
                      <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900">
                        <UserCheck className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">De {list.ownerName}</span>
                      </span>
                    ) : list.sharedWith && list.sharedWith.length > 0 ? (
                      <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900">
                        <Share2 className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {list.sharedWith.length === 1
                            ? `Partilhada com ${shortName(list.sharedWith[0].userName)}`
                            : list.sharedWith.length === 2
                              ? `Partilhada com ${shortName(list.sharedWith[0].userName)} e ${shortName(list.sharedWith[1].userName)}`
                              : `Partilhada com ${list.sharedWith.length} pessoas`}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  {/* Number — right-aligned */}
                  <div className="hidden sm:flex shrink-0 flex-col items-end pr-0.5">
                    <span className="text-lg font-bold tabular-nums leading-none">
                      {list.itemCount}
                    </span>
                    <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                      {list.itemCount === 1 ? 'jogador' : 'jogadores'}
                    </span>
                  </div>
                  {/* Mobile: inline count */}
                  <span className="sm:hidden text-xs font-semibold tabular-nums text-foreground/80">
                    {list.itemCount}
                  </span>

                  {/* Chevron — subtle nav affordance, animates on hover */}
                  <ChevronRight className="hidden sm:block h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                </Link>

                {/* Actions menu — custom lists only */}
                {!list.isSystem && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-card text-muted-foreground shadow-sm ring-1 ring-border hover:bg-accent hover:text-accent-foreground"
                          aria-label="Ações"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
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
            );
          })}

          {/* Create list — same row style, dashed */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed bg-transparent px-3.5 py-2.5 text-[13px] text-muted-foreground transition-all hover:border-foreground/30 hover:bg-accent/30 hover:text-foreground"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed">
              <Plus className="h-4 w-4" />
            </div>
            <span className="font-medium">Nova lista</span>
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
  /* Group by user — each user sees their owned lists + lists shared with them.
     This mirrors what the user actually has access to in their /listas page. */
  type UserGroup = {
    userId: string;
    name: string;
    owned: PlayerList[];
    sharedIn: { list: PlayerList; ownerName: string }[];
  };

  const users = useMemo(() => {
    const map = new Map<string, UserGroup>();

    // 1) Owned lists per user
    for (const l of lists) {
      const existing = map.get(l.userId);
      if (existing) existing.owned.push(l);
      else map.set(l.userId, { userId: l.userId, name: l.ownerName ?? '—', owned: [l], sharedIn: [] });
    }

    // 2) For each share, attribute the list under the recipient too
    for (const l of lists) {
      if (!l.sharedWith) continue;
      for (const share of l.sharedWith) {
        const existing = map.get(share.userId);
        const entry = { list: l, ownerName: l.ownerName ?? '—' };
        if (existing) existing.sharedIn.push(entry);
        else map.set(share.userId, { userId: share.userId, name: share.userName, owned: [], sharedIn: [entry] });
      }
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, [lists]);

  const [selectedUserId, setSelectedUserId] = useState('');

  const selectedUser = useMemo(
    () => users.find((u) => u.userId === selectedUserId) ?? null,
    [users, selectedUserId],
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 transition-opacity" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Todas as Listas</h2>
            <p className="text-xs text-muted-foreground">{users.length} utilizadores · {lists.length} listas</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* User selector */}
        <div className="border-b px-5 py-3">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecionar utilizador…" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => {
                const total = u.owned.length + u.sharedIn.length;
                return (
                  <SelectItem key={u.userId} value={u.userId}>
                    {u.name} ({total} {total === 1 ? 'lista' : 'listas'})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedUser ? (
            <p className="text-center text-sm text-muted-foreground py-12">Seleciona um utilizador</p>
          ) : selectedUser.owned.length === 0 && selectedUser.sharedIn.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Sem listas</p>
          ) : (
            <div className="space-y-4">
              {/* Owned lists */}
              {selectedUser.owned.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Próprias ({selectedUser.owned.length})
                  </p>
                  {selectedUser.owned.map((l) => (
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
                          {l.sharedWith && l.sharedWith.length > 0 && (
                            <> · partilhada com {l.sharedWith.length}</>
                          )}
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

              {/* Lists shared with this user */}
              {selectedUser.sharedIn.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Partilhadas com ele ({selectedUser.sharedIn.length})
                  </p>
                  {selectedUser.sharedIn.map(({ list: l, ownerName }) => (
                    <Link
                      key={l.id}
                      href={`/listas/${l.id}`}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                    >
                      <span className="text-xl">{l.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {l.itemCount} {l.itemCount === 1 ? 'jogador' : 'jogadores'} · de <span className="text-foreground/70">{ownerName}</span>
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

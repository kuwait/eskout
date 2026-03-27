// src/app/listas/[id]/ListDetailClient.tsx
// Client component for list detail — shows players in a list with add/remove/note/export
// Adapted from ObservationListClient, now generic for any player list
// RELEVANT FILES: src/app/listas/[id]/page.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Search, X, Pencil, Trash2, Users, Download, LayoutGrid, ChevronLeft, ChevronRight, Loader2, Copy } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClubBadge } from '@/components/common/ClubBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import {
  addPlayerToList,
  removePlayerFromList,
  updateListItemNote,
  toggleListItemSeen,
  exportListExcel,
  searchPickerPlayers,
  getPickerClubs,
} from '@/actions/player-lists';
import { POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import { extractSearchWords, matchesPickerSearch } from '@/lib/utils/search';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { getNationalityFlag } from '@/lib/constants';
import type { DepartmentOpinion, PickerPlayer, PlayerList, PlayerListItem } from '@/lib/types';

/* ───────────── Constants ───────────── */

/** Position badge colors by group: GR=yellow, DEF=blue, MID=green, ATK=red */
const POSITION_STYLES: Record<string, { bg: string; text: string }> = {
  GR:  { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  DD:  { bg: 'bg-blue-100',   text: 'text-blue-800' },
  DE:  { bg: 'bg-blue-100',   text: 'text-blue-800' },
  DC:  { bg: 'bg-blue-100',   text: 'text-blue-800' },
  MDC: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  MC:  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  MOC: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  ED:  { bg: 'bg-red-100',    text: 'text-red-800' },
  EE:  { bg: 'bg-red-100',    text: 'text-red-800' },
  PL:  { bg: 'bg-red-100',    text: 'text-red-800' },
};
const POS_DEFAULT = { bg: 'bg-neutral-100', text: 'text-neutral-700' };

/* ───────────── Component ───────────── */

export function ListDetailClient({
  list,
  items,
  canExport,
  isOwner = true,
  currentUserId = '',
  clubMembers = [],
  shares = [],
}: {
  list: PlayerList;
  items: PlayerListItem[];
  canExport: boolean;
  isOwner?: boolean;
  currentUserId?: string;
  clubMembers?: { id: string; fullName: string }[];
  shares?: { id: number; userId: string; userName: string }[];
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<PlayerListItem | null>(null);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [localShares, setLocalShares] = useState(shares);
  const [groupByClub, setGroupByClub] = useState(false);
  // Read persisted preference after mount to avoid hydration mismatch
  useEffect(() => {
    const stored = localStorage.getItem('eskout:list-group-by-club') === '1';
    if (stored) setGroupByClub(true);
  }, []);

  /* ───────────── Grouped by club → birth year ───────────── */
  const clubGroups = useMemo(() => {
    if (!groupByClub) return null;
    const groups = new Map<string, { club: string; logoUrl: string | null; items: PlayerListItem[] }>();
    for (const item of items) {
      const club = item.playerClub || 'Sem clube';
      if (!groups.has(club)) {
        groups.set(club, { club, logoUrl: item.playerClubLogoUrl, items: [] });
      }
      groups.get(club)!.items.push(item);
    }
    // Sort groups by number of players (most first), then alphabetically
    return Array.from(groups.values()).sort((a, b) =>
      b.items.length - a.items.length || a.club.localeCompare(b.club, 'pt'),
    );
  }, [items, groupByClub]);

  /** Sub-group items within a club by birth year (descending — most recent first) */
  function groupByBirthYear(clubItems: PlayerListItem[]): { year: string; items: PlayerListItem[] }[] {
    const yearMap = new Map<string, PlayerListItem[]>();
    for (const item of clubItems) {
      const year = item.playerDob ? new Date(item.playerDob).getFullYear().toString() : 'Sem data';
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year)!.push(item);
    }
    return Array.from(yearMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, yearItems]) => ({ year, items: yearItems }));
  }

  /* ───────────── Realtime ───────────── */
  useRealtimeTable('player_list_items', { onAny: () => router.refresh() });

  /* ───────────── Actions ───────────── */

  async function handleRemove(playerId: number) {
    setProcessing(playerId);
    const result = await removePlayerFromList(list.id, playerId);
    setProcessing(null);
    if (result.success) {
      toast.success('Removido da lista');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  /* Local note overrides — shown instantly while server refreshes */
  const [localNotes, setLocalNotes] = useState<Record<number, string | null>>({});

  async function handleSaveNote(playerId: number) {
    const savedNote = noteText || null;
    setLocalNotes((prev) => ({ ...prev, [playerId]: savedNote }));
    setEditingNote(null);
    const result = await updateListItemNote(list.id, playerId, savedNote);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
      setLocalNotes((prev) => { const next = { ...prev }; delete next[playerId]; return next; });
    }
  }

  /* Optimistic seen toggles */
  const [localSeen, setLocalSeen] = useState<Record<number, boolean>>({});

  async function handleToggleSeen(playerId: number, currentlySeen: boolean) {
    const next = !currentlySeen;
    setLocalSeen((prev) => ({ ...prev, [playerId]: next }));
    const result = await toggleListItemSeen(list.id, playerId, next);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
      setLocalSeen((prev) => { const n = { ...prev }; delete n[playerId]; return n; });
    }
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportListExcel(list.id);
    setExporting(false);
    if (!result.success) { toast.error(result.error); return; }
    const blob = new Blob(
      [Uint8Array.from(atob(result.data!), (c) => c.charCodeAt(0))],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exportado com sucesso');
  }

  function startEditNote(item: PlayerListItem) {
    setEditingNote(item.playerId);
    const current = localNotes[item.playerId] !== undefined ? localNotes[item.playerId] : item.note;
    setNoteText(current ?? '');
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  /* Flat view sorted by club then name */
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.playerClub.localeCompare(b.playerClub, 'pt') || a.playerName.localeCompare(b.playerName, 'pt')),
    [items],
  );

  /* Set of player IDs already in this list (for the add dialog) */
  const existingIds = useMemo(() => new Set(items.map((i) => i.playerId)), [items]);

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/listas"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Voltar às listas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold lg:text-2xl flex items-center gap-2">
              <span>{list.emoji}</span>
              {list.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {items.length} {items.length === 1 ? 'jogador' : 'jogadores'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Group by club toggle */}
          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setGroupByClub((v) => { const next = !v; localStorage.setItem('eskout:list-group-by-club', next ? '1' : '0'); return next; })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                groupByClub
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-neutral-200 text-muted-foreground hover:border-neutral-300 hover:text-neutral-600',
              )}
              title={groupByClub ? 'Desagrupar' : 'Agrupar por clube'}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Por clube</span>
            </button>
          )}
          {/* Export — admin/editor only */}
          {canExport && items.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-neutral-600 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar
            </button>
          )}
          {/* Clear all */}
          {isOwner && items.length > 0 && (
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          )}
          {/* Duplicate */}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setDuplicateConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-neutral-600"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Duplicar</span>
            </button>
          )}
          {/* Share — owner only, not system lists */}
          {isOwner && !list.isSystem && (
            <button
              type="button"
              onClick={() => setShareDialogOpen(true)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                localShares.length > 0
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-neutral-200 text-muted-foreground hover:border-neutral-300 hover:text-neutral-600',
              )}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Partilhar</span>
              {localShares.length > 0 && (
                <span className="rounded-full bg-blue-200 px-1.5 py-px text-[10px] font-bold text-blue-800">
                  {localShares.length}
                </span>
              )}
            </button>
          )}
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {/* Shared list banner */}
        {list.isSharedWithMe && list.ownerName && (
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span>Lista de <strong>{list.ownerName}</strong> · partilhada contigo</span>
            <button
              type="button"
              onClick={async () => {
                const { unshareList } = await import('@/actions/player-lists');
                const result = await unshareList(list.id, currentUserId);
                if (result.success) router.push('/listas');
              }}
              className="font-medium hover:text-blue-900"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">Lista vazia</p>
          <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar jogador
          </Button>
        </div>
      )}

      {/* Items — flat list (compact rows with club), sorted by club then name */}
      {items.length > 0 && !clubGroups && (
        <div className="space-y-1">
          {sortedItems.map((item) => (
            <PlayerListRow
              key={item.id}
              item={item}
              processing={processing}
              editingNote={editingNote}
              noteText={noteText}
              onEditNote={startEditNote}
              onCancelEdit={() => setEditingNote(null)}
              onSaveNote={handleSaveNote}
              onNoteChange={setNoteText}
              onRemove={setRemoveConfirm}
              formatDate={formatDate}
              localNote={localNotes[item.playerId]}
              isSeen={localSeen[item.playerId] ?? !!item.seenAt}
              onToggleSeen={handleToggleSeen}
              showClub
            />
          ))}
        </div>
      )}

      {/* Grouped by club — 1 club per column, rows inside */}
      {items.length > 0 && clubGroups && (
        <div className="gap-3" style={{ columns: '320px' }}>
          {clubGroups.map((group) => {
            const yearGroups = groupByBirthYear(group.items);
            const hasMultipleYears = yearGroups.length > 1;
            return (
              <div key={group.club} className="rounded-lg border bg-card break-inside-avoid mb-3">
                {/* Club header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                  <ClubBadge club={group.club} logoUrl={group.logoUrl} size="sm" className="text-sm font-semibold" />
                  <span className="text-xs text-muted-foreground">
                    ({group.items.length})
                  </span>
                </div>
                {/* Players — sub-grouped by birth year */}
                <div className="p-1.5">
                  {yearGroups.map(({ year, items: yearItems }, yi) => (
                    <div key={year}>
                      {hasMultipleYears && (
                        <p className={cn('text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 pb-0.5', yi > 0 && 'pt-2')}>
                          {year}
                        </p>
                      )}
                      <div className="space-y-0.5">
                        {yearItems.map((item) => (
                          <PlayerListRow
                            key={item.id}
                            item={item}
                            processing={processing}
                            editingNote={editingNote}
                            noteText={noteText}
                            onEditNote={startEditNote}
                            onCancelEdit={() => setEditingNote(null)}
                            onSaveNote={handleSaveNote}
                            onNoteChange={setNoteText}
                            onRemove={setRemoveConfirm}
                            formatDate={formatDate}
                            localNote={localNotes[item.playerId]}
                            isSeen={localSeen[item.playerId] ?? !!item.seenAt}
                            onToggleSeen={handleToggleSeen}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add player dialog */}
      <AddPlayerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        existingIds={existingIds}
        onAdd={async (playerId) => {
          const result = await addPlayerToList(list.id, playerId);
          if (result.success) {
            toast.success('Adicionado à lista');
            router.refresh();
          } else {
            toast.error(result.error);
          }
        }}
      />

      {/* Share dialog — owner only */}
      {isOwner && !list.isSystem && (
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Partilhar Lista
              </DialogTitle>
            </DialogHeader>

            {/* Current shares */}
            {localShares.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Partilhada com</p>
                {localShares.map((share) => (
                  <div key={share.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm font-medium">{share.userName}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const { unshareList } = await import('@/actions/player-lists');
                        const result = await unshareList(list.id, share.userId);
                        if (result.success) {
                          setLocalShares((prev) => prev.filter((s) => s.id !== share.id));
                          toast.success('Partilha removida');
                        } else {
                          toast.error(result.error ?? 'Erro');
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new share */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Adicionar pessoa</p>
              <div className="space-y-1">
                {clubMembers
                  .filter((m) => m.id !== currentUserId && !localShares.some((s) => s.userId === m.id))
                  .map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={async () => {
                        const { shareList } = await import('@/actions/player-lists');
                        const result = await shareList(list.id, member.id);
                        if (result.success) {
                          setLocalShares((prev) => [...prev, { id: Date.now(), userId: member.id, userName: member.fullName }]);
                          toast.success(`Partilhada com ${member.fullName}`);
                        } else {
                          toast.error(result.error ?? 'Erro');
                        }
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-50"
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      {member.fullName}
                    </button>
                  ))}
                {clubMembers.filter((m) => m.id !== currentUserId && !localShares.some((s) => s.userId === m.id)).length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">Todos os membros já têm acesso</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Clear list confirmation */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais remover todos os <strong>{items.length} jogadores</strong> da lista <strong>{list.name}</strong>. A lista fica vazia mas não é apagada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { clearList } = await import('@/actions/player-lists');
                const result = await clearList(list.id);
                if (result.success) {
                  toast.success('Lista limpa');
                  router.refresh();
                } else {
                  toast.error(result.error ?? 'Erro');
                }
                setClearConfirm(false);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate confirmation */}
      <AlertDialog open={duplicateConfirm} onOpenChange={setDuplicateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicar lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Será criada uma cópia de &quot;{list.name}&quot; com os mesmos {items.length} jogador{items.length !== 1 ? 'es' : ''}. A nova lista será independente — alterações numa não afetam a outra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const { duplicateList } = await import('@/actions/player-lists');
                const result = await duplicateList(list.id);
                if (result.success && result.data) {
                  toast.success('Lista duplicada');
                  router.push(`/listas/${result.data.id}`);
                } else {
                  toast.error(result.error ?? 'Erro ao duplicar');
                }
                setDuplicateConfirm(false);
              }}
            >
              Duplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => { if (!open) setRemoveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais remover <strong>{removeConfirm?.playerName}</strong> da lista <strong>{list.name}</strong>. Podes voltar a adicionar mais tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (removeConfirm) handleRemove(removeConfirm.playerId); setRemoveConfirm(null); }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Player Row (compact — used in flat + grouped views) ───────────── */

/** Shared props for row component */
interface PlayerCardProps {
  item: PlayerListItem;
  processing: number | null;
  editingNote: number | null;
  noteText: string;
  localNote?: string | null;
  isSeen: boolean;
  onToggleSeen: (playerId: number, currentlySeen: boolean) => void;
  onEditNote: (item: PlayerListItem) => void;
  onCancelEdit: () => void;
  onSaveNote: (playerId: number) => void;
  onNoteChange: (text: string) => void;
  onRemove: (item: PlayerListItem) => void;
  formatDate: (iso: string) => string;
}

/** Compact row — used in both flat list and club-grouped view */
function PlayerListRow(props: PlayerCardProps & { showClub?: boolean }) {
  const { item, processing, editingNote, noteText, localNote, isSeen, onToggleSeen, onEditNote, onCancelEdit, onSaveNote, onNoteChange, onRemove, showClub } = props;
  const displayNote = localNote !== undefined ? localNote : item.note;

  /* Show first + last name only (e.g. "Carlos Silva" from "Carlos Rafael Peres Conceição Da Silva") */
  const shortName = (() => {
    const parts = item.playerName.trim().split(/\s+/);
    if (parts.length <= 2) return item.playerName;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  })();

  return (
    <div className={showClub ? 'rounded-lg bg-muted/30' : ''}>
      <div className={cn('group/row flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/40', isSeen && 'opacity-50')}>
        {/* Seen checkbox */}
        <button
          type="button"
          onClick={() => onToggleSeen(item.playerId, isSeen)}
          className={cn(
            'shrink-0 h-4 w-4 rounded border transition-colors flex items-center justify-center',
            isSeen
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground/30 hover:border-muted-foreground/60',
          )}
          title={isSeen ? 'Marcar como não visto' : 'Marcar como visto'}
        >
          {isSeen && <span className="text-[10px] leading-none">✓</span>}
        </button>
        {/* Photo — small circle */}
        <Link href={`/jogadores/${item.playerId}`} className="shrink-0">
          <div className="h-8 w-8 rounded-full bg-neutral-100 overflow-hidden flex items-center justify-center">
            {item.playerPhotoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.playerPhotoUrl}
                alt=""
                className="h-8 w-8 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
              />
            ) : null}
            <Users className={`h-3.5 w-3.5 text-neutral-300 ${item.playerPhotoUrl ? 'hidden' : ''}`} />
          </div>
        </Link>
        {/* Name + position + club + actions — all inline */}
        <Link href={`/jogadores/${item.playerId}`} className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-0.5 min-w-0">
            {item.playerNationality && (
              <span className="text-xs shrink-0">{getNationalityFlag(item.playerNationality)}</span>
            )}
            <span className="text-[13px] font-medium whitespace-nowrap">{shortName}</span>
          </span>
          {item.playerPosition && (() => {
            const s = POSITION_STYLES[item.playerPosition] ?? POS_DEFAULT;
            return (
              <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none ${s.bg} ${s.text}`}>
                {item.playerPosition}
              </span>
            );
          })()}
          {showClub && (
            <span className="hidden sm:inline text-[11px] text-muted-foreground/50 whitespace-nowrap">· {item.playerClub}</span>
          )}
        </Link>
        {/* Actions — right after content */}
        <div className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => editingNote === item.playerId ? onCancelEdit() : onEditNote(item)}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100"
            title={displayNote ? 'Editar nota' : 'Adicionar nota'}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item)}
            disabled={processing === item.playerId}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
            title="Remover da lista"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {/* Inline note — click to edit */}
      {displayNote && editingNote !== item.playerId && (
        <button
          type="button"
          onClick={() => onEditNote(item)}
          className="w-full text-left pl-12 pr-2 -mt-0.5 group/note"
        >
          <p className="text-[11px] text-muted-foreground/50 italic group-hover/note:text-foreground transition-colors">{displayNote}</p>
        </button>
      )}
      {/* Note editor */}
      {editingNote === item.playerId && (
        <div className="pl-12 pr-2 pb-1.5">
          <Textarea
            value={noteText}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Nota pessoal..."
            className="min-h-[52px] resize-none text-xs border-none bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring/30"
            autoFocus
            rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSaveNote(item.playerId); } if (e.key === 'Escape') onCancelEdit(); }}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/40">⌘+Enter · Esc</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button size="sm" className="h-5 text-[10px] px-1.5" onClick={() => onSaveNote(item.playerId)}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Add Player Dialog (server-side filters + client-side fuzzy search) ───────────── */

interface Filters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
}

const EMPTY_FILTERS: Filters = { search: '', position: '', club: '', opinion: '', foot: '' };
const PAGE_SIZE = 20;

function AddPlayerDialog({
  open,
  onOpenChange,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: Set<number>;
  onAdd: (playerId: number) => Promise<void>;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [adding, setAdding] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // Server-fetched pool of players matching structural filters
  const [pool, setPool] = useState<PickerPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  // Distinct clubs for the filter dropdown
  const [clubs, setClubs] = useState<string[]>([]);

  /* Debounce search input */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  /* Reset page when any filter changes */
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on filter change
  useEffect(() => { setPage(0); }, [debouncedSearch, filters.position, filters.club, filters.opinion, filters.foot]);

  /* Reset state when dialog closes */
  /* eslint-disable react-hooks/set-state-in-effect -- reset form when dialog closes */
  useEffect(() => {
    if (!open) { setFilters(EMPTY_FILTERS); setDebouncedSearch(''); setPage(0); setPool([]); }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Fetch distinct clubs when dialog opens */
  useEffect(() => {
    if (!open) return;
    getPickerClubs().then(setClubs);
  }, [open]);

  /* Fetch players with server-side text search + structural filters */
  /* Only fetch when there's a search term or structural filter — don't load all 15k+ on open */
  const hasAnyFilter = debouncedSearch || filters.position || filters.club || filters.opinion || filters.foot;
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pool when filters cleared (no async, just clearing)
    if (!hasAnyFilter) { setPool([]); return; }
    setLoading(true);
    const excludeArray = Array.from(existingIds);
    searchPickerPlayers({
      search: debouncedSearch || undefined,
      position: filters.position || undefined,
      club: filters.club || undefined,
      opinion: filters.opinion || undefined,
      foot: filters.foot || undefined,
      excludeIds: excludeArray.length > 0 ? excludeArray : undefined,
    }).then((players) => {
      setPool(players);
      setLoading(false);
    });
  }, [open, hasAnyFilter, debouncedSearch, existingIds, filters.position, filters.club, filters.opinion, filters.foot]);

  /* Server-side search — just use pool directly */
  // Client-side cross-field + accent-insensitive refinement
  const searchWords = extractSearchWords(filters.search);
  const filtered = searchWords.length > 1
    ? pool.filter((p) => matchesPickerSearch({ name: p.name, club: p.club }, searchWords))
    : pool;

  /* Client-side pagination */
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageResults = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot;

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAdd(playerId: number) {
    setAdding(playerId);
    await onAdd(playerId);
    setAdding(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar à lista</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar jogador, clube, posição..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="h-10 rounded-xl border-transparent bg-muted/50 pl-10 pr-9 shadow-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/20"
            autoFocus
          />
          {filters.search && (
            <button type="button" onClick={() => updateFilter('search', '')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label="Limpar pesquisa">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5">
          <Select value={filters.position || 'all'} onValueChange={(v) => updateFilter('position', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Posição" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Posição</SelectItem>
              {POSITIONS.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.code} — {p.labelPt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.club || 'all'} onValueChange={(v) => updateFilter('club', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Clube" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Clube</SelectItem>
              {clubs.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.foot || 'all'} onValueChange={(v) => updateFilter('foot', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Pé" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Pé</SelectItem>
              {FOOT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>

        {/* Results count + pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                A procurar…
              </span>
            ) : (
              <>
                {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                {totalPages > 1 && ` · Página ${page + 1} de ${totalPages}`}
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {!loading && pageResults.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {pageResults.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-2 rounded-md border p-2 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{player.name}</p>
                  <OpinionBadge opinion={(player.departmentOpinion[0] as DepartmentOpinion) ?? null} className="shrink-0" />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {player.club}
                  {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                  {player.foot ? ` · ${player.foot}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={adding === player.id}
                onClick={() => handleAdd(player.id)}
              >
                {adding === player.id ? '...' : 'Adicionar'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

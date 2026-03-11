// src/app/a-observar/ObservationListClient.tsx
// Client component for personal observation shortlist
// Shows bookmarked players, add/remove, optional note, admin sees all lists
// RELEVANT FILES: src/app/a-observar/page.tsx, src/actions/observation-list.ts

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye, Plus, Search, X, Pencil, Trash2, Users, Download } from 'lucide-react';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ClubBadge } from '@/components/common/ClubBadge';
import {
  addToObservationList,
  removeFromObservationList,
  updateObservationNote,
  exportObservationListExcel,
  type ObservationEntry,
} from '@/actions/observation-list';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { createClient } from '@/lib/supabase/client';
import { getNationalityFlag } from '@/lib/constants';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/* ───────────── Constants ───────────── */

const POSITION_LABELS: Record<string, string> = {
  GR: 'GR', DD: 'DD', DE: 'DE', DC: 'DC', MDC: 'MDC',
  MC: 'MC', MOC: 'MOC', ED: 'ED', EE: 'EE', PL: 'PL',
};

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

export function ObservationListClient({
  myList,
  allLists,
  isAdmin,
  canExport,
}: {
  myList: ObservationEntry[];
  allLists: ObservationEntry[];
  isAdmin: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<ObservationEntry | null>(null);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* ───────────── Realtime ───────────── */
  useRealtimeTable('user_observation_list', { onAny: () => router.refresh() });

  /* ───────────── Actions ───────────── */

  async function handleRemove(playerId: number) {
    setProcessing(playerId);
    const result = await removeFromObservationList(playerId);
    setProcessing(null);
    if (result.success) {
      toast.success('Removido da lista');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleSaveNote(playerId: number) {
    const result = await updateObservationNote(playerId, noteText || null);
    setEditingNote(null);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportObservationListExcel();
    setExporting(false);
    if (!result.success) { toast.error(result.error); return; }
    const blob = new Blob([Uint8Array.from(atob(result.data!), (c) => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `A-Observar-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exportado com sucesso');
  }

  function startEditNote(entry: ObservationEntry) {
    setEditingNote(entry.playerId);
    setNoteText(entry.note ?? '');
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

  /* Set of player IDs already in the user's list (for the add dialog) */
  const observedIds = useMemo(() => new Set(myList.map((e) => e.playerId)), [myList]);


  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold lg:text-2xl">A Observar</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{myList.length} {myList.length === 1 ? 'jogador' : 'jogadores'}</p>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Export — admin/editor only */}
          {canExport && myList.length > 0 && (
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
          {/* Admin: secret "view all" toggle */}
          {isAdmin && allLists.length > 0 && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-neutral-300 hover:text-neutral-600"
            >
              <Users className="h-3.5 w-3.5" />
              Todas
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {myList.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center">
          <Eye className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Ainda não adicionaste jogadores à lista</p>
          <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar jogador
          </Button>
        </div>
      )}

      {/* Observation list */}
      {myList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {myList.map((entry) => (
            <div key={entry.id}>
            <div className="relative rounded-lg border bg-white transition-colors hover:bg-neutral-50">
              {/* Action icons — top right */}
              <div className="absolute top-2 right-2 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => editingNote === entry.playerId ? setEditingNote(null) : startEditNote(entry)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100"
                  title={entry.note ? 'Editar nota' : 'Adicionar nota'}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveConfirm(entry)}
                  disabled={processing === entry.playerId}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                  title="Remover da lista"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Link href={`/jogadores/${entry.playerId}`} className="flex gap-3 p-3 pr-20">
                {/* Player photo */}
                <div className="shrink-0 h-14 w-14 rounded-lg bg-neutral-100 overflow-hidden flex items-center justify-center">
                  {entry.playerPhotoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={entry.playerPhotoUrl}
                      alt=""
                      className="h-14 w-14 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                    />
                  ) : null}
                  <Users className={`h-6 w-6 text-neutral-300 ${entry.playerPhotoUrl ? 'hidden' : ''}`} />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 min-w-0">
                      {entry.playerNationality && (
                        <span className="text-sm shrink-0">{getNationalityFlag(entry.playerNationality)}</span>
                      )}
                      <p className="text-sm font-medium truncate">{entry.playerName}</p>
                    </span>
                    {entry.playerPosition && (() => {
                      const s = POSITION_STYLES[entry.playerPosition] ?? POS_DEFAULT;
                      return (
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${s.bg} ${s.text}`}>
                          {POSITION_LABELS[entry.playerPosition] ?? entry.playerPosition}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ClubBadge club={entry.playerClub} logoUrl={entry.playerClubLogoUrl} size="sm" className="text-muted-foreground text-xs" />
                  </div>
                  {entry.playerDob && (
                    <span className="text-[11px] text-muted-foreground mt-0.5 block">Nasc. {formatDate(entry.playerDob)}</span>
                  )}
                </div>
              </Link>
              {/* Inline note display */}
              {entry.note && editingNote !== entry.playerId && (
                <div className="px-3 pb-1.5 -mt-1">
                  <p className="text-xs text-muted-foreground italic pl-0.5">{entry.note}</p>
                </div>
              )}
              {/* Note editor */}
              {editingNote === entry.playerId && (
                <div className="flex items-center gap-2 px-3 pb-3">
                  <Input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Nota pessoal..."
                    className="h-8 text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(entry.playerId); if (e.key === 'Escape') setEditingNote(null); }}
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={() => handleSaveNote(entry.playerId)}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingNote(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-1 text-right text-[10px] text-muted-foreground/50 pr-1">Adicionado {formatDate(entry.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add player dialog */}
      <AddPlayerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        observedIds={observedIds}
        onAdd={async (playerId, note) => {
          const result = await addToObservationList(playerId, note);
          if (result.success) {
            toast.success('Adicionado à lista');
            router.refresh();
          } else {
            toast.error(result.error);
          }
        }}
      />

      {/* Admin: all lists panel */}
      {panelOpen && (
        <AllListsPanel
          entries={allLists}
          formatDate={formatDate}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!removeConfirm} onOpenChange={(open) => { if (!open) setRemoveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Vais remover <strong>{removeConfirm?.playerName}</strong> da tua lista pessoal de observação. Podes voltar a adicionar mais tarde.
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

/* ───────────── Add Player Dialog ───────────── */

function AddPlayerDialog({
  open,
  onOpenChange,
  observedIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  observedIds: Set<number>;
  onAdd: (playerId: number, note?: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; club: string; position: string | null; clubLogoUrl: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset state when dialog closes
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setSearch('');
      setResults([]);
    }
  }

  // Debounced search
  const doSearch = useCallback(async (query: string) => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('players')
      .select('id, name, club, position_normalized, club_logo_url')
      .ilike('name', `%${query}%`)
      .order('name')
      .limit(20);
    setResults((data ?? []).map((p: { id: number; name: string; club: string | null; position_normalized: string | null; club_logo_url: string | null }) => ({
      id: p.id,
      name: p.name,
      club: p.club ?? '',
      position: p.position_normalized,
      clubLogoUrl: p.club_logo_url,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, open, doSearch]);

  async function handleAdd(playerId: number) {
    setAdding(playerId);
    await onAdd(playerId);
    setAdding(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar à lista</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar jogador..."
            className="pl-10"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum resultado</p>
          )}
          {!loading && results.map((p) => {
            const alreadyAdded = observedIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={alreadyAdded || adding === p.id}
                onClick={() => handleAdd(p.id)}
                className={`flex items-center gap-3 w-full rounded-md px-3 py-2 text-left transition-colors ${
                  alreadyAdded ? 'opacity-50 cursor-default' : 'hover:bg-neutral-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.position && (
                      <span className="shrink-0 rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium">{p.position}</span>
                    )}
                  </div>
                  <ClubBadge club={p.club} logoUrl={p.clubLogoUrl} size="xs" className="text-muted-foreground mt-0.5" />
                </div>
                {alreadyAdded && (
                  <Eye className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Admin: All Lists Panel (secret) ───────────── */

function AllListsPanel({
  entries,
  formatDate,
  onClose,
}: {
  entries: ObservationEntry[];
  formatDate: (iso: string) => string;
  onClose: () => void;
}) {
  /* Build sorted list of unique users from entries */
  const users = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const e of entries) {
      const id = e.ownerId ?? 'unknown';
      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, { id, name: e.ownerName ?? '—', count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, [entries]);

  const [selectedUserId, setSelectedUserId] = useState<string>('');

  /* Filter entries for selected user */
  const filteredEntries = useMemo(() => {
    if (!selectedUserId) return [];
    return entries.filter((e) => (e.ownerId ?? 'unknown') === selectedUserId);
  }, [entries, selectedUserId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 transition-opacity" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Listas de Observação</h2>
            <p className="text-xs text-muted-foreground">{users.length} utilizadores · {entries.length} entradas</p>
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
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedUserId ? (
            <p className="text-center text-sm text-muted-foreground py-12">Seleciona um utilizador para ver a lista</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Nenhuma entrada</p>
          ) : (
            <div className="rounded-lg overflow-hidden">
              {filteredEntries.map((e, idx) => (
                <Link
                  key={e.id}
                  href={`/jogadores/${e.playerId}`}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors hover:bg-accent',
                    idx % 2 === 0 ? 'bg-muted/50' : '',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{e.playerName}</p>
                      {e.playerPosition && (
                        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{e.playerPosition}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.playerClub}{e.playerDob ? ` · Nasc. ${formatDate(e.playerDob)}` : ''}
                    </p>
                    {e.note && (
                      <p className="text-[11px] text-muted-foreground/70 italic truncate mt-0.5">{e.note}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// src/app/listas/[id]/ListDetailClient.tsx
// Client component for list detail — shows players in a list with add/remove/note/export
// Adapted from ObservationListClient, now generic for any player list
// RELEVANT FILES: src/app/listas/[id]/page.tsx, src/actions/player-lists.ts, src/lib/types/index.ts

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Search, X, Pencil, Trash2, Users, Download } from 'lucide-react';
import Link from 'next/link';
import { fuzzyMatch } from '@/lib/utils';
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
import { OpinionBadge } from '@/components/common/OpinionBadge';
import {
  addPlayerToList,
  removePlayerFromList,
  updateListItemNote,
  exportListExcel,
} from '@/actions/player-lists';
import { POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
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
  allPlayers,
  canExport,
}: {
  list: PlayerList;
  items: PlayerListItem[];
  allPlayers: PickerPlayer[];
  canExport: boolean;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<PlayerListItem | null>(null);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [exporting, setExporting] = useState(false);

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

  async function handleSaveNote(playerId: number) {
    const result = await updateListItemNote(list.id, playerId, noteText || null);
    setEditingNote(null);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
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
    setNoteText(item.note ?? '');
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }

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
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>
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

      {/* Items grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((item) => (
            <div key={item.id}>
              <div className="relative rounded-lg border bg-card transition-colors hover:bg-accent/30">
                {/* Action icons — top right */}
                <div className="absolute top-2 right-2 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => editingNote === item.playerId ? setEditingNote(null) : startEditNote(item)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100"
                    title={item.note ? 'Editar nota' : 'Adicionar nota'}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirm(item)}
                    disabled={processing === item.playerId}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-neutral-300 transition-colors hover:text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                    title="Remover da lista"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Link href={`/jogadores/${item.playerId}`} className="flex gap-3 p-3 pr-20">
                  {/* Player photo */}
                  <div className="shrink-0 h-14 w-14 rounded-lg bg-neutral-100 overflow-hidden flex items-center justify-center">
                    {item.playerPhotoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.playerPhotoUrl}
                        alt=""
                        className="h-14 w-14 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                      />
                    ) : null}
                    <Users className={`h-6 w-6 text-neutral-300 ${item.playerPhotoUrl ? 'hidden' : ''}`} />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5 min-w-0">
                        {item.playerNationality && (
                          <span className="text-sm shrink-0">{getNationalityFlag(item.playerNationality)}</span>
                        )}
                        <p className="text-sm font-medium truncate">{item.playerName}</p>
                      </span>
                      {item.playerPosition && (() => {
                        const s = POSITION_STYLES[item.playerPosition] ?? POS_DEFAULT;
                        return (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${s.bg} ${s.text}`}>
                            {item.playerPosition}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ClubBadge club={item.playerClub} logoUrl={item.playerClubLogoUrl} size="sm" className="text-muted-foreground text-xs" />
                    </div>
                    {item.playerDob && (
                      <span className="text-[11px] text-muted-foreground mt-0.5 block">Nasc. {formatDate(item.playerDob)}</span>
                    )}
                  </div>
                </Link>
                {/* Inline note display */}
                {item.note && editingNote !== item.playerId && (
                  <div className="px-3 pb-1.5 -mt-1">
                    <p className="text-xs text-muted-foreground italic pl-0.5">{item.note}</p>
                  </div>
                )}
                {/* Note editor */}
                {editingNote === item.playerId && (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <Input
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Nota pessoal..."
                      className="h-8 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(item.playerId); if (e.key === 'Escape') setEditingNote(null); }}
                    />
                    <Button size="sm" className="h-8 text-xs" onClick={() => handleSaveNote(item.playerId)}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingNote(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-right text-[10px] text-muted-foreground/50 pr-1">
                Adicionado {formatDate(item.addedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Add player dialog */}
      <AddPlayerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        allPlayers={allPlayers}
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

/* ───────────── Add Player Dialog (same pattern as AddToSquadDialog) ───────────── */

interface Filters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
  year: string;
}

const EMPTY_FILTERS: Filters = { search: '', position: '', club: '', opinion: '', foot: '', year: '' };

function AddPlayerDialog({
  open,
  onOpenChange,
  allPlayers,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allPlayers: PickerPlayer[];
  existingIds: Set<number>;
  onAdd: (playerId: number) => Promise<void>;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [adding, setAdding] = useState<number | null>(null);

  /* Reset filters when dialog opens */
  /* eslint-disable react-hooks/set-state-in-effect -- resets filter form when dialog opens */
  useEffect(() => {
    if (open) {
      setFilters(EMPTY_FILTERS);
      setDebouncedSearch('');
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Debounce search */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  /* Exclude players already in this list */
  const available = useMemo(
    () => allPlayers.filter((p) => !existingIds.has(p.id)),
    [allPlayers, existingIds],
  );

  /* Derive unique clubs and years for filters */
  const clubs = useMemo(() => {
    const set = new Set(available.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [available]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of available) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [available]);

  /* Filter + fuzzy search (same pattern as AddToSquadDialog) */
  const filtered = useMemo(() => {
    let result = available;

    if (debouncedSearch) {
      result = result.filter((p) => {
        const pLabel = POSITIONS.find((pos) => pos.code === p.positionNormalized)?.labelPt ?? '';
        return fuzzyMatch(`${p.name} ${p.club} ${p.positionNormalized} ${pLabel}`, debouncedSearch);
      });
    }
    if (filters.position) {
      result = result.filter((p) =>
        p.positionNormalized === filters.position ||
        p.secondaryPosition === filters.position ||
        p.tertiaryPosition === filters.position
      );
    }
    if (filters.club) result = result.filter((p) => p.club === filters.club);
    if (filters.opinion) result = result.filter((p) => p.departmentOpinion.includes(filters.opinion));
    if (filters.foot) result = result.filter((p) => p.foot === filters.foot);
    if (filters.year) {
      const yr = parseInt(filters.year, 10);
      result = result.filter((p) => p.dob && new Date(p.dob).getFullYear() === yr);
    }
    return result.slice(0, 50);
  }, [available, debouncedSearch, filters]);

  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot || filters.year;

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

          <Select value={filters.opinion || 'all'} onValueChange={(v) => updateFilter('opinion', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Opinião" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Opinião</SelectItem>
              {DEPARTMENT_OPINIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
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

          <Select value={filters.year || 'all'} onValueChange={(v) => updateFilter('year', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ano</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </p>

        {/* Player list */}
        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum jogador encontrado.
            </p>
          )}
          {filtered.map((player) => (
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

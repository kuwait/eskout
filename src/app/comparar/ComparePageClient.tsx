// src/app/comparar/ComparePageClient.tsx
// Client component for player comparison — side-by-side columns (desktop) or swipeable cards (mobile)
// Shows key data sections for 2-3 players with highlighted differences
// RELEVANT FILES: src/app/comparar/page.tsx, src/components/common/OpinionBadge.tsx, src/components/common/ClubBadge.tsx

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, X, Users, Search, Bookmark, Trash2, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fuzzyMatch } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClubBadge } from '@/components/common/ClubBadge';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { MiniPitch } from '@/components/common/MiniPitch';
import { getNationalityFlag, getPositionLabel, POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import { saveComparison, deleteComparison } from '@/actions/comparisons';
import { toast } from 'sonner';
import type { CompareBundle } from './page';
import type { DepartmentOpinion, PickerPlayer, Player, PositionCode, SavedComparison } from '@/lib/types';

/* ───────────── Constants ───────────── */

const MAX_PLAYERS = 3;
const MAX_SAVED_COMPARISONS = 10;

/** Rating color: green > yellow > red */
function ratingColor(rating: number | null): string {
  if (rating === null) return 'text-muted-foreground';
  if (rating >= 4) return 'text-green-600';
  if (rating >= 3) return 'text-yellow-600';
  return 'text-red-500';
}

/** Format date as dd/MM/yyyy */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Compute age from DOB */
function computeAge(dob: string | null): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
}

/* ───────────── Component ───────────── */

export function ComparePageClient({
  bundles,
  allPlayers,
  savedComparisons: initialSaved,
  hideScoutingData,
}: {
  bundles: CompareBundle[];
  allPlayers: PickerPlayer[];
  savedComparisons: SavedComparison[];
  userRole: string;
  hideScoutingData: boolean;
}) {
  const router = useRouter();
  const [activeCard, setActiveCard] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saved, setSaved] = useState<SavedComparison[]>(initialSaved);

  const canAddMore = bundles.length < MAX_PLAYERS;
  const existingIds = useMemo(() => new Set(bundles.map((b) => b.player.id)), [bundles]);

  /* Check if current comparison is already saved */
  const currentIds = useMemo(() => bundles.map((b) => b.player.id).sort((a, b) => a - b), [bundles]);
  /** Find the saved comparison matching current IDs (if any) */
  const currentSaved = useMemo(() => {
    if (currentIds.length < 2) return null;
    return saved.find((c) => {
      const sortedSaved = [...c.playerIds].sort((a, b) => a - b);
      return sortedSaved.length === currentIds.length && sortedSaved.every((id, i) => id === currentIds[i]);
    }) ?? null;
  }, [saved, currentIds]);

  /** Other saved comparisons (exclude the one currently displayed) */
  const otherSaved = useMemo(
    () => currentSaved ? saved.filter((c) => c.id !== currentSaved.id) : saved,
    [saved, currentSaved],
  );

  /* Remove a player from comparison */
  function removePlayer(index: number) {
    const newIds = bundles.filter((_, i) => i !== index).map((b) => b.player.id);
    if (newIds.length === 0) {
      router.push('/comparar');
    } else {
      router.push(`/comparar?ids=${newIds.join(',')}`);
    }
  }

  /* Load a saved comparison */
  function handleLoadComparison(comparison: SavedComparison) {
    router.push(`/comparar?ids=${comparison.playerIds.join(',')}`);
  }

  /* Delete a saved comparison */
  async function handleDeleteComparison(id: number, navigate?: boolean) {
    const res = await deleteComparison(id);
    if (res.success) {
      setSaved((prev) => prev.filter((c) => c.id !== id));
      toast.success('Comparação eliminada');
      if (navigate) router.push('/comparar');
    } else {
      toast.error(res.error ?? 'Erro ao eliminar');
    }
  }

  /* Add player via picker dialog */
  function handleAddPlayer(playerId: number) {
    const currentIds = bundles.map((b) => b.player.id);
    currentIds.push(playerId);
    router.push(`/comparar?ids=${currentIds.join(',')}`);
    setPickerOpen(false);
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold lg:text-2xl">Comparar Jogadores</h1>
        <div className="flex items-center gap-2">
          {/* Load other saved comparisons */}
          {otherSaved.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderOpen className="mr-1 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Guardadas</span>
                  <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">
                    {otherSaved.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {otherSaved.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                    onClick={() => handleLoadComparison(c)}
                  >
                    <span className="truncate text-sm">{c.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteComparison(c.id);
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Save — only when not already saved */}
          {bundles.length >= 2 && !currentSaved && saved.length < MAX_SAVED_COMPARISONS && (
            <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
              <Bookmark className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Guardar</span>
            </Button>
          )}
          {/* Delete current saved comparison */}
          {currentSaved && (
            <Button variant="outline" size="sm" onClick={() => handleDeleteComparison(currentSaved.id, true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Eliminar</span>
            </Button>
          )}
          {/* New comparison — shown when players are loaded */}
          {bundles.length >= 1 && (
            <Button variant="outline" size="sm" onClick={() => router.push('/comparar')}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova</span>
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {bundles.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">
            Seleciona 2 ou 3 jogadores para comparar.
          </p>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar jogador
          </Button>
        </div>
      )}

      {/* Single player — prompt to add more */}
      {bundles.length === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Adiciona mais 1 ou 2 jogadores para comparar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlayerColumn
              bundle={bundles[0]}
              hideScoutingData={hideScoutingData}
              onRemove={() => removePlayer(0)}
            />
            <AddSlotCard onClick={() => setPickerOpen(true)} />
          </div>
        </div>
      )}

      {/* 2-3 players — comparison view */}
      {bundles.length >= 2 && (
        <>
          {/* Mobile: horizontal scroll with snap */}
          <div className="lg:hidden">
            {/* Tab bar */}
            <div className="flex gap-1 mb-3 border-b pb-2">
              {bundles.map((b, i) => (
                <button
                  key={b.player.id}
                  type="button"
                  onClick={() => {
                    setActiveCard(i);
                    document.getElementById(`compare-card-${i}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors truncate ${
                    activeCard === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {b.player.name.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
              {canAddMore && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex items-center justify-center rounded-md bg-muted px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Scrollable cards */}
            <div
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4"
              onScroll={(e) => {
                const el = e.currentTarget;
                const cardWidth = el.scrollWidth / bundles.length;
                const idx = Math.round(el.scrollLeft / cardWidth);
                setActiveCard(Math.min(idx, bundles.length - 1));
              }}
            >
              {bundles.map((b, i) => (
                <div
                  key={b.player.id}
                  id={`compare-card-${i}`}
                  className="min-w-full snap-start"
                >
                  <PlayerColumn
                    bundle={b}
                    hideScoutingData={hideScoutingData}
                    onRemove={() => removePlayer(i)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Desktop: side-by-side columns */}
          <div className="hidden lg:block">
            <CompareTable
              bundles={bundles}
              hideScoutingData={hideScoutingData}
              onRemove={removePlayer}
              onAddSlot={canAddMore ? () => setPickerOpen(true) : undefined}
            />
          </div>
        </>
      )}

      {/* Player picker dialog */}
      <AddToCompareDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allPlayers={allPlayers}
        existingIds={existingIds}
        onAdd={handleAddPlayer}
      />

      {/* Save comparison dialog */}
      <SaveComparisonDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        playerIds={bundles.map((b) => b.player.id)}
        playerNames={bundles.map((b) => b.player.name)}
        onSaved={(c) => setSaved((prev) => [c, ...prev])}
      />
    </div>
  );
}

/* ───────────── Save Comparison Dialog ───────────── */

function SaveComparisonDialog({
  open,
  onOpenChange,
  playerIds,
  playerNames,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerIds: number[];
  playerNames: string[];
  onSaved: (comparison: SavedComparison) => void;
}) {
  /* Default name from player names (first name of each) */
  const defaultName = useMemo(() => {
    return playerNames.map((n) => {
      const parts = n.trim().split(/\s+/);
      return parts[0] || n.trim().slice(0, 15) || '?';
    }).join(' vs ');
  }, [playerNames]);

  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  /* Reset form when dialog opens */
  /* eslint-disable react-hooks/set-state-in-effect -- resets form state on open */
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSaving(false);
    }
  }, [open, defaultName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await saveComparison({ name: name.trim(), playerIds });
    setSaving(false);
    if (res.success && res.data) {
      onSaved(res.data);
      onOpenChange(false);
      toast.success('Comparação guardada');
    } else {
      toast.error(res.error ?? 'Erro ao guardar');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Guardar comparação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Nome da comparação"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
          <p className="text-xs text-muted-foreground">
            {playerNames.join(', ')}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'A guardar...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Add to Compare Dialog (same pattern as AddToSquadDialog) ───────────── */

interface PickerFilters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
  year: string;
}

const EMPTY_PICKER_FILTERS: PickerFilters = { search: '', position: '', club: '', opinion: '', foot: '', year: '' };

function AddToCompareDialog({
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
  onAdd: (playerId: number) => void;
}) {
  const [filters, setFilters] = useState<PickerFilters>(EMPTY_PICKER_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  /* Reset filters when dialog opens */
  /* eslint-disable react-hooks/set-state-in-effect -- resets filter form when dialog opens */
  useEffect(() => {
    if (open) {
      setFilters(EMPTY_PICKER_FILTERS);
      setDebouncedSearch('');
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Debounce search */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  /* Exclude players already in comparison */
  const available = useMemo(
    () => allPlayers.filter((p) => !existingIds.has(p.id)),
    [allPlayers, existingIds],
  );

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

  function updateFilter(key: keyof PickerFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar jogador à comparação</DialogTitle>
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
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters(EMPTY_PICKER_FILTERS)}>
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
                onClick={() => onAdd(player.id)}
              >
                Adicionar
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Mobile: Player Column (full card) ───────────── */

function PlayerColumn({
  bundle,
  hideScoutingData,
  onRemove,
}: {
  bundle: CompareBundle;
  hideScoutingData: boolean;
  onRemove: () => void;
}) {
  const { player, reports } = bundle;
  const photoUrl = player.photoUrl || player.zzPhotoUrl || null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="relative p-4 pb-3 border-b">
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
          title="Remover"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="shrink-0 h-14 w-14 rounded-lg bg-neutral-100 overflow-hidden flex items-center justify-center">
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoUrl} alt="" className="h-14 w-14 object-cover" />
            ) : (
              <Users className="h-6 w-6 text-neutral-300" />
            )}
          </div>
          <div className="min-w-0">
            <Link href={`/jogadores/${player.id}`} className="text-sm font-bold hover:underline truncate block">
              {player.name}
            </Link>
            <ClubBadge club={player.club} logoUrl={player.clubLogoUrl} size="sm" className="text-xs text-muted-foreground mt-0.5" />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y">
        <Section title="Dados Básicos">
          <Row label="Nascimento" value={fmtDate(player.dob)} />
          <Row label="Idade" value={computeAge(player.dob)} />
          <Row label="Nacionalidade" value={player.nationality ? `${getNationalityFlag(player.nationality)} ${player.nationality}` : '—'} />
          <Row label="Pé" value={player.foot || '—'} />
          <Row label="Número" value={player.shirtNumber || '—'} />
        </Section>

        <Section title="Posição">
          <div className="flex items-center gap-3">
            <MiniPitch
              primaryPosition={player.positionNormalized as PositionCode}
              secondaryPosition={(player.secondaryPosition ?? undefined) as PositionCode | undefined}
              tertiaryPosition={(player.tertiaryPosition ?? undefined) as PositionCode | undefined}
            />
            <div className="text-xs space-y-0.5">
              {player.positionNormalized && <p><span className="font-medium">{player.positionNormalized}</span> — {getPositionLabel(player.positionNormalized)}</p>}
              {player.secondaryPosition && <p className="text-muted-foreground">{player.secondaryPosition} — {getPositionLabel(player.secondaryPosition)}</p>}
              {player.tertiaryPosition && <p className="text-muted-foreground">{player.tertiaryPosition} — {getPositionLabel(player.tertiaryPosition)}</p>}
            </div>
          </div>
        </Section>

        <Section title="Físico">
          <Row label="Altura" value={player.height || player.zzHeight ? `${player.height ?? player.zzHeight} cm` : '—'} />
          <Row label="Peso" value={player.weight || player.zzWeight ? `${player.weight ?? player.zzWeight} kg` : '—'} />
        </Section>

        {!hideScoutingData && (
          <Section title="Avaliação">
            <Row
              label="Rating"
              value={player.reportAvgRating !== null ? `${player.reportAvgRating.toFixed(1)} (${player.reportRatingCount})` : '—'}
              valueClass={ratingColor(player.reportAvgRating)}
            />
            <Row label="Opinião" value={null}>
              {player.departmentOpinion.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {player.departmentOpinion.map((o) => (
                    <OpinionBadge key={o} opinion={o} />
                  ))}
                </div>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </Row>
            <Row label="Decisão" value={player.observerDecision || '—'} />
          </Section>
        )}

        <Section title="Pipeline">
          <Row label="Estado" value={player.recruitmentStatus ?? '—'} />
          <Row label="Plantel Real" value={player.isRealSquad ? 'Sim' : 'Não'} />
          <Row label="Plantel Sombra" value={player.isShadowSquad ? 'Sim' : 'Não'} />
        </Section>

        {!hideScoutingData && (
          <Section title="Relatórios">
            <Row label="Total" value={reports.length > 0 ? String(reports.length) : '—'} />
            {reports.length > 0 && (
              <>
                <Row
                  label="Média"
                  value={(() => {
                    const rated = reports.filter((r) => r.rating !== null);
                    if (rated.length === 0) return '—';
                    const avg = rated.reduce((a, r) => a + r.rating!, 0) / rated.length;
                    return avg.toFixed(1);
                  })()}
                />
                <Row label="Último" value={fmtDate(reports[0]?.matchDate ?? null)} />
              </>
            )}
          </Section>
        )}

        <Section title="Estatísticas ZZ">
          <Row label="Jogos (época)" value={player.zzGamesSeason !== null ? String(player.zzGamesSeason) : '—'} />
          <Row label="Golos (época)" value={player.zzGoalsSeason !== null ? String(player.zzGoalsSeason) : '—'} />
        </Section>
      </div>
    </div>
  );
}

/* ───────────── Desktop: Compare Table ───────────── */

function CompareTable({
  bundles,
  hideScoutingData,
  onRemove,
  onAddSlot,
}: {
  bundles: CompareBundle[];
  hideScoutingData: boolean;
  onRemove: (index: number) => void;
  onAddSlot?: () => void;
}) {
  const cols = bundles.length + (onAddSlot ? 1 : 0);
  const gridClass = cols === 2 ? 'grid-cols-[180px_1fr_1fr]'
    : cols === 3 ? 'grid-cols-[180px_1fr_1fr_1fr]'
    : 'grid-cols-[180px_1fr_1fr]';

  return (
    <div className={`grid ${gridClass} gap-0 rounded-lg border bg-card overflow-hidden`}>
      {/* Header row */}
      <HeaderCell label="" />
      {bundles.map((b, i) => (
        <PlayerHeader key={b.player.id} bundle={b} onRemove={() => onRemove(i)} />
      ))}
      {onAddSlot && (
        <div className="border-b border-l p-4 flex items-center justify-center">
          <Button variant="ghost" size="sm" onClick={onAddSlot} className="text-muted-foreground">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>
      )}

      {/* Dados Básicos */}
      <SectionHeader label="Dados Básicos" cols={cols} />
      <TableRow label="Nascimento" bundles={bundles} getValue={(p) => fmtDate(p.dob)} addSlot={!!onAddSlot} />
      <TableRow label="Idade" bundles={bundles} getValue={(p) => computeAge(p.dob)} addSlot={!!onAddSlot} />
      <TableRow label="Nacionalidade" bundles={bundles} getValue={(p) => p.nationality ? `${getNationalityFlag(p.nationality)} ${p.nationality}` : '—'} addSlot={!!onAddSlot} />
      <TableRow label="Pé" bundles={bundles} getValue={(p) => p.foot || '—'} addSlot={!!onAddSlot} />
      <TableRow label="Número" bundles={bundles} getValue={(p) => p.shirtNumber || '—'} addSlot={!!onAddSlot} />

      {/* Posição */}
      <SectionHeader label="Posição" cols={cols} />
      <TableRow label="Principal" bundles={bundles} getValue={(p) => p.positionNormalized ? `${p.positionNormalized} — ${getPositionLabel(p.positionNormalized)}` : '—'} addSlot={!!onAddSlot} />
      <TableRow label="Secundária" bundles={bundles} getValue={(p) => p.secondaryPosition ? `${p.secondaryPosition} — ${getPositionLabel(p.secondaryPosition)}` : '—'} addSlot={!!onAddSlot} />
      <TableRow label="Terciária" bundles={bundles} getValue={(p) => p.tertiaryPosition ? `${p.tertiaryPosition} — ${getPositionLabel(p.tertiaryPosition)}` : '—'} addSlot={!!onAddSlot} />

      {/* Físico */}
      <SectionHeader label="Físico" cols={cols} />
      <TableRow label="Altura" bundles={bundles} getValue={(p) => { const h = p.height ?? p.zzHeight; return h ? `${h} cm` : '—'; }} highlight="max" addSlot={!!onAddSlot} />
      <TableRow label="Peso" bundles={bundles} getValue={(p) => { const w = p.weight ?? p.zzWeight; return w ? `${w} kg` : '—'; }} addSlot={!!onAddSlot} />

      {/* Avaliação */}
      {!hideScoutingData && (
        <>
          <SectionHeader label="Avaliação" cols={cols} />
          <TableRow label="Rating" bundles={bundles} getValue={(p) => p.reportAvgRating !== null ? `${p.reportAvgRating.toFixed(1)} (${p.reportRatingCount})` : '—'} highlight="max" addSlot={!!onAddSlot} />
          <CompareRowCustom label="Opinião" bundles={bundles} addSlot={!!onAddSlot} renderCell={(b) => (
            b.player.departmentOpinion.length > 0
              ? <div className="flex flex-wrap gap-1">{b.player.departmentOpinion.map((o) => <OpinionBadge key={o} opinion={o} />)}</div>
              : <span className="text-muted-foreground">—</span>
          )} />
          <TableRow label="Decisão" bundles={bundles} getValue={(p) => p.observerDecision || '—'} addSlot={!!onAddSlot} />
        </>
      )}

      {/* Pipeline */}
      <SectionHeader label="Pipeline" cols={cols} />
      <TableRow label="Estado" bundles={bundles} getValue={(p) => p.recruitmentStatus ?? '—'} addSlot={!!onAddSlot} />
      <TableRow label="Plantel Real" bundles={bundles} getValue={(p) => p.isRealSquad ? 'Sim' : 'Não'} addSlot={!!onAddSlot} />
      <TableRow label="Plantel Sombra" bundles={bundles} getValue={(p) => p.isShadowSquad ? 'Sim' : 'Não'} addSlot={!!onAddSlot} />

      {/* Relatórios */}
      {!hideScoutingData && (
        <>
          <SectionHeader label="Relatórios" cols={cols} />
          <TableRow label="Total" bundles={bundles} getValue={(_, b) => b.reports.length > 0 ? String(b.reports.length) : '—'} highlight="max" addSlot={!!onAddSlot} />
          <TableRow label="Último" bundles={bundles} getValue={(_, b) => b.reports.length > 0 ? fmtDate(b.reports[0]?.matchDate ?? null) : '—'} addSlot={!!onAddSlot} />
        </>
      )}

      {/* Estatísticas ZZ */}
      <SectionHeader label="Estatísticas ZZ" cols={cols} />
      <TableRow label="Jogos (época)" bundles={bundles} getValue={(p) => p.zzGamesSeason !== null ? String(p.zzGamesSeason) : '—'} highlight="max" addSlot={!!onAddSlot} />
      <TableRow label="Golos (época)" bundles={bundles} getValue={(p) => p.zzGoalsSeason !== null ? String(p.zzGoalsSeason) : '—'} highlight="max" addSlot={!!onAddSlot} />
    </div>
  );
}

/* ───────────── Table Helpers ───────────── */

function HeaderCell({ label }: { label: string }) {
  return <div className="border-b p-3 text-xs font-semibold text-muted-foreground">{label}</div>;
}

function PlayerHeader({ bundle, onRemove }: { bundle: CompareBundle; onRemove: () => void }) {
  const { player } = bundle;
  const photoUrl = player.photoUrl || player.zzPhotoUrl || null;

  return (
    <div className="relative border-b border-l p-4">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors"
        title="Remover"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-12 w-12 rounded-lg bg-neutral-100 overflow-hidden flex items-center justify-center">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="" className="h-12 w-12 object-cover" />
          ) : (
            <Users className="h-5 w-5 text-neutral-300" />
          )}
        </div>
        <div className="min-w-0">
          <Link href={`/jogadores/${player.id}`} className="text-sm font-bold hover:underline truncate block">
            {player.name}
          </Link>
          <ClubBadge club={player.club} logoUrl={player.clubLogoUrl} size="sm" className="text-xs text-muted-foreground mt-0.5" />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string; cols: number }) {
  return (
    <div className={`col-span-full bg-muted/50 px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground tracking-wide border-b`}>
      {label}
    </div>
  );
}

/** Standard row with text values. Optional "max" highlight for numeric comparisons. */
function TableRow({
  label,
  bundles,
  getValue,
  highlight,
  addSlot,
}: {
  label: string;
  bundles: CompareBundle[];
  getValue: (player: Player, bundle: CompareBundle) => string;
  highlight?: 'max';
  addSlot: boolean;
}) {
  const values = bundles.map((b) => getValue(b.player, b));

  /* Find max numeric value for highlighting */
  let maxIdx = -1;
  if (highlight === 'max') {
    let maxVal = -Infinity;
    values.forEach((v, i) => {
      const num = parseFloat(v);
      if (!isNaN(num) && num > maxVal) {
        maxVal = num;
        maxIdx = i;
      }
    });
    // Only highlight if there are different values
    const nums = values.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
    if (new Set(nums).size <= 1) maxIdx = -1;
  }

  return (
    <>
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center">
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={bundles[i].player.id}
          className={`border-b border-l px-3 py-2 text-sm ${
            i === maxIdx ? 'font-semibold text-green-600' : ''
          }`}
        >
          {v}
        </div>
      ))}
      {addSlot && <div className="border-b border-l" />}
    </>
  );
}

/** Custom row with JSX render per cell */
function CompareRowCustom({
  label,
  bundles,
  addSlot,
  renderCell,
}: {
  label: string;
  bundles: CompareBundle[];
  addSlot: boolean;
  renderCell: (bundle: CompareBundle) => React.ReactNode;
}) {
  return (
    <>
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center">
        {label}
      </div>
      {bundles.map((b) => (
        <div key={b.player.id} className="border-b border-l px-3 py-2 text-sm">
          {renderCell(b)}
        </div>
      ))}
      {addSlot && <div className="border-b border-l" />}
    </>
  );
}

/* ───────────── Mobile Section/Row Helpers ───────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, valueClass, children }: { label: string; value: string | null; valueClass?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children ?? <span className={valueClass ?? ''}>{value ?? '—'}</span>}
    </div>
  );
}

/* ───────────── Add Slot Card ───────────── */

function AddSlotCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 bg-muted/30 p-8 text-muted-foreground transition-colors hover:border-neutral-300 hover:text-foreground min-h-[200px]"
    >
      <Plus className="h-8 w-8" />
      <span className="text-sm font-medium">Adicionar jogador</span>
    </button>
  );
}

// src/components/pipeline/PipelineView.tsx
// Client orchestrator for the Abordagens page — only shows players with a recruitment status
// Players with null status are NOT in abordagens. Full filters in add dialog.
// RELEVANT FILES: src/components/pipeline/KanbanBoard.tsx, src/components/pipeline/StatusList.tsx, src/actions/pipeline.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useAgeGroup } from '@/hooks/useAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { RECRUITMENT_STATUSES, POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import { updateRecruitmentStatus, reorderPipelineCards } from '@/actions/pipeline';
import { KanbanBoard } from '@/components/pipeline/KanbanBoard';
import { StatusList } from '@/components/pipeline/StatusList';
import { PlayerProfile } from '@/components/players/PlayerProfile';
import { OpinionBadge } from '@/components/common/OpinionBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DepartmentOpinion, ObservationNote, Player, PlayerRow, RecruitmentStatus, StatusHistoryEntry, UserRole } from '@/lib/types';

export function PipelineView() {
  const { selectedId } = useAgeGroup();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Show birth year on cards when viewing all age groups
  const showBirthYear = selectedId === null;

  /* ───────────── Player Profile Dialog ───────────── */

  const [profilePlayerId, setProfilePlayerId] = useState<number | null>(null);
  const [profileNotes, setProfileNotes] = useState<ObservationNote[]>([]);
  const [profileHistory, setProfileHistory] = useState<StatusHistoryEntry[]>([]);
  const [profileRole, setProfileRole] = useState<UserRole>('scout');

  const profilePlayer = profilePlayerId
    ? allPlayers.find((p) => p.id === profilePlayerId) ?? null
    : null;

  // Fetch notes, history, and role when opening the profile popup
  useEffect(() => {
    if (!profilePlayerId) return;
    const supabase = createClient();

    // Fetch observation notes
    supabase
      .from('observation_notes')
      .select('*, profiles:author_id(full_name)')
      .eq('player_id', profilePlayerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfileNotes(
          (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as number,
            playerId: row.player_id as number,
            authorId: row.author_id as string,
            authorName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Desconhecido',
            content: row.content as string,
            matchContext: row.match_context as string | null,
            createdAt: row.created_at as string,
          }))
        );
      });

    // Fetch status history
    supabase
      .from('status_history')
      .select('*, profiles:changed_by(full_name)')
      .eq('player_id', profilePlayerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfileHistory(
          (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as number,
            playerId: row.player_id as number,
            fieldChanged: row.field_changed as string,
            oldValue: row.old_value as string | null,
            newValue: row.new_value as string | null,
            changedBy: row.changed_by as string,
            changedByName: (row.profiles as { full_name: string } | null)?.full_name ?? 'Sistema',
            notes: row.notes as string | null,
            createdAt: row.created_at as string,
          }))
        );
      });

    // Fetch current user role
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfileRole((data?.role as UserRole) ?? 'scout');
        });
    });
  }, [profilePlayerId]);

  function handlePlayerClick(playerId: number) {
    setProfileNotes([]);
    setProfileHistory([]);
    setProfilePlayerId(playerId);
  }

  function handleProfileClose() {
    setProfilePlayerId(null);
  }

  /* ───────────── Fetch ───────────── */

  const fetchPlayers = useCallback(() => {
    const supabase = createClient();
    let query = supabase.from('players').select('*');
    if (selectedId) query = query.eq('age_group_id', selectedId);
    query.order('name').then(({ data, error }) => {
      if (!error && data) {
        startTransition(() => {
          setAllPlayers((data as PlayerRow[]).map(mapPlayerRow));
        });
      }
    });
  }, [selectedId]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  /* ───────────── Split: in abordagens vs not ───────────── */

  const pipelinePlayers = useMemo(
    () => allPlayers.filter((p) => p.recruitmentStatus),
    [allPlayers]
  );

  /* ───────────── Group pipeline players by status ───────────── */

  const playersByStatus = useMemo(() => {
    const map = {} as Record<RecruitmentStatus, Player[]>;
    for (const s of RECRUITMENT_STATUSES) map[s.value] = [];
    for (const p of pipelinePlayers) {
      if (p.recruitmentStatus) map[p.recruitmentStatus]?.push(p);
    }
    // Sort each column by pipeline_order
    for (const key of Object.keys(map) as RecruitmentStatus[]) {
      map[key].sort((a, b) => a.pipelineOrder - b.pipelineOrder);
    }
    return map;
  }, [pipelinePlayers]);

  /* ───────────── Handlers ───────────── */

  /** Move between columns — optimistic, await server, revert on failure */
  async function handleStatusChange(playerId: number, newStatus: RecruitmentStatus) {
    const prev = allPlayers;
    setAllPlayers((cur) =>
      cur.map((p) => {
        if (p.id !== playerId) return p;
        const updated = { ...p, recruitmentStatus: newStatus };
        // Clear date fields when leaving their respective statuses (mirrors server logic)
        if (p.recruitmentStatus === 'vir_treinar' && newStatus !== 'vir_treinar') {
          updated.trainingDate = null;
        }
        if (p.recruitmentStatus === 'reuniao_marcada' && newStatus !== 'reuniao_marcada') {
          updated.meetingDate = null;
        }
        if (p.recruitmentStatus === 'confirmado' && newStatus !== 'confirmado') {
          updated.signingDate = null;
        }
        return updated;
      })
    );
    const result = await updateRecruitmentStatus(playerId, newStatus);
    if (!result.success) {
      console.error('handleStatusChange failed:', result.error);
      setAllPlayers(prev);
    }
  }

  /** Reorder cards within a column — optimistic update + server persist */
  async function handleReorder(updates: { playerId: number; order: number }[]) {
    // Optimistic: update pipelineOrder in local state
    const orderMap = new Map(updates.map((u) => [u.playerId, u.order]));
    setAllPlayers((cur) =>
      cur.map((p) => {
        const newOrder = orderMap.get(p.id);
        return newOrder !== undefined ? { ...p, pipelineOrder: newOrder } : p;
      })
    );

    const result = await reorderPipelineCards(updates);
    if (!result.success) {
      console.error('handleReorder failed:', result.error);
      // Refetch to recover correct order
      fetchPlayers();
    }
  }

  /** Optimistic update for training/meeting/signing date edits from PipelineCard */
  function handleDateChange(playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) {
    setAllPlayers((cur) =>
      cur.map((p) =>
        p.id === playerId ? { ...p, [field]: newDate } : p
      )
    );
  }

  /** Add to abordagens — await server, revert on failure, NO refetch on success */
  async function handleAdd(playerId: number) {
    const prev = allPlayers;
    setAllPlayers((cur) =>
      cur.map((p) =>
        p.id === playerId ? { ...p, recruitmentStatus: 'por_tratar' as RecruitmentStatus } : p
      )
    );
    const result = await updateRecruitmentStatus(playerId, 'por_tratar');
    if (!result.success) {
      console.error('handleAdd failed:', result.error);
      setAllPlayers(prev);
    }
  }

  /** Remove from abordagens — await server, revert on failure, NO refetch on success */
  async function handleRemove(playerId: number) {
    const prev = allPlayers;
    setAllPlayers((cur) =>
      cur.map((p) =>
        p.id === playerId ? { ...p, recruitmentStatus: null } : p
      )
    );
    const result = await updateRecruitmentStatus(playerId, null);
    if (!result.success) {
      console.error('handleRemove failed:', result.error);
      setAllPlayers(prev);
    }
  }

  if (isPending && allPlayers.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-100" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Title + Add button */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Abordagens</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
      </div>

      <AgeGroupSelector />

      {/* Counter */}
      <p className="mb-4 mt-4 text-sm text-muted-foreground">
        {pipelinePlayers.length} jogador{pipelinePlayers.length !== 1 ? 'es' : ''} em abordagens
      </p>

      {/* Desktop: Kanban */}
      <div className="hidden lg:block">
        <KanbanBoard
          playersByStatus={playersByStatus}
          showBirthYear={showBirthYear}
          onPlayerClick={handlePlayerClick}
          onStatusChange={handleStatusChange}
          onRemove={handleRemove}
          onDateChange={handleDateChange}
          onReorder={handleReorder}
        />
      </div>

      {/* Mobile: Status list */}
      <div className="lg:hidden">
        <StatusList
          playersByStatus={playersByStatus}
          showBirthYear={showBirthYear}
          onPlayerClick={handlePlayerClick}
          onStatusChange={handleStatusChange}
          onRemove={handleRemove}
          onDateChange={handleDateChange}
        />
      </div>

      {/* Player profile popup */}
      <Dialog open={profilePlayerId !== null} onOpenChange={(open) => { if (!open) handleProfileClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {profilePlayer && (
            <PlayerProfile
              player={profilePlayer}
              userRole={profileRole}
              notes={profileNotes}
              statusHistory={profileHistory}
              onClose={handleProfileClose}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add to abordagens dialog — shows ALL players, always adds as 'por_tratar' */}
      <AddToPipelineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        availablePlayers={allPlayers}
        onAdd={(playerId) => {
          handleAdd(playerId);
          setDialogOpen(false);
        }}
      />

    </>
  );
}

/* ───────────── Add to Pipeline Dialog (with full filters) ───────────── */

interface DialogFilters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
  year: string;
}

const EMPTY_FILTERS: DialogFilters = { search: '', position: '', club: '', opinion: '', foot: '', year: '' };

function AddToPipelineDialog({
  open,
  onOpenChange,
  availablePlayers,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availablePlayers: Player[];
  onAdd: (playerId: number) => void;
}) {
  const [filters, setFilters] = useState<DialogFilters>(EMPTY_FILTERS);

  const clubs = useMemo(() => {
    const set = new Set(availablePlayers.map((p) => p.club).filter(Boolean));
    return Array.from(set).sort();
  }, [availablePlayers]);

  /** Extract unique birth years for year filter */
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of availablePlayers) {
      if (p.dob) {
        const y = new Date(p.dob).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [availablePlayers]);

  const filtered = useMemo(() => {
    let result = availablePlayers;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q)
      );
    }
    if (filters.position) result = result.filter((p) => p.positionNormalized === filters.position);
    if (filters.club) result = result.filter((p) => p.club === filters.club);
    if (filters.opinion) result = result.filter((p) => p.departmentOpinion.includes(filters.opinion as DepartmentOpinion));
    if (filters.foot) result = result.filter((p) => p.foot === filters.foot);
    if (filters.year) {
      const yr = parseInt(filters.year, 10);
      result = result.filter((p) => p.dob && new Date(p.dob).getFullYear() === yr);
    }

    return result.slice(0, 30);
  }, [availablePlayers, filters]);

  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot || filters.year;

  function updateFilter(key: keyof DialogFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar às Abordagens</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar nome ou clube..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-1.5">
          <Select value={filters.position || 'all'} onValueChange={(v) => updateFilter('position', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="Posição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Posição</SelectItem>
              {POSITIONS.map((p) => (
                <SelectItem key={p.code} value={p.code}>{p.code} — {p.labelPt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.club || 'all'} onValueChange={(v) => updateFilter('club', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Clube" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Clube</SelectItem>
              {clubs.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.opinion || 'all'} onValueChange={(v) => updateFilter('opinion', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Opinião" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Opinião</SelectItem>
              {DEPARTMENT_OPINIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.foot || 'all'} onValueChange={(v) => updateFilter('foot', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue placeholder="Pé" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Pé</SelectItem>
              {FOOT_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.year || 'all'} onValueChange={(v) => updateFilter('year', v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
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
            <div key={player.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{player.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {player.club}
                  {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                  {player.foot ? ` · ${player.foot}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <OpinionBadge opinion={player.departmentOpinion} />
                {player.recruitmentStatus && (
                  <StatusBadge status={player.recruitmentStatus} />
                )}
                <Button size="sm" variant="outline" onClick={() => onAdd(player.id)}>
                  Adicionar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

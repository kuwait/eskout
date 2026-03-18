// src/components/pipeline/PipelineView.tsx
// Client orchestrator for the Abordagens page — only shows players with a recruitment status
// Players with null status are NOT in abordagens. Full filters in add dialog.
// RELEVANT FILES: src/components/pipeline/KanbanBoard.tsx, src/components/pipeline/StatusList.tsx, src/actions/pipeline.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { usePageAgeGroup } from '@/hooks/usePageAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import { RECRUITMENT_STATUSES, RECRUITMENT_LABEL_MAP, POSITIONS, DEPARTMENT_OPINIONS, FOOT_OPTIONS } from '@/lib/constants';
import { updateRecruitmentStatus, reorderPipelineCards, updateDecisionSide } from '@/actions/pipeline';
import { KanbanBoard } from '@/components/pipeline/KanbanBoard';

import { OpinionBadge } from '@/components/common/OpinionBadge';
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
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { StatusChangeDialog } from '@/components/pipeline/StatusChangeDialog';
import type { ContactPurpose, DecisionSide, Player, PlayerRow, RecruitmentStatus } from '@/lib/types';

export function PipelineView({ clubId }: { clubId: string }) {
  const router = useRouter();
  const { ageGroups, selectedId, setSelectedId } = usePageAgeGroup({ pageId: 'pipeline', defaultAll: true });
  const [pipelinePlayers, setPipelinePlayers] = useState<Player[]>([]);
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clubMembers, setClubMembers] = useState<{ id: string; fullName: string }[]>([]);
  const [contactPurposes, setContactPurposes] = useState<ContactPurpose[]>([]);
  // StatusChangeDialog state — shown when moving to em_contacto
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ playerId: number; playerName: string } | null>(null);
  // Show birth year on cards when viewing all age groups
  const showBirthYear = selectedId === null;

  // Navigate to player profile page (always fresh data)
  function handlePlayerClick(playerId: number) {
    router.push(`/jogadores/${playerId}`);
  }

  /* ───────────── Fetch ───────────── */

  // Map of playerId -> last contact purpose label (for em_contacto cards)
  const [contactPurposeMap, setContactPurposeMap] = useState<Record<number, string>>({});

  // Fetch only players with recruitment_status (in the pipeline) — fast, ~100-200 rows
  const fetchPipelinePlayers = useCallback(async () => {
    const supabase = createClient();
    const PAGE = 1000;
    const all: PlayerRow[] = [];
    let offset = 0;
    for (;;) {
      let query = supabase.from('players').select('*').eq('club_id', clubId).not('recruitment_status', 'is', null);
      if (selectedId) query = query.eq('age_group_id', selectedId);
      const { data, error } = await query.order('name').range(offset, offset + PAGE - 1);
      if (error || !data?.length) break;
      all.push(...(data as PlayerRow[]));
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    const mapped = all.map(mapPlayerRow);

    // Fetch latest contact purpose for em_contacto players
    const emContactoIds = mapped
      .filter((p) => p.recruitmentStatus === 'em_contacto')
      .map((p) => p.id);

    if (emContactoIds.length > 0) {
      // Get latest status_history entry with contact purpose (structured or custom) for each em_contacto player
      const { data: historyRows } = await supabase
        .from('status_history')
        .select('player_id, contact_purpose_id, contact_purpose_custom, contact_purposes(label)')
        .in('player_id', emContactoIds)
        .eq('field_changed', 'recruitment_status')
        .eq('new_value', 'em_contacto')
        .or('contact_purpose_id.not.is.null,contact_purpose_custom.not.is.null')
        .order('created_at', { ascending: false });

      // Build map: use first (most recent) entry per player
      const purposeMap: Record<number, string> = {};
      for (const row of historyRows ?? []) {
        if (purposeMap[row.player_id]) continue; // already have the most recent
        // contact_purposes is a FK join — Supabase returns object (not array)
        const cpJoin = row.contact_purposes as unknown as { label: string } | null;
        // Custom text takes precedence when contact_purpose_id is null (i.e., "Outro" was selected)
        const label = row.contact_purpose_id
          ? (cpJoin?.label ?? null)
          : (row.contact_purpose_custom ?? null);
        if (label) purposeMap[row.player_id] = label;
      }

      startTransition(() => { setContactPurposeMap(purposeMap); });
    } else {
      startTransition(() => { setContactPurposeMap({}); });
    }

    startTransition(() => {
      setPipelinePlayers(mapped);
    });
  }, [selectedId, clubId]);

  useEffect(() => {
    fetchPipelinePlayers();
  }, [fetchPipelinePlayers]);

  // Fetch club members once for contact assignment dropdowns (via server action to avoid RLS issues)
  useEffect(() => {
    import('@/actions/users').then(({ getClubMembers }) =>
      getClubMembers().then((members) => setClubMembers(members))
    );
  }, []);

  // Fetch contact purposes for the StatusChangeDialog
  useEffect(() => {
    import('@/actions/contact-purposes').then(({ getContactPurposes }) =>
      getContactPurposes()
        .then((purposes) => setContactPurposes(purposes))
        .catch(() => setContactPurposes([]))
    ).catch(() => setContactPurposes([]));
  }, []);

  /* ───────────── Realtime: refetch when other users modify players ───────────── */

  useRealtimeTable('players', { onAny: () => fetchPipelinePlayers() });

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

  /** Move between columns — intercept em_contacto to show purpose dialog */
  async function handleStatusChange(playerId: number, newStatus: RecruitmentStatus) {
    // Intercept: moving to em_contacto → show dialog first
    if (newStatus === 'em_contacto') {
      const player = pipelinePlayers.find((p) => p.id === playerId);
      setPendingStatusChange({ playerId, playerName: player?.name ?? `Jogador #${playerId}` });
      setStatusDialogOpen(true);
      return;
    }

    await commitStatusChange(playerId, newStatus);
  }

  /** Actually perform the status change (called directly or after dialog confirmation) */
  async function commitStatusChange(
    playerId: number,
    newStatus: RecruitmentStatus,
    contactPurposeId?: string | null,
    contactPurposeCustom?: string | null,
    note?: string | null,
    assignedTo?: string | null,
  ) {
    const prev = pipelinePlayers;
    setPipelinePlayers((cur) =>
      cur.map((p) => {
        if (p.id !== playerId) return p;
        const updated = { ...p, recruitmentStatus: newStatus };
        // Auto-set decision_side when entering a_decidir, clear when leaving
        if (newStatus === 'a_decidir') {
          updated.decisionSide = 'club';
        } else if (p.recruitmentStatus === 'a_decidir') {
          updated.decisionSide = null;
          updated.decisionDate = null;
        }
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
        // Optimistic update for contact assignment
        if (assignedTo !== undefined) {
          updated.contactAssignedTo = assignedTo;
          updated.contactAssignedToName = assignedTo
            ? clubMembers.find((m) => m.id === assignedTo)?.fullName ?? null
            : null;
        }
        return updated;
      })
    );
    const result = await updateRecruitmentStatus(
      playerId,
      newStatus,
      note ?? undefined,
      contactPurposeId ?? undefined,
      contactPurposeCustom ?? undefined,
      assignedTo,
    );
    if (!result.success) {
      console.error('handleStatusChange failed:', result.error);
      setPipelinePlayers(prev);
    }
  }

  /** Called when the StatusChangeDialog is confirmed */
  function handleStatusDialogConfirm(purposeId: string | null, purposeCustom: string | null, note: string | null, assignedTo: string | null) {
    if (!pendingStatusChange) return;

    // Optimistic update of contact purpose label on the card
    const label = purposeCustom ?? contactPurposes.find((cp) => cp.id === purposeId)?.label ?? null;
    if (label) {
      setContactPurposeMap((prev) => ({ ...prev, [pendingStatusChange.playerId]: label }));
    }

    commitStatusChange(pendingStatusChange.playerId, 'em_contacto', purposeId, purposeCustom, note, assignedTo);
    setPendingStatusChange(null);
  }

  /** Change decision side within a_decidir — optimistic + server persist */
  async function handleDecisionSideChange(playerId: number, side: DecisionSide) {
    const prev = pipelinePlayers;
    setPipelinePlayers((cur) =>
      cur.map((p) =>
        p.id === playerId ? { ...p, decisionSide: side } : p
      )
    );
    const result = await updateDecisionSide(playerId, side);
    if (!result.success) {
      console.error('handleDecisionSideChange failed:', result.error);
      setPipelinePlayers(prev);
    }
  }

  /** Reorder cards within a column — optimistic update + server persist */
  async function handleReorder(updates: { playerId: number; order: number }[]) {
    // Optimistic: update pipelineOrder in local state
    const orderMap = new Map(updates.map((u) => [u.playerId, u.order]));
    setPipelinePlayers((cur) =>
      cur.map((p) => {
        const newOrder = orderMap.get(p.id);
        return newOrder !== undefined ? { ...p, pipelineOrder: newOrder } : p;
      })
    );

    const result = await reorderPipelineCards(updates);
    if (!result.success) {
      console.error('handleReorder failed:', result.error);
      fetchPipelinePlayers();
    }
  }

  /** Optimistic update for training/meeting/signing date edits from PipelineCard */
  function handleDateChange(playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate' | 'decisionDate', newDate: string | null) {
    setPipelinePlayers((cur) =>
      cur.map((p) =>
        p.id === playerId ? { ...p, [field]: newDate } : p
      )
    );
  }

  /** Add to abordagens — optimistic insert into pipeline list, revert on failure */
  async function handleAdd(player: Player) {
    const prevPipeline = pipelinePlayers;
    setPipelinePlayers((cur) => [...cur, { ...player, recruitmentStatus: 'por_tratar' as RecruitmentStatus }]);
    const result = await updateRecruitmentStatus(player.id, 'por_tratar');
    if (!result.success) {
      console.error('handleAdd failed:', result.error);
      setPipelinePlayers(prevPipeline);
    }
  }

  /** Remove from abordagens — revert on failure */
  async function handleRemove(playerId: number) {
    const prevPipeline = pipelinePlayers;
    setPipelinePlayers((cur) => cur.filter((p) => p.id !== playerId));
    const result = await updateRecruitmentStatus(playerId, null);
    if (!result.success) {
      console.error('handleRemove failed:', result.error);
      setPipelinePlayers(prevPipeline);
    }
  }

  return (
    <div className="min-w-0 max-w-full">
      {/* Title + Add button */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">Abordagens</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)} aria-label="Adicionar jogador à pipeline">
          <Plus className="mr-1 h-4 w-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
      </div>

      <AgeGroupSelector variant="navigator" value={selectedId} onChange={setSelectedId} ageGroups={ageGroups} />

      {/* Counter */}
      <p className="mb-4 mt-4 text-sm text-muted-foreground">
        {pipelinePlayers.length} jogador{pipelinePlayers.length !== 1 ? 'es' : ''} em abordagens
      </p>

      {/* Kanban — same component for all screen sizes */}
      <KanbanBoard
        playersByStatus={playersByStatus}
        showBirthYear={showBirthYear}
        clubMembers={clubMembers}
        contactPurposeMap={contactPurposeMap}
        contactPurposes={contactPurposes}
        onPlayerClick={handlePlayerClick}
        onStatusChange={handleStatusChange}
        onRemove={handleRemove}
        onDateChange={handleDateChange}
        onReorder={handleReorder}
        onDecisionSideChange={handleDecisionSideChange}
      />

      {/* Add to abordagens dialog — server-side search + pagination */}
      <AddToPipelineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clubId={clubId}
        ageGroupId={selectedId}
        onAdd={(player) => {
          handleAdd(player);
          setDialogOpen(false);
        }}
      />

      {/* Contact purpose dialog — shown when moving to em_contacto */}
      <StatusChangeDialog
        open={statusDialogOpen}
        onOpenChange={(v) => {
          setStatusDialogOpen(v);
          if (!v) setPendingStatusChange(null);
        }}
        playerName={pendingStatusChange?.playerName ?? ''}
        contactPurposes={contactPurposes}
        clubMembers={clubMembers}
        currentAssignedTo={pendingStatusChange ? pipelinePlayers.find((p) => p.id === pendingStatusChange.playerId)?.contactAssignedTo : null}
        onConfirm={handleStatusDialogConfirm}
      />
    </div>
  );
}

/* ───────────── Add to Pipeline Dialog (server-side search + pagination) ───────────── */

interface DialogFilters {
  search: string;
  position: string;
  club: string;
  opinion: string;
  foot: string;
}

const EMPTY_FILTERS: DialogFilters = { search: '', position: '', club: '', opinion: '', foot: '' };

const DIALOG_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE = 300;

function AddToPipelineDialog({
  open,
  onOpenChange,
  clubId,
  ageGroupId,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  ageGroupId: number | null;
  onAdd: (player: Player) => void;
}) {
  const [filters, setFilters] = useState<DialogFilters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  // All players matching structural filters (fetched from DB)
  const [pool, setPool] = useState<Player[]>([]);
  const [alreadyInPipeline, setAlreadyInPipeline] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [clubs, setClubs] = useState<string[]>([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Reset page when any filter changes
  useEffect(() => { setPage(0); }, [debouncedSearch, filters.position, filters.club, filters.opinion, filters.foot]);

  // Reset filters when dialog closes
  useEffect(() => {
    if (!open) { setFilters(EMPTY_FILTERS); setDebouncedSearch(''); setPage(0); setPool([]); setAlreadyInPipeline([]); }
  }, [open]);

  // Fetch distinct clubs for the filter dropdown (once when dialog opens)
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from('players')
      .select('club')
      .eq('club_id', clubId)
      .is('recruitment_status', null)
      .not('club', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map((r) => r.club as string).filter(Boolean))).sort();
          setClubs(unique);
        }
      });
  }, [open, clubId]);

  // Fetch players with server-side text search + structural filters
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();

    async function fetch() {
      // When text searching, limit to 50 results for speed
      const limit = debouncedSearch ? 50 : 1000;
      const all: PlayerRow[] = [];
      let offset = 0;

      for (;;) {
        if (cancelled) return;
        let query = supabase
          .from('players')
          .select('*')
          .eq('club_id', clubId)
          .is('recruitment_status', null)
          .eq('pending_approval', false);

        if (ageGroupId) query = query.eq('age_group_id', ageGroupId);

        // Server-side text search — each word matches name OR club
        if (debouncedSearch) {
          const words = debouncedSearch.trim().split(/\s+/).filter((w: string) => w.length >= 2);
          for (const word of words) {
            query = query.or(`name.ilike.%${word}%,club.ilike.%${word}%`);
          }
        }

        // Structural filters
        if (filters.position) {
          query = query.or(`position_normalized.eq.${filters.position},secondary_position.eq.${filters.position},tertiary_position.eq.${filters.position}`);
        }
        if (filters.club) query = query.eq('club', filters.club);
        if (filters.opinion) query = query.contains('department_opinion', [filters.opinion]);
        if (filters.foot) query = query.eq('foot', filters.foot);

        const { data, error } = await query.order('name').range(offset, offset + limit - 1);
        if (cancelled) return;
        if (error || !data?.length) break;
        all.push(...(data as PlayerRow[]));
        if (data.length < limit) break;
        if (debouncedSearch) break; // Don't paginate during text search
        offset += limit;
      }
      if (cancelled) return;
      setPool(all.map(mapPlayerRow));

      // When text searching, also check if there are matches already in the pipeline
      if (debouncedSearch) {
        const words = debouncedSearch.trim().split(/\s+/).filter((w: string) => w.length >= 2);
        if (words.length > 0) {
          let pipelineQuery = supabase
            .from('players')
            .select('*')
            .eq('club_id', clubId)
            .not('recruitment_status', 'is', null)
            .eq('pending_approval', false);
          if (ageGroupId) pipelineQuery = pipelineQuery.eq('age_group_id', ageGroupId);
          for (const word of words) {
            pipelineQuery = pipelineQuery.or(`name.ilike.%${word}%`);
          }
          const { data: pipelineData } = await pipelineQuery.order('name').limit(10);
          setAlreadyInPipeline((pipelineData ?? []).map(mapPlayerRow));
        } else {
          setAlreadyInPipeline([]);
        }
      } else {
        setAlreadyInPipeline([]);
      }

      if (!cancelled) setLoading(false);
    }

    fetch();
    return () => { cancelled = true; };
  }, [open, clubId, ageGroupId, debouncedSearch, filters.position, filters.club, filters.opinion, filters.foot]);

  // Server-side search — just use pool directly
  const filtered = pool;

  // Client-side pagination
  const totalPages = Math.ceil(filtered.length / DIALOG_PAGE_SIZE);
  const pageResults = filtered.slice(page * DIALOG_PAGE_SIZE, (page + 1) * DIALOG_PAGE_SIZE);
  const hasFilters = filters.position || filters.club || filters.opinion || filters.foot;

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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40" />
          <Input
            placeholder="Pesquisar nome, clube ou posição..."
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

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>

        {/* Results count + pagination info */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? 'A procurar…' : (
              <>
                {filtered.length} jogador{filtered.length !== 1 ? 'es' : ''}
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
            <div key={player.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{player.name}</p>
                  <OpinionBadge opinion={player.departmentOpinion[0] ?? null} className="shrink-0" />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {player.club}
                  {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                  {player.foot ? ` · ${player.foot}` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAdd(player)}>
                Adicionar
              </Button>
            </div>
          ))}
          {/* Players already in pipeline — shown when searching */}
          {!loading && alreadyInPipeline.length > 0 && (
            <>
              <div className="border-t pt-2 mt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Já nas abordagens</p>
              </div>
              {alreadyInPipeline.map((player) => (
                <div key={player.id} className="flex items-center gap-2 rounded-md border border-dashed border-neutral-200 bg-neutral-50/50 p-2 opacity-70">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{player.name}</p>
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-px text-[10px] font-medium text-blue-600">
                        {RECRUITMENT_LABEL_MAP[player.recruitmentStatus as keyof typeof RECRUITMENT_LABEL_MAP] ?? player.recruitmentStatus}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {player.club}
                      {player.positionNormalized ? ` · ${player.positionNormalized}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

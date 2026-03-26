// src/components/squad/SquadPanelView.tsx
// Squad panel view (real OR shadow) — used by /campo/real, /campo/sombra, and /campo/[squadId]
// Real: SquadSelector navigator (1 squad at a time). Shadow: AgeGroupSelector (year), stack if 2+ squads.
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/AddToSquadDialog.tsx, src/actions/squads.ts

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePageAgeGroup } from '@/hooks/usePageAgeGroup';
import { createClient } from '@/lib/supabase/client';
import { mapPlayerRow, mapSquadRow } from '@/lib/supabase/mappers';
import { SQUAD_SLOT_CODES, SPECIAL_SQUAD_SECTIONS, SPECIAL_SECTION_LABELS, isSpecialSection } from '@/lib/constants';
import type { SpecialSquadSection } from '@/lib/constants';
import { LayoutGrid, List, Columns2 } from 'lucide-react';
import { PageSpinner } from '@/components/ui/page-spinner';
import { AgeGroupSelector } from '@/components/layout/AgeGroupSelector';
import { SquadSelector } from '@/components/squad/SquadSelector';
import { FormationView, type DragEndInfo } from '@/components/squad/FormationView';
import { SquadListView } from '@/components/squad/SquadListView';
import { SquadCompareView } from '@/components/squad/SquadCompareView';
import { AddToSquadDialog } from '@/components/squad/AddToSquadDialog';
import { SquadSpecialSection } from '@/components/squad/SquadSpecialSection';
import {
  addToShadowSquad, removeFromShadowSquad, toggleRealSquad,
  addPlayerToSquad, removePlayerFromSquad,
  bulkReorderSquad, moveSquadPlayerPosition,
  toggleSquadPlayerDoubt,
} from '@/actions/squads';
import { SquadExportMenu } from '@/components/squad/SquadExportMenu';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import type { Player, PickerPlayer, PlayerRow, Squad, SquadRow, SquadType } from '@/lib/types';

type ViewMode = 'campo' | 'lista' | 'comparar';
type SquadPlayersMap = Map<number, { position: string; sortOrder: number; isDoubt: boolean }>;

const VIEW_MODE_KEY_PREFIX = 'eskout-view-';
const SQUAD_SELECTION_KEY_PREFIX = 'eskout-squad-';

/** Read persisted view mode from localStorage */
function getStoredViewMode(squadType: string): ViewMode {
  if (typeof window === 'undefined') return 'campo';
  const stored = localStorage.getItem(`${VIEW_MODE_KEY_PREFIX}${squadType}`);
  if (stored === 'lista' || stored === 'comparar') return stored;
  return 'campo';
}

/** Read persisted squad selection from localStorage */
function getStoredSquadId(squadType: string): number | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${SQUAD_SELECTION_KEY_PREFIX}${squadType}`);
  if (!stored) return null;
  const num = Number(stored);
  return Number.isFinite(num) ? num : null;
}

/** Result of grouping squad players by position + special sections */
interface ComputedSquadLayout {
  byPosition: Record<string, Player[]>;
  specialSections: Record<string, Player[]>;
}

/** Group players by squad slot position from a squad_players map */
function computeByPosition(
  playerMap: SquadPlayersMap,
  allPlayers: Player[]
): ComputedSquadLayout {
  const map: Record<string, Player[]> = {};
  for (const slot of SQUAD_SLOT_CODES) map[slot] = [];
  const sections: Record<string, Player[]> = { DUVIDA: [], POSSIBILIDADE: [] };

  for (const [playerId, sp] of playerMap) {
    const player = allPlayers.find((p) => p.id === playerId);
    if (!player) continue;
    // Stamp squad-context doubt flag onto the player object for rendering
    const stamped = sp.isDoubt ? { ...player, isDoubt: true } : player;
    const pos = sp.position;

    // Special sections — not on the pitch
    if (isSpecialSection(pos)) {
      sections[pos].push(stamped);
      continue;
    }

    if (pos === 'DC') {
      const dcE = map['DC_E'] ?? []; const dcD = map['DC_D'] ?? [];
      if (dcE.length <= dcD.length) { dcE.push(stamped); map['DC_E'] = dcE; }
      else { dcD.push(stamped); map['DC_D'] = dcD; }
    } else if (map[pos]) {
      map[pos].push(stamped);
    }
  }

  for (const slot of SQUAD_SLOT_CODES) {
    map[slot]?.sort((a, b) => (playerMap.get(a.id)?.sortOrder ?? 0) - (playerMap.get(b.id)?.sortOrder ?? 0));
  }
  // Sort special sections by sort_order
  for (const key of SPECIAL_SQUAD_SECTIONS) {
    sections[key].sort((a, b) => (playerMap.get(a.id)?.sortOrder ?? 0) - (playerMap.get(b.id)?.sortOrder ?? 0));
  }

  return { byPosition: map, specialSections: sections };
}

/** Group players by position using legacy boolean flags on players */
function computeLegacyByPosition(players: Player[], squadType: SquadType): Record<string, Player[]> {
  const map: Record<string, Player[]> = {};
  for (const slot of SQUAD_SLOT_CODES) map[slot] = [];
  const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';

  for (const p of players) {
    if (squadType === 'real' && p.isRealSquad && p.realSquadPosition) {
      if (p.realSquadPosition === 'DC') {
        const dcE = map['DC_E'] ?? []; const dcD = map['DC_D'] ?? [];
        if (dcE.length <= dcD.length) { dcE.push(p); map['DC_E'] = dcE; }
        else { dcD.push(p); map['DC_D'] = dcD; }
      } else { map[p.realSquadPosition]?.push(p); }
    }
    if (squadType === 'shadow' && p.isShadowSquad && p.shadowPosition) {
      map[p.shadowPosition]?.push(p);
    }
  }
  for (const slot of SQUAD_SLOT_CODES) {
    map[slot]?.sort((a, b) => a[orderField] - b[orderField]);
  }
  return map;
}

/** RPC result shape from get_squad_panel */
interface SquadPanelData {
  squads: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  squad_players: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  players: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  shadow_age_group_ids: number[];
}

interface SquadPanelViewProps {
  squadType: SquadType;
  /** If provided, directly load this squad — used by /campo/[squadId] */
  initialSquadId?: number;
  /** Active club ID — used to scope all queries to the current club */
  clubId: string;
  /** Server-rendered initial data from get_squad_panel RPC — enables instant render */
  initialData?: SquadPanelData | null;
}

export function SquadPanelView({ squadType, initialSquadId, clubId, initialData }: SquadPanelViewProps) {
  const router = useRouter();
  const { ageGroups, selectedId, setSelectedId } = usePageAgeGroup({
    pageId: `squad-${squadType}`,
  });
  // Initialize from server-rendered data when available (instant render, no loading)
  const [allPlayers, setAllPlayers] = useState<Player[]>(() => {
    if (!initialData?.players?.length) return [];
    return (initialData.players as PlayerRow[]).map(mapPlayerRow);
  });
  const [initialLoading, setInitialLoading] = useState(!initialData?.squads?.length);
  // squadsLoaded removed — initialLoading handles the loading state

  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode(squadType));
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(`${VIEW_MODE_KEY_PREFIX}${squadType}`, mode);
  }, [squadType]);

  // Dialog state — which squad + position is the add dialog targeting
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPosition, setDialogPosition] = useState<string>('GR');
  const [dialogSquadId, setDialogSquadId] = useState<number | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const squadContentRef = useRef<HTMLDivElement>(null);
  const mutationGuardRef = useRef(0);
  const markMutation = useCallback(() => { mutationGuardRef.current = Date.now(); }, []);

  /* ───────────── Squads state ───────────── */

  const [squads, setSquads] = useState<Squad[]>(() => {
    if (!initialData?.squads?.length) return [];
    return (initialData.squads as SquadRow[]).map(mapSquadRow);
  });
  // For real squads: which squad is currently selected in the navigator
  // Priority: initialSquadId (direct link) > localStorage > null
  const [selectedSquadId, setSelectedSquadIdState] = useState<number | null>(
    () => {
      const stored = initialSquadId ?? getStoredSquadId(squadType);
      if (stored) return stored;
      // Auto-select first real squad from server data
      if (squadType === 'real' && initialData?.squads?.[0]) return initialData.squads[0].id;
      return null;
    }
  );
  /** Persist squad selection to localStorage when changed */
  const setSelectedSquadId = useCallback((idOrFn: number | null | ((prev: number | null) => number | null)) => {
    setSelectedSquadIdState((prev) => {
      const id = typeof idOrFn === 'function' ? idOrFn(prev) : idOrFn;
      if (id != null) {
        localStorage.setItem(`${SQUAD_SELECTION_KEY_PREFIX}${squadType}`, String(id));
      }
      return id;
    });
  }, [squadType]);
  // Map<squadId, Map<playerId, { position, sortOrder }>>
  const [allSquadPlayersMap, setAllSquadPlayersMap] = useState<Map<number, SquadPlayersMap>>(() => {
    if (!initialData?.squad_players?.length) return new Map();
    const map = new Map<number, SquadPlayersMap>();
    for (const row of initialData.squad_players) {
      if (!map.has(row.squad_id)) map.set(row.squad_id, new Map());
      map.get(row.squad_id)!.set(row.player_id, { position: row.position, sortOrder: row.sort_order, isDoubt: row.is_doubt ?? false });
    }
    return map;
  });
  // Age group IDs that have shadow squads — for filtering the AgeGroupSelector
  const [shadowAgeGroupIds, setShadowAgeGroupIds] = useState<Set<number> | null>(() => {
    if (!initialData?.shadow_age_group_ids?.length) return null;
    return new Set(initialData.shadow_age_group_ids);
  });
  // Compare view state
  const [otherSquads, setOtherSquads] = useState<Squad[]>([]);
  const [compareRightId, setCompareRightId] = useState<number | null>(null);
  const [compareLeftId, setCompareLeftId] = useState<number | null>(null);
  const [otherSquadPlayersMap, setOtherSquadPlayersMap] = useState<SquadPlayersMap>(new Map());

  // Players filtered by selected age group — for legacy + shadow path
  const players = useMemo(
    () => selectedId ? allPlayers.filter((p) => p.ageGroupId === selectedId) : [],
    [allPlayers, selectedId]
  );

  const handlePlayerClick = useCallback((playerId: number) => {
    router.push(`/jogadores/${playerId}`);
  }, [router]);

  /* ───────────── Unified fetch via RPC (squads + squad_players + players in 1 call) ───────────── */

  const hasServerData = useRef(!!initialData?.squads?.length);

  /** Single RPC call that replaces 3 sequential fetches (squads → squad_players → players) */
  const fetchAllSquadData = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_squad_panel', {
      p_club_id: clubId,
      p_squad_type: squadType,
      p_age_group_id: (squadType === 'shadow' && selectedId) ? selectedId : null,
      p_squad_id: initialSquadId ?? null,
    });

    if (error || !data) {
      setSquads([]); setAllSquadPlayersMap(new Map()); setAllPlayers([]);
      setInitialLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data as any;

    // Map squads
    const mappedSquads = ((result.squads ?? []) as SquadRow[]).map(mapSquadRow);
    setSquads(mappedSquads);
    // squadsLoaded removed

    // Map squad_players into per-squad maps
    const spMap = new Map<number, SquadPlayersMap>();
    for (const row of result.squad_players ?? []) {
      if (!spMap.has(row.squad_id)) spMap.set(row.squad_id, new Map());
      spMap.get(row.squad_id)!.set(row.player_id, { position: row.position, sortOrder: row.sort_order, isDoubt: row.is_doubt ?? false });
    }
    setAllSquadPlayersMap(spMap);

    // Map players
    const mappedPlayers = ((result.players ?? []) as PlayerRow[]).map(mapPlayerRow);
    setAllPlayers(mappedPlayers);
    setInitialLoading(false);

    // Update shadow age group IDs
    if (result.shadow_age_group_ids?.length) {
      setShadowAgeGroupIds(new Set(result.shadow_age_group_ids));
    }

    // For real squads: auto-select first if current selection is not in list
    if (squadType === 'real') {
      setSelectedSquadId((prev) => {
        const valid = mappedSquads.find((s) => s.id === prev);
        if (!valid && mappedSquads[0]) return mappedSquads[0].id;
        if (!valid) return null;
        return prev;
      });
    }
  }, [squadType, selectedId, initialSquadId, clubId, setSelectedSquadId]);

  // Track last fetched params to avoid redundant refetches (e.g. selectedId changes for real squads where it's irrelevant)
  const lastFetchParamsRef = useRef<string>('');
  useEffect(() => {
    // Build a key from the params that actually affect the query
    const ageGroupParam = (squadType === 'shadow' && selectedId) ? selectedId : null;
    const key = `${squadType}:${ageGroupParam}:${initialSquadId ?? ''}`;

    if (hasServerData.current) {
      hasServerData.current = false;
      lastFetchParamsRef.current = key;
      return;
    }
    // Skip if params haven't actually changed
    if (key === lastFetchParamsRef.current) return;
    lastFetchParamsRef.current = key;

    fetchAllSquadData();
  }, [fetchAllSquadData, squadType, selectedId, initialSquadId]);



  /* ───────────── Fetch other-side squads for compare view ───────────── */

  const fetchOtherSquads = useCallback(async () => {
    if (viewMode !== 'comparar') { setOtherSquads([]); return; }
    const supabase = createClient();
    const otherType = squadType === 'real' ? 'shadow' : 'real';

    // Shadow squads: fetch ALL (not filtered by age group) so we can show "2011 - A" labels
    const query = supabase.from('squads').select('*').eq('club_id', clubId).eq('squad_type', otherType).order('sort_order').order('name');
    const { data } = await query;
    const mapped = data ? (data as SquadRow[]).map(mapSquadRow) : [];
    setOtherSquads(mapped);

    // Auto-select first if current selection is not in list
    const valid = mapped.find((s) => s.id === compareRightId);
    if (!valid && mapped[0]) setCompareRightId(mapped[0].id);
    else if (!valid) setCompareRightId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- compareRightId excluded to avoid loop
  }, [viewMode, squadType, clubId]);

  useEffect(() => { fetchOtherSquads(); }, [fetchOtherSquads]);

  // Auto-select left squad for shadow compare (first squad for the selected year)
  useEffect(() => {
    if (viewMode !== 'comparar' || squadType !== 'shadow') return;
    const valid = squads.find((s) => s.id === compareLeftId);
    if (!valid && squads[0]) setCompareLeftId(squads[0].id);
    else if (!valid) setCompareLeftId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- compareLeftId excluded to avoid loop
  }, [viewMode, squadType, squads]);

  /* ───────────── Fetch other-side squad_players for compare view ───────────── */

  const fetchOtherSquadPlayers = useCallback(async () => {
    if (!compareRightId) { setOtherSquadPlayersMap(new Map()); return; }
    const supabase = createClient();

    const { data } = await supabase
      .from('squad_players')
      .select('squad_id, player_id, position, sort_order, is_doubt')
      .eq('squad_id', compareRightId);

    if (!data) { setOtherSquadPlayersMap(new Map()); return; }

    const map: SquadPlayersMap = new Map();
    for (const row of data) {
      map.set(row.player_id, { position: row.position, sortOrder: row.sort_order, isDoubt: row.is_doubt ?? false });
    }
    setOtherSquadPlayersMap(map);
  }, [compareRightId]);

  useEffect(() => { fetchOtherSquadPlayers(); }, [fetchOtherSquadPlayers]);

  /* ───────────── Realtime ───────────── */

  const guardedFetch = useCallback(() => {
    if (Date.now() - mutationGuardRef.current < 3000) return;
    fetchAllSquadData();
    fetchOtherSquadPlayers();
  }, [fetchAllSquadData, fetchOtherSquadPlayers]);
  useRealtimeTable('players', { onAny: guardedFetch });
  useRealtimeTable('squad_players', { onAny: guardedFetch });
  useRealtimeTable('squads', { onAny: () => { fetchAllSquadData(); fetchOtherSquads(); } });

  /* ───────────── Custom vs legacy mode ───────────── */

  const hasCustomSquads = squads.length > 0;

  // Legacy byPosition (used when no custom squads exist)
  const legacyByPosition = useMemo(
    () => computeLegacyByPosition(players, squadType),
    [players, squadType]
  );

  // Other squad for compare view — custom squad_players if available, legacy fallback
  const otherByPosition = useMemo(() => {
    if (otherSquadPlayersMap.size > 0) {
      return computeByPosition(otherSquadPlayersMap, allPlayers).byPosition;
    }
    const otherType = squadType === 'shadow' ? 'real' : 'shadow';
    return computeLegacyByPosition(players, otherType);
  }, [otherSquadPlayersMap, allPlayers, players, squadType]);

  /* ───────────── Hooks that must be before early return ───────────── */

  // Dialog exclude/available players
  const dialogSquadPlayerMap = dialogSquadId ? allSquadPlayersMap.get(dialogSquadId) : null;
  const dialogExcludeIds = useMemo(() => {
    if (dialogSquadPlayerMap) return new Set(dialogSquadPlayerMap.keys());
    const ids = new Set<number>();
    for (const slot of SQUAD_SLOT_CODES) {
      for (const p of (legacyByPosition[slot] ?? [])) ids.add(p.id);
    }
    return ids;
  }, [dialogSquadPlayerMap, legacyByPosition]);

  // Visible squads with their byPosition + specialSections (for custom squads)
  const visibleSquadSections = useMemo(() => {
    if (!hasCustomSquads) return [];
    if (squadType === 'real') {
      // Single squad view for real
      const squad = squads.find((s) => s.id === selectedSquadId);
      if (!squad) return [];
      const pm = allSquadPlayersMap.get(squad.id) ?? new Map();
      const { byPosition, specialSections } = computeByPosition(pm, allPlayers);
      return [{ squad, byPos: byPosition, specialSections }];
    }
    // Shadow: all squads for age group (no special sections)
    return squads.map((squad) => {
      const pm = allSquadPlayersMap.get(squad.id) ?? new Map();
      const { byPosition } = computeByPosition(pm, allPlayers);
      return { squad, byPos: byPosition, specialSections: { DUVIDA: [], POSSIBILIDADE: [] } as Record<string, Player[]> };
    });
  }, [squads, hasCustomSquads, squadType, selectedSquadId, allSquadPlayersMap, allPlayers]);

  // Compare left byPosition — must be before early returns
  const compareLeftSquadForMemo = squadType === 'real'
    ? visibleSquadSections[0]?.squad ?? null
    : squads.find((s) => s.id === compareLeftId) ?? squads[0] ?? null;

  const compareLeftByPosition = useMemo(() => {
    if (!compareLeftSquadForMemo) return legacyByPosition;
    const pm = allSquadPlayersMap.get(compareLeftSquadForMemo.id) ?? new Map();
    return computeByPosition(pm, allPlayers).byPosition;
  }, [compareLeftSquadForMemo, allSquadPlayersMap, allPlayers, legacyByPosition]);

  /* ───────────── Handlers ───────────── */

  function handleAdd(player: PickerPlayer, pos: string, squadId: number | null) {
    markMutation();
    // Cast PickerPlayer to Player for optimistic allPlayers update — missing fields
    // are unused in formation/list rendering. fetchAllSquadData() fills them on next sync.
    const asPlayer = player as unknown as Player;

    if (squadId) {
      const squadMap = allSquadPlayersMap.get(squadId) ?? new Map();
      const maxOrder = Array.from(squadMap.values())
        .filter((sp) => sp.position === pos)
        .reduce((max, sp) => Math.max(max, sp.sortOrder), 0);
      const nextOrder = maxOrder + 1;
      setAllSquadPlayersMap((prev) => {
        const next = new Map(prev);
        const updated = new Map(next.get(squadId) ?? new Map());
        updated.set(player.id, { position: pos, sortOrder: nextOrder, isDoubt: false });
        next.set(squadId, updated);
        return next;
      });
      setAllPlayers((prev) => prev.find((p) => p.id === player.id) ? prev : [...prev, asPlayer]);
      addPlayerToSquad(squadId, player.id, pos).then((res) => {
        if (!res.success) { alert(`Erro ao adicionar: ${res.error}`); fetchAllSquadData(); fetchAllSquadData(); }
        else { fetchAllSquadData(); }
      });
    } else if (squadType === 'shadow') {
      setAllPlayers((prev) => {
        const maxOrder = prev.filter((p) => p.isShadowSquad && p.shadowPosition === pos && p.ageGroupId === selectedId)
          .reduce((max, p) => Math.max(max, p.shadowOrder), 0);
        const nextOrder = maxOrder + 1;
        const exists = prev.find((p) => p.id === player.id);
        if (exists) return prev.map((p) => p.id === player.id ? { ...p, isShadowSquad: true, shadowPosition: pos, shadowOrder: nextOrder } : p);
        return [...prev, { ...asPlayer, isShadowSquad: true, shadowPosition: pos, shadowOrder: nextOrder }];
      });
      addToShadowSquad(player.id, pos).then((res) => {
        if (!res.success) { alert(`Erro ao adicionar: ${res.error}`); fetchAllSquadData(); }
        else { fetchAllSquadData(); }
      });
    } else {
      const targetAgeGroupId = selectedId;
      setAllPlayers((prev) => {
        const maxOrder = prev.filter((p) => p.isRealSquad && p.realSquadPosition === pos && p.ageGroupId === targetAgeGroupId)
          .reduce((max, p) => Math.max(max, p.realOrder), 0);
        const nextOrder = maxOrder + 1;
        const exists = prev.find((p) => p.id === player.id);
        if (exists) return prev.map((p) => p.id === player.id ? { ...p, isRealSquad: true, realSquadPosition: pos, ageGroupId: targetAgeGroupId!, realOrder: nextOrder } : p);
        return [...prev, { ...asPlayer, isRealSquad: true, realSquadPosition: pos, ageGroupId: targetAgeGroupId!, realOrder: nextOrder }];
      });
      toggleRealSquad(player.id, true, pos, targetAgeGroupId ?? undefined).then((res) => {
        if (!res.success) { alert(`Erro ao adicionar: ${res.error}`); fetchAllSquadData(); }
        else { fetchAllSquadData(); }
      });
    }
  }

  function handleRemove(playerId: number, squadId: number | null) {
    markMutation();
    if (squadId) {
      setAllSquadPlayersMap((prev) => {
        const next = new Map(prev);
        const updated = new Map(next.get(squadId) ?? new Map());
        updated.delete(playerId);
        next.set(squadId, updated);
        return next;
      });
      removePlayerFromSquad(squadId, playerId).then((res) => {
        if (!res.success) { fetchAllSquadData(); fetchAllSquadData(); }
      });
    } else if (squadType === 'shadow') {
      setAllPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isShadowSquad: false, shadowPosition: null } : p));
      removeFromShadowSquad(playerId);
    } else {
      setAllPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isRealSquad: false, realSquadPosition: null } : p));
      toggleRealSquad(playerId, false);
    }
  }

  function handleDragEnd(info: DragEndInfo, squadId: number | null, byPos: Record<string, Player[]>) {
    markMutation();
    const { playerId, sourcePosition, targetPosition, newIndex } = info;
    const squadMap = squadId ? allSquadPlayersMap.get(squadId) : null;

    if (sourcePosition === targetPosition) {
      const currentList = [...(byPos[sourcePosition] ?? [])];
      const draggedIdx = currentList.findIndex((p) => p.id === playerId);
      if (draggedIdx < 0 || draggedIdx === newIndex) return;
      const [moved] = currentList.splice(draggedIdx, 1);
      currentList.splice(newIndex, 0, moved);
      const updates = currentList.map((p, i) => ({ playerId: p.id, order: i }));

      if (squadId && squadMap) {
        setAllSquadPlayersMap((prev) => {
          const next = new Map(prev);
          const updated = new Map(next.get(squadId) ?? new Map());
          for (const { playerId: pid, order } of updates) {
            const existing = updated.get(pid);
            if (existing) updated.set(pid, { ...existing, sortOrder: order });
          }
          next.set(squadId, updated);
          return next;
        });
        bulkReorderSquad(updates, squadType, squadId);
      } else {
        const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';
        setAllPlayers((prev) => prev.map((p) => {
          const upd = updates.find((u) => u.playerId === p.id);
          return upd ? { ...p, [orderField]: upd.order } : p;
        }));
        bulkReorderSquad(updates, squadType);
      }
    } else {
      const dbPosition = targetPosition;
      if (squadId && squadMap) {
        const targetList = (byPos[dbPosition] ?? []).filter((p) => p.id !== playerId);
        const insertAt = Math.min(newIndex, targetList.length);
        const movedPlayer = allPlayers.find((p) => p.id === playerId);
        if (movedPlayer) targetList.splice(insertAt, 0, movedPlayer);
        setAllSquadPlayersMap((prev) => {
          const next = new Map(prev);
          const updated = new Map(next.get(squadId) ?? new Map());
          const existing = updated.get(playerId);
          if (existing) updated.set(playerId, { ...existing, position: dbPosition, sortOrder: insertAt });
          targetList.forEach((p, i) => { const sp = updated.get(p.id); if (sp) updated.set(p.id, { ...sp, sortOrder: i }); });
          next.set(squadId, updated);
          return next;
        });
        const reorderUpdates = targetList.map((p, i) => ({ playerId: p.id, order: i }));
        moveSquadPlayerPosition(playerId, dbPosition, insertAt, squadType, squadId).then((res) => {
          if (!res.success) { fetchAllSquadData(); return; }
          bulkReorderSquad(reorderUpdates, squadType, squadId);
        });
      } else {
        const orderField = squadType === 'shadow' ? 'shadowOrder' : 'realOrder';
        const posField = squadType === 'shadow' ? 'shadowPosition' : 'realSquadPosition';
        const targetList = (byPos[dbPosition] ?? []).filter((p) => p.id !== playerId);
        const insertAt = Math.min(newIndex, targetList.length);
        const movedPlayer = allPlayers.find((p) => p.id === playerId);
        if (movedPlayer) targetList.splice(insertAt, 0, movedPlayer);
        const orderMap = new Map<number, number>();
        targetList.forEach((p, i) => orderMap.set(p.id, i));
        setAllPlayers((prev) => prev.map((p) => {
          if (p.id === playerId) return { ...p, [posField]: dbPosition, [orderField]: insertAt };
          const newOrd = orderMap.get(p.id);
          return newOrd !== undefined ? { ...p, [orderField]: newOrd } : p;
        }));
        const reorderUpdates = targetList.map((p, i) => ({ playerId: p.id, order: i }));
        moveSquadPlayerPosition(playerId, dbPosition, insertAt, squadType).then((res) => {
          if (!res.success) { fetchAllSquadData(); return; }
          bulkReorderSquad(reorderUpdates, squadType);
        });
      }
    }
  }

  /* ───────────── Doubt toggle ───────────── */

  function handleToggleDoubt(playerId: number, squadId: number | null, isDoubt: boolean) {
    if (!squadId) return; // Legacy squads don't support doubt
    markMutation();
    // Optimistic update
    setAllSquadPlayersMap((prev) => {
      const next = new Map(prev);
      const updated = new Map(next.get(squadId) ?? new Map());
      const existing = updated.get(playerId);
      if (existing) updated.set(playerId, { ...existing, isDoubt });
      next.set(squadId, updated);
      return next;
    });
    toggleSquadPlayerDoubt(squadId, playerId, isDoubt).then((res) => {
      if (!res.success) fetchAllSquadData(); // Revert on failure
    });
  }

  /** Move a player from a pitch position to a special section (DUVIDA / POSSIBILIDADE) */
  function handleMoveToSection(playerId: number, squadId: number | null, section: string) {
    if (!squadId) return;
    markMutation();
    // Optimistic: change the player's position in the map
    setAllSquadPlayersMap((prev) => {
      const next = new Map(prev);
      const updated = new Map(next.get(squadId) ?? new Map());
      const existing = updated.get(playerId);
      if (existing) updated.set(playerId, { ...existing, position: section, sortOrder: 999 });
      next.set(squadId, updated);
      return next;
    });
    moveSquadPlayerPosition(playerId, section, 999, squadType, squadId).then((res) => {
      if (!res.success) fetchAllSquadData();
    });
  }

  /* ───────────── Render ───────────── */

  const labelFn = squadType === 'shadow'
    ? (ag: { generationYear: number }) => String(ag.generationYear)
    : undefined;

  // For shadow: only show age groups that have squads created
  const filteredAgeGroups = useMemo(() => {
    if (squadType !== 'shadow' || !shadowAgeGroupIds) return ageGroups;
    return ageGroups.filter((ag) => shadowAgeGroupIds.has(ag.id));
  }, [squadType, ageGroups, shadowAgeGroupIds]);

  // Shadow: no age group selected yet
  if (squadType === 'shadow' && !selectedId && !initialSquadId) {
    return (
      <div className="space-y-4">
        <AgeGroupSelector showAll={false} variant="navigator" value={selectedId} onChange={setSelectedId} ageGroups={filteredAgeGroups} labelFn={labelFn} />
        <p className="text-muted-foreground">Selecione um escalão para ver o plantel.</p>
      </div>
    );
  }

  const selectedAgeGroup = ageGroups.find((ag) => ag.id === selectedId);
  const ageGroupLabel = selectedAgeGroup
    ? (squadType === 'shadow' ? String(selectedAgeGroup.generationYear) : selectedAgeGroup.name)
    : '';

  /** Render one squad's formation/list */
  function renderSquadContent(squad: Squad, byPos: Record<string, Player[]>, showName: boolean, sections?: Record<string, Player[]>) {
    const openAdd = (pos: string) => { setDialogPosition(pos); setDialogSquadId(squad.id); setDialogOpen(true); };
    const remove = (pid: number) => handleRemove(pid, squad.id);
    const dragEnd = (info: DragEndInfo) => handleDragEnd(info, squad.id, byPos);
    const toggleDoubt = (pid: number, isDoubt: boolean) => handleToggleDoubt(pid, squad.id, isDoubt);
    const moveToSection = squadType === 'real'
      ? (pid: number, section: SpecialSquadSection) => handleMoveToSection(pid, squad.id, section)
      : undefined;
    const exportData = { squadType, ageGroupLabel, byPosition: byPos, squadName: squad.name };

    // Player counts — pitch only (special sections show their own counts)
    const pitchPlayers = Object.values(byPos).flat();
    const totalCount = pitchPlayers.length;
    const doubtCount = pitchPlayers.filter((p) => p.isDoubt).length;

    return (
      <div key={squad.id} className="space-y-4">
        {(showName || squadType === 'shadow' || squad.description) && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(showName || squadType === 'shadow') && (
                <h3 className={squadType === 'shadow'
                  ? 'rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:bg-neutral-800'
                  : 'text-sm font-semibold text-foreground'}
                >{squad.name}</h3>
              )}
              {squad.description && (
                <Badge variant="secondary" className="rounded-md px-3 py-1 text-sm uppercase tracking-wide">
                  {squad.description}
                </Badge>
              )}
              {/* Player count + doubt count */}
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900">
                  {totalCount}
                  <span className="font-normal opacity-70">{totalCount === 1 ? 'atleta' : 'atletas'}</span>
                </span>
                {doubtCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
                    {doubtCount}
                    <span className="font-normal opacity-80">{doubtCount === 1 ? 'dúvida' : 'dúvidas'}</span>
                  </span>
                )}
              </div>
            </div>
            {/* Per-squad export — only shown when multiple squads visible (single squad uses global export) */}
            {visibleSquadSections.length > 1 && (
              <SquadExportMenu data={exportData} captureRef={squadContentRef} />
            )}
          </div>
        )}
        {viewMode === 'campo' && (
          <>
            {mounted ? (
              <FormationView byPosition={byPos} squadType={squadType} onAdd={openAdd} onRemovePlayer={remove} onPlayerClick={handlePlayerClick} onDragEnd={dragEnd} onToggleDoubt={toggleDoubt} onMoveToSection={moveToSection} specialSections={sections}>
                {/* Special sections inside DndContext — enables drag from pitch to sections */}
                {squadType === 'real' && sections && (
                  <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                    {SPECIAL_SQUAD_SECTIONS.map((sectionKey) => (
                      <SquadSpecialSection
                        key={sectionKey}
                        sectionKey={sectionKey}
                        label={SPECIAL_SECTION_LABELS[sectionKey]}
                        players={sections[sectionKey] ?? []}
                        onAdd={() => openAdd(sectionKey)}
                        onRemovePlayer={remove}
                      />
                    ))}
                  </div>
                )}
              </FormationView>
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded-xl bg-green-700">
                <span className="text-sm text-white/60">A carregar campo...</span>
              </div>
            )}
            {squadType === 'shadow' && (
              <p data-export-hide className="text-center text-xs text-muted-foreground italic">
                Jogadores mais acima = primeira opção. Arraste para reordenar.
              </p>
            )}
          </>
        )}
        {viewMode === 'lista' && (
          <>
            <SquadListView byPosition={byPos} squadType={squadType} onAdd={openAdd} onRemovePlayer={remove} onPlayerClick={handlePlayerClick} onToggleDoubt={toggleDoubt} />
            {/* Special sections for list view — outside DnD (no drag in list view) */}
            {squadType === 'real' && sections && (
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                {SPECIAL_SQUAD_SECTIONS.map((sectionKey) => (
                  <SquadSpecialSection
                    key={sectionKey}
                    sectionKey={sectionKey}
                    label={SPECIAL_SECTION_LABELS[sectionKey]}
                    players={sections[sectionKey] ?? []}
                    onAdd={() => openAdd(sectionKey)}
                    onRemovePlayer={remove}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /** Render legacy squad content (no custom squads) */
  function renderLegacyContent() {
    const openAdd = (pos: string) => { setDialogPosition(pos); setDialogSquadId(null); setDialogOpen(true); };
    const remove = (pid: number) => handleRemove(pid, null);
    const dragEnd = (info: DragEndInfo) => handleDragEnd(info, null, legacyByPosition);

    return (
      <>
        {viewMode === 'campo' && (
          <>
            {mounted ? (
              <FormationView byPosition={legacyByPosition} squadType={squadType} onAdd={openAdd} onRemovePlayer={remove} onPlayerClick={handlePlayerClick} onDragEnd={dragEnd} />
            ) : (
              <div className="flex h-[520px] items-center justify-center rounded-xl bg-green-700">
                <span className="text-sm text-white/60">A carregar campo...</span>
              </div>
            )}
            {squadType === 'shadow' && (
              <p data-export-hide className="text-center text-xs text-muted-foreground italic">
                Jogadores mais acima = primeira opção. Arraste para reordenar.
              </p>
            )}
          </>
        )}
        {viewMode === 'lista' && (
          <SquadListView byPosition={legacyByPosition} squadType={squadType} onAdd={openAdd} onRemovePlayer={remove} onPlayerClick={handlePlayerClick} />
        )}
      </>
    );
  }

  /* ───────────── Compare view data ───────────── */

  /** Build a display label for a squad — "Plantel Sub-15" or "Sombra 2011 — A" */
  function squadDisplayLabel(squad: Squad): string {
    if (squad.squadType === 'shadow' && squad.ageGroupId) {
      const ag = ageGroups.find((a) => a.id === squad.ageGroupId);
      if (ag) return `Sombra ${ag.generationYear} — ${squad.name}`;
      return `Sombra ${squad.name}`;
    }
    return `Plantel ${squad.name}`;
  }

  // Left side: for real → the selected squad; for shadow → pick from squads for this year
  const compareLeftSquad = squadType === 'real'
    ? visibleSquadSections[0]?.squad ?? null
    : squads.find((s) => s.id === compareLeftId) ?? squads[0] ?? null;

  // Left squads available (for shadow compare — lets user pick which shadow squad)
  const compareLeftSquads = squadType === 'shadow' ? squads : [];

  // Right side: other-type squad selected via compareRightId
  // otherByPosition already computed from otherSquadPlayersMap

  const singleExportData = {
    squadType, ageGroupLabel,
    byPosition: compareLeftByPosition,
    squadName: visibleSquadSections[0]?.squad.name,
  };

  /* ───────────── Wait for data before rendering ───────────── */

  if (initialLoading) {
    return <PageSpinner />;
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-transparent bg-card px-4 pb-2 pt-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)] lg:-mx-6 lg:px-6">
        <div className="flex items-center justify-between gap-2">
          {/* Navigator: Real → SquadSelector, Shadow → AgeGroupSelector */}
          <div className="flex items-center gap-2">
            {squadType === 'real' ? (
              <SquadSelector squads={squads} selectedSquadId={selectedSquadId} onSelect={setSelectedSquadId} />
            ) : (
              <AgeGroupSelector showAll={false} variant="navigator" value={selectedId} onChange={setSelectedId} ageGroups={filteredAgeGroups} labelFn={labelFn} />
            )}
          </div>

          {/* View mode toggle + export */}
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 rounded-lg border bg-card p-0.5">
              {([
                { mode: 'campo' as ViewMode, icon: LayoutGrid, label: 'Campo' },
                { mode: 'lista' as ViewMode, icon: List, label: 'Lista' },
                { mode: 'comparar' as ViewMode, icon: Columns2, label: 'Comparar' },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === mode ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            {visibleSquadSections.length <= 1 && (
              <SquadExportMenu data={singleExportData} captureRef={squadContentRef} />
            )}
          </div>
        </div>
      </div>

      {/* ───────────── Squad content ───────────── */}
      <div ref={squadContentRef} className="space-y-8">

        {/* Custom squads — campo/lista views */}
        {hasCustomSquads && viewMode !== 'comparar' && (
          visibleSquadSections.length > 0
            ? visibleSquadSections.map(({ squad, byPos, specialSections }) =>
                renderSquadContent(squad, byPos, visibleSquadSections.length > 1, specialSections)
              )
            : (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum plantel criado para este escalão.
              </p>
            )
        )}

        {/* Legacy fallback — campo/lista views */}
        {!hasCustomSquads && viewMode !== 'comparar' && renderLegacyContent()}

        {/* Compare view — left squad vs right squad with selectors */}
        {viewMode === 'comparar' && (
          <SquadCompareView
            leftByPosition={compareLeftByPosition}
            leftHeader={
              compareLeftSquads.length > 1 ? (
                <Select
                  value={compareLeftId != null ? String(compareLeftId) : undefined}
                  onValueChange={(v) => setCompareLeftId(Number(v) || null)}
                >
                  <SelectTrigger className="h-auto w-full border-0 bg-transparent px-0 py-0 text-xs font-bold uppercase tracking-wide shadow-none ring-0 focus-visible:ring-0 [&_svg]:opacity-70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="center">
                    {compareLeftSquads.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{squadDisplayLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{compareLeftSquad ? squadDisplayLabel(compareLeftSquad) : (squadType === 'real' ? 'Plantel' : 'Plantel Sombra')}</span>
              )
            }
            rightByPosition={otherByPosition}
            rightHeader={
              otherSquads.length > 1 ? (
                <Select
                  value={compareRightId != null ? String(compareRightId) : undefined}
                  onValueChange={(v) => setCompareRightId(Number(v) || null)}
                >
                  <SelectTrigger className="h-auto w-full border-0 bg-transparent px-0 py-0 text-xs font-bold uppercase tracking-wide shadow-none ring-0 focus-visible:ring-0 [&_svg]:opacity-70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="center">
                    {otherSquads.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{squadDisplayLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : otherSquads[0] ? (
                <span>{squadDisplayLabel(otherSquads[0])}</span>
              ) : (
                <span className="text-muted-foreground">Sem plantéis</span>
              )
            }
            leftTint={squadType === 'real' ? 'green' : 'blue'}
            rightTint={squadType === 'real' ? 'blue' : 'green'}
            rankSide={squadType === 'real' ? 'right' : 'left'}
          />
        )}

      </div>

      <AddToSquadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={dialogPosition}
        squadType={squadType}
        excludeIds={dialogExcludeIds}
        initialYear={selectedAgeGroup ? String(selectedAgeGroup.generationYear) : undefined}
        onAddPlayer={(player) => { handleAdd(player, dialogPosition, dialogSquadId); setDialogOpen(false); }}
      />

    </div>
  );
}

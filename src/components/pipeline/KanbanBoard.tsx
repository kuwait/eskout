// src/components/pipeline/KanbanBoard.tsx
// Desktop Kanban board with @dnd-kit for card reorder/move AND column reorder
// Cards drag within/between columns; columns drag via grip handle in header
// RELEVANT FILES: src/components/pipeline/StatusColumn.tsx, src/components/pipeline/PipelineView.tsx, src/lib/constants.ts

'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SortableStatusColumn } from '@/components/pipeline/StatusColumn';
import { PipelineCard } from '@/components/pipeline/PipelineCard';
import { RECRUITMENT_STATUSES } from '@/lib/constants';
import type { Player, RecruitmentStatus } from '@/lib/types';

/* ───────────── localStorage key for column order ───────────── */

const COLUMN_ORDER_KEY = 'eskout-pipeline-column-order';
const DEFAULT_ORDER = RECRUITMENT_STATUSES.map((s) => s.value);

/** Load column order from localStorage, falling back to default */
function loadColumnOrder(): RecruitmentStatus[] {
  if (typeof window === 'undefined') return DEFAULT_ORDER;
  try {
    const stored = localStorage.getItem(COLUMN_ORDER_KEY);
    if (!stored) return DEFAULT_ORDER;
    const parsed = JSON.parse(stored) as string[];
    // Validate: must contain exactly the same statuses (handles added/removed statuses)
    const defaultSet = new Set(DEFAULT_ORDER);
    const storedSet = new Set(parsed);
    if (defaultSet.size !== storedSet.size || [...defaultSet].some((s) => !storedSet.has(s))) {
      return DEFAULT_ORDER;
    }
    return parsed as RecruitmentStatus[];
  } catch {
    return DEFAULT_ORDER;
  }
}

function saveColumnOrder(order: RecruitmentStatus[]) {
  try {
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(order));
  } catch { /* quota exceeded — ignore */ }
}

/* ───────────── Types ───────────── */

interface KanbanBoardProps {
  playersByStatus: Record<RecruitmentStatus, Player[]>;
  onStatusChange: (playerId: number, newStatus: RecruitmentStatus) => void;
  onRemove: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
  /** Callback for reorder after drag-and-drop within/between columns */
  onReorder: (updates: { playerId: number; order: number }[]) => void;
  /** Show birth year on cards (when viewing all age groups) */
  showBirthYear?: boolean;
  /** Open player profile popup */
  onPlayerClick?: (playerId: number) => void;
  /** Club-scoped profiles for contact assignment in em_contacto cards */
  clubMembers?: { id: string; fullName: string }[];
}

/* ───────────── ID helpers ───────────── */

/** Parse card drag ID: "pipeline-{playerId}-{status}" */
function parseDragId(id: string): { playerId: number; status: RecruitmentStatus } | null {
  const match = id.match(/^pipeline-(\d+)-(.+)$/);
  if (!match) return null;
  return { playerId: parseInt(match[1], 10), status: match[2] as RecruitmentStatus };
}

/** Parse column drag ID: "column-{status}" */
function parseColumnId(id: string): RecruitmentStatus | null {
  const match = id.match(/^column-(.+)$/);
  return match ? (match[1] as RecruitmentStatus) : null;
}

/** Find which status column an item or droppable belongs to */
function resolveStatus(id: string): RecruitmentStatus | null {
  // Droppable zone: "status-{value}"
  const statusMatch = id.match(/^status-(.+)$/);
  if (statusMatch) return statusMatch[1] as RecruitmentStatus;
  // Column sortable wrapper: "column-{value}"
  const columnStatus = parseColumnId(id);
  if (columnStatus) return columnStatus;
  // Card: "pipeline-{playerId}-{status}"
  const parsed = parseDragId(id);
  return parsed?.status ?? null;
}

/* ───────────── Component ───────────── */

/** true when viewport ≥ 768px (md breakpoint) */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial read from external media query system
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function KanbanBoard({ playersByStatus, onStatusChange, onRemove, onDateChange, onReorder, showBirthYear, onPlayerClick, clubMembers = [] }: KanbanBoardProps) {
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<RecruitmentStatus[]>(DEFAULT_ORDER);
  const isDragging = activePlayer !== null || activeColumnId !== null;
  const isDesktop = useIsDesktop();

  // Load persisted column order from localStorage after hydration to avoid SSR mismatch
  // eslint-disable-next-line react-hooks/set-state-in-effect -- deferred read from localStorage after mount
  useEffect(() => { setColumnOrder(loadColumnOrder()); }, []);

  // Lock body scroll while dragging to prevent scroll interference on mobile
  useEffect(() => {
    if (!isDragging) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isDragging]);

  // Require movement before activating — prevents accidental drags on tap
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);

    // Column drag
    if (id.startsWith('column-')) {
      setActiveColumnId(id);
      setActivePlayer(null);
      return;
    }

    // Card drag
    setActiveColumnId(null);
    const parsed = parseDragId(id);
    if (!parsed) return;
    const players = playersByStatus[parsed.status] ?? [];
    const player = players.find((p) => p.id === parsed.playerId);
    setActivePlayer(player ?? null);
  }, [playersByStatus]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const wasColumnDrag = activeColumnId !== null;
    setActivePlayer(null);
    setActiveColumnId(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    /* ───── Column reorder ───── */
    if (wasColumnDrag) {
      const fromStatus = parseColumnId(activeId);
      // over.id could be column-*, status-*, or pipeline-* — resolve all to a status
      const toStatus = parseColumnId(overId) ?? resolveStatus(overId);
      if (!fromStatus || !toStatus || fromStatus === toStatus) return;

      setColumnOrder((prev) => {
        const oldIdx = prev.indexOf(fromStatus);
        const newIdx = prev.indexOf(toStatus);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(prev, oldIdx, newIdx);
        saveColumnOrder(next);
        return next;
      });
      return;
    }

    /* ───── Card reorder / cross-column move ───── */
    const source = parseDragId(activeId);
    if (!source) { console.log('[DND] parseDragId failed for:', activeId); return; }

    const targetStatus = resolveStatus(overId);
    console.log('[DND] drag end:', { activeId, overId, sourceStatus: source.status, targetStatus, isSameColumn: source.status === targetStatus });
    if (!targetStatus) { console.log('[DND] resolveStatus returned null for overId:', overId); return; }

    const isSameColumn = source.status === targetStatus;

    if (isSameColumn) {
      const column = playersByStatus[source.status] ?? [];
      const oldIndex = column.findIndex((p) => p.id === source.playerId);
      const targetParsed = parseDragId(overId);
      const newIndex = targetParsed
        ? column.findIndex((p) => p.id === targetParsed.playerId)
        : column.length - 1;

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(column, oldIndex, newIndex);
      const updates = reordered.map((p, i) => ({ playerId: p.id, order: i }));
      onReorder(updates);
    } else {
      onStatusChange(source.playerId, targetStatus);

      const targetColumn = playersByStatus[targetStatus] ?? [];
      const targetParsed = parseDragId(overId);
      let insertIndex = targetColumn.length;
      if (targetParsed) {
        const idx = targetColumn.findIndex((p) => p.id === targetParsed.playerId);
        if (idx >= 0) insertIndex = idx;
      }

      const newColumn = [...targetColumn];
      const sourceColumn = playersByStatus[source.status] ?? [];
      const movedPlayer = sourceColumn.find((p) => p.id === source.playerId);
      if (movedPlayer) {
        newColumn.splice(insertIndex, 0, movedPlayer);
      }
      const updates = newColumn.map((p, i) => ({ playerId: p.id, order: i }));
      onReorder(updates);
    }
  }, [playersByStatus, onStatusChange, onReorder, activeColumnId]);

  // Column sortable IDs
  const columnIds = columnOrder.map((s) => `column-${s}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Vertical stack on mobile, horizontal scroll on desktop */}
      {isDesktop ? (
        <ScrollArea className="w-full">
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-row gap-3 p-1 pb-4">
              {columnOrder.map((status) => (
                <SortableStatusColumn
                  key={status}
                  status={status}
                  players={playersByStatus[status] ?? []}
                  showBirthYear={showBirthYear}
                  clubMembers={clubMembers}
                  onPlayerClick={onPlayerClick}
                  onRemove={onRemove}
                  onDateChange={onDateChange}
                />
              ))}
            </div>
          </SortableContext>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <SortableContext items={columnIds} strategy={verticalListSortingStrategy}>
          <div className={`flex flex-col gap-3 pb-4 ${isDragging ? 'overflow-hidden' : ''}`}>
            {columnOrder.map((status) => (
              <SortableStatusColumn
                key={status}
                status={status}
                players={playersByStatus[status] ?? []}
                showBirthYear={showBirthYear}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
              />
            ))}
          </div>
        </SortableContext>
      )}

      {/* Ghost card that follows the cursor while dragging */}
      <DragOverlay>
        {activePlayer && (
          <div className="w-[220px] scale-105 rounded-lg shadow-xl ring-2 ring-blue-400">
            <PipelineCard player={activePlayer} />
          </div>
        )}
        {activeColumnId && (
          <div className="flex h-16 min-w-[220px] items-center justify-center rounded-lg border-2 border-blue-400 bg-neutral-100 opacity-75">
            <span className="text-xs font-medium text-muted-foreground">A mover coluna…</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

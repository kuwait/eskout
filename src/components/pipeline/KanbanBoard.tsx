// src/components/pipeline/KanbanBoard.tsx
// Desktop Kanban board with @dnd-kit for card reorder/move AND column reorder
// Cards drag within/between columns; columns drag via grip handle in header
// RELEVANT FILES: src/components/pipeline/StatusColumn.tsx, src/components/pipeline/PipelineView.tsx, src/lib/constants.ts

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SortableStatusColumn, StatusColumn } from '@/components/pipeline/StatusColumn';
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

/** Card drag IDs: "card-{playerId}" — status-agnostic for cross-container moves */
function cardId(playerId: number): string { return `card-${playerId}`; }
function parseCardId(id: string): number | null {
  const match = id.match(/^card-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/** Column sortable IDs */
function columnId(status: RecruitmentStatus): string { return `column-${status}`; }
function parseColumnId(id: string): RecruitmentStatus | null {
  const match = id.match(/^column-(.+)$/);
  return match ? (match[1] as RecruitmentStatus) : null;
}

/** Container items: status → card IDs (mirrors playersByStatus but as string arrays) */
type ContainerItems = Record<RecruitmentStatus, string[]>;

/** Build container items from player data */
function buildContainerItems(pbs: Record<RecruitmentStatus, Player[]>): ContainerItems {
  const items = {} as ContainerItems;
  for (const s of RECRUITMENT_STATUSES) {
    items[s.value] = (pbs[s.value] ?? []).map((p) => cardId(p.id));
  }
  return items;
}

/** All status values as a Set for quick lookup */
const STATUS_SET = new Set(RECRUITMENT_STATUSES.map((s) => s.value));

/** Find which container a card ID belongs to */
function findContainer(id: UniqueIdentifier, items: ContainerItems): RecruitmentStatus | null {
  const sid = String(id);
  // Direct status match (droppable zone "status-{value}")
  const statusMatch = sid.match(/^status-(.+)$/);
  if (statusMatch && STATUS_SET.has(statusMatch[1] as RecruitmentStatus)) return statusMatch[1] as RecruitmentStatus;
  // Bare status value
  if (STATUS_SET.has(sid as RecruitmentStatus)) return sid as RecruitmentStatus;
  // Column wrapper
  const col = parseColumnId(sid);
  if (col) return col;
  // Card — search containers
  for (const status of RECRUITMENT_STATUSES) {
    if (items[status.value].includes(sid)) return status.value;
  }
  return null;
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

/** Force re-measurement after cross-container DOM changes */
const MEASURING_CONFIG = {
  droppable: { strategy: MeasuringStrategy.Always as const },
};

export function KanbanBoard({ playersByStatus, onStatusChange, onRemove, onDateChange, onReorder, showBirthYear, onPlayerClick, clubMembers = [] }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<RecruitmentStatus[]>(DEFAULT_ORDER);
  const [containerItems, setContainerItems] = useState<ContainerItems>(() => buildContainerItems(playersByStatus));
  const [clonedItems, setClonedItems] = useState<ContainerItems | null>(null);
  const isDragging = activeId !== null || activeColumnId !== null;
  const isDesktop = useIsDesktop();

  // Sync container items when props change (new data from server) and NOT dragging
  useEffect(() => {
    if (!isDragging) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from server data when not dragging
      setContainerItems(buildContainerItems(playersByStatus));
    }
  }, [playersByStatus, isDragging]);

  // Player lookup by card ID — for rendering and DragOverlay
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    for (const players of Object.values(playersByStatus)) {
      for (const p of players) map.set(cardId(p.id), p);
    }
    return map;
  }, [playersByStatus]);

  // Resolve container items to player arrays for rendering
  const displayByStatus = useMemo(() => {
    const result = {} as Record<RecruitmentStatus, Player[]>;
    for (const s of RECRUITMENT_STATUSES) {
      result[s.value] = containerItems[s.value]
        .map((cid) => playerMap.get(cid))
        .filter((p): p is Player => p !== undefined);
    }
    return result;
  }, [containerItems, playerMap]);

  // Anti-loop refs (official @dnd-kit pattern for multi-container)
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  // Reset the "recently moved" flag on next animation frame after items change
  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [containerItems]);

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

  /* ───────────── Custom collision detection (official multi-container pattern) ───────────── */

  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      // Column drag: only match against other columns
      if (activeColumnId) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => parseColumnId(String(c.id)) !== null
          ),
        });
      }

      // Card drag: pointerWithin → rectIntersection → drill down into container
      const pointerCollisions = pointerWithin(args);
      const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
      let overId = getFirstCollision(collisions, 'id');

      if (overId != null) {
        // If we matched a container (status droppable or column), drill down to closest card inside it
        const overStr = String(overId);
        const statusFromDroppable = overStr.match(/^status-(.+)$/)?.[1] as RecruitmentStatus | undefined;
        const containerStatus = statusFromDroppable
          ?? (STATUS_SET.has(overStr as RecruitmentStatus) ? (overStr as RecruitmentStatus) : null)
          ?? parseColumnId(overStr);

        if (containerStatus && containerItems[containerStatus]?.length > 0) {
          const innerCollision = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (c) => containerItems[containerStatus].includes(String(c.id))
            ),
          });
          if (innerCollision.length > 0) {
            overId = innerCollision[0].id;
          }
        }

        lastOverId.current = overId;
        return [{ id: overId }];
      }

      // Layout shift fallback — use cached lastOverId
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId, activeColumnId, containerItems]
  );

  /* ───────────── Drag handlers ───────────── */

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const id = String(active.id);

    // Column drag
    if (id.startsWith('column-')) {
      setActiveColumnId(id);
      setActiveId(null);
      setClonedItems(null);
      return;
    }

    // Card drag — snapshot items for cancel restore
    setActiveColumnId(null);
    setActiveId(active.id);
    setClonedItems(containerItems);
  }, [containerItems]);

  // Cross-container move: relocate card between SortableContexts during drag
  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over || activeColumnId) return;
    const overId = over.id;
    const activeContainer = findContainer(active.id, containerItems);
    const overContainer = findContainer(overId, containerItems);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setContainerItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.indexOf(String(active.id));
      const overIndex = overItems.indexOf(String(overId));

      // Determine insert position — above or below the hovered card
      let newIndex: number;
      const overStr = String(overId);
      if (overStr.startsWith('status-') || STATUS_SET.has(overId as RecruitmentStatus) || parseColumnId(overStr)) {
        // Dropped on empty container zone
        newIndex = overItems.length;
      } else {
        const isBelowOver =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const modifier = isBelowOver ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length;
      }

      recentlyMovedToNewContainer.current = true;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((item) => item !== String(active.id)),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItems[activeIndex],
          ...overItems.slice(newIndex),
        ],
      };
    });
  }, [activeColumnId, containerItems]);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    const wasColumnDrag = activeColumnId !== null;

    // Column drag end
    if (wasColumnDrag) {
      setActiveColumnId(null);
      setActiveId(null);
      setClonedItems(null);
      if (!over) return;

      const fromStatus = parseColumnId(String(active.id));
      const toStatus = parseColumnId(String(over.id));
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

    // Card drag end
    const activeContainer = findContainer(active.id, containerItems);
    if (!activeContainer) { setActiveId(null); setClonedItems(null); return; }

    if (!over) { setActiveId(null); setClonedItems(null); return; }

    const overContainer = findContainer(over.id, containerItems);
    if (!overContainer) { setActiveId(null); setClonedItems(null); return; }

    const playerId = parseCardId(String(active.id));
    if (playerId === null) { setActiveId(null); setClonedItems(null); return; }

    // Determine original container from cloned items (before any onDragOver moves)
    const originalContainer = clonedItems
      ? (Object.entries(clonedItems).find(([, ids]) => ids.includes(String(active.id)))?.[0] as RecruitmentStatus | undefined) ?? activeContainer
      : activeContainer;

    // Within-container reorder
    const activeIndex = containerItems[overContainer].indexOf(String(active.id));
    const overIndex = containerItems[overContainer].indexOf(String(over.id));

    if (activeIndex !== overIndex && overIndex >= 0) {
      setContainerItems((prev) => ({
        ...prev,
        [overContainer]: arrayMove(prev[overContainer], activeIndex, overIndex),
      }));
    }

    // Commit the final state
    const finalItems = (() => {
      const current = { ...containerItems };
      if (activeIndex !== overIndex && overIndex >= 0) {
        current[overContainer] = arrayMove(current[overContainer], activeIndex, overIndex);
      }
      return current;
    })();

    // If card moved to a different column, notify parent
    if (originalContainer !== overContainer) {
      onStatusChange(playerId, overContainer);
    }

    // Send reorder updates for the target column
    const targetIds = finalItems[overContainer];
    const updates = targetIds
      .map((cid, i) => {
        const pid = parseCardId(cid);
        return pid !== null ? { playerId: pid, order: i } : null;
      })
      .filter((u): u is { playerId: number; order: number } => u !== null);
    onReorder(updates);

    setActiveId(null);
    setClonedItems(null);
  }, [containerItems, clonedItems, activeColumnId, onStatusChange, onReorder]);

  const handleDragCancel = useCallback(() => {
    // Restore pre-drag snapshot
    if (clonedItems) {
      setContainerItems(clonedItems);
    }
    setActiveId(null);
    setActiveColumnId(null);
    setClonedItems(null);
  }, [clonedItems]);

  // Active player for DragOverlay
  const activePlayer = activeId ? playerMap.get(String(activeId)) ?? null : null;

  // Column sortable IDs
  const columnIds = columnOrder.map((s) => columnId(s));

  // Mobile: plain columns without DndContext — status dropdown replaces drag
  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-3 pb-4">
        {columnOrder.map((status) => (
          <StatusColumn
            key={status}
            status={status}
            players={playersByStatus[status] ?? []}
            showBirthYear={showBirthYear}
            clubMembers={clubMembers}
            onPlayerClick={onPlayerClick}
            onRemove={onRemove}
            onDateChange={onDateChange}
            disableDrag
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    );
  }

  // Desktop: full DndContext with sortable columns and cards
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      measuring={MEASURING_CONFIG}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <ScrollArea className="w-full">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-row gap-3 p-1 pb-4">
            {columnOrder.map((status) => (
              <SortableStatusColumn
                key={status}
                status={status}
                players={displayByStatus[status] ?? []}
                showBirthYear={showBirthYear}
                clubMembers={clubMembers}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </SortableContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

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

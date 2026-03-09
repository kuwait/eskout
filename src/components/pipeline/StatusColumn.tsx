// src/components/pipeline/StatusColumn.tsx
// Single Kanban column representing one recruitment status with @dnd-kit sortable cards
// Supports within-column reordering and cross-column drag via DndContext in KanbanBoard
// RELEVANT FILES: src/components/pipeline/PipelineCard.tsx, src/components/pipeline/KanbanBoard.tsx, src/lib/constants.ts

'use client';

import { forwardRef, useRef, useEffect, useState, useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PipelineCard } from '@/components/pipeline/PipelineCard';
import { RECRUITMENT_STATUSES } from '@/lib/constants';
import type { Player, RecruitmentStatus } from '@/lib/types';

interface StatusColumnProps {
  status: RecruitmentStatus;
  players: Player[];
  /** Show birth year on cards (when viewing all age groups) */
  showBirthYear?: boolean;
  /** Open player profile popup */
  onPlayerClick?: (playerId: number) => void;
  /** Remove from abordagens (set status to null) */
  onRemove: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
  /** Club-scoped profiles for contact assignment in em_contacto cards */
  clubMembers?: { id: string; fullName: string }[];
  /** Disable drag-and-drop (mobile) — cards get status dropdown instead */
  disableDrag?: boolean;
  /** Move card to different status column (mobile alternative to drag) */
  onStatusChange?: (playerId: number, newStatus: RecruitmentStatus) => void;
}

/* ───────────── Sortable Card Wrapper ───────────── */

function SortablePipelineCard({
  player,
  dragId,
  showBirthYear,
  onPlayerClick,
  onRemove,
  onDateChange,
  clubMembers,
}: {
  player: Player;
  dragId: string;
  showBirthYear?: boolean;
  onPlayerClick?: (playerId: number) => void;
  onRemove: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
  clubMembers?: { id: string; fullName: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Track if drag activated so we can distinguish tap from drag-and-release
  const wasDragged = useRef(false);
  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  // Long-press visual: show blue ring after 400ms hold (matches TouchSensor delay)
  const [isHolding, setIsHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    setIsHolding(false);
  }, []);

  // Store previous body overflow to restore on release
  const prevOverflow = useRef<string>('');

  // Cancel long press if finger moves — uses global touchmove because
  // the browser stops sending pointermove to the element once scroll starts
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const moveListener = useRef<((e: TouchEvent) => void) | null>(null);

  function cleanupMoveListener() {
    if (moveListener.current) {
      document.removeEventListener('touchmove', moveListener.current);
      moveListener.current = null;
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    startPos.current = { x: e.clientX, y: e.clientY };

    // Global touchmove listener to detect scroll and cancel hold
    cleanupMoveListener();
    moveListener.current = (te: TouchEvent) => {
      if (!startPos.current || !holdTimer.current) return;
      const touch = te.touches[0];
      const dx = touch.clientX - startPos.current.x;
      const dy = touch.clientY - startPos.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
        cleanupMoveListener();
      }
    };
    document.addEventListener('touchmove', moveListener.current, { passive: true });

    holdTimer.current = setTimeout(() => {
      cleanupMoveListener();
      setIsHolding(true);
      wasLongPress.current = true;
      // Lock body scroll immediately on long press activation
      prevOverflow.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30);
    }, 400);
  }

  function handlePointerUp() {
    startPos.current = null;
    cleanupMoveListener();
    // Restore body scroll if we locked it
    if (wasLongPress.current || isHolding) {
      document.body.style.overflow = prevOverflow.current;
    }
    clearHold();
  }

  // Clear hold state when drag starts (DragOverlay takes over)
  /* eslint-disable react-hooks/set-state-in-effect -- clears UI state in response to external drag system event */
  useEffect(() => {
    if (isDragging) clearHold();
  }, [isDragging, clearHold]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // wasLongPress tracks if hold timer fired (even without actual drag movement)
  const wasLongPress = useRef(false);

  function handleClick(e: React.MouseEvent) {
    if (wasDragged.current || wasLongPress.current) {
      wasDragged.current = false;
      wasLongPress.current = false;
      return;
    }
    // Only navigate when clicking the player info area, not interactive controls (date, contact, remove)
    const target = e.target as HTMLElement;
    const isPlayerArea = target.closest('[data-player-link]');
    if (!isPlayerArea) return;
    onPlayerClick?.(player.id);
  }

  const showRing = isHolding || isDragging;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`touch-manipulation transition-all duration-150 ${
        showRing ? 'scale-[1.03] rounded-lg shadow-lg ring-2 ring-blue-400' : ''
      }`}
      {...attributes}
      {...listeners}
      onPointerDown={(e: React.PointerEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dnd-kit listeners type doesn't expose onPointerDown
        (listeners as any)?.onPointerDown?.(e);
        handlePointerDown(e);
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <PipelineCard player={player} showBirthYear={showBirthYear} onRemove={onRemove} onDateChange={onDateChange} clubMembers={clubMembers} />
    </div>
  );
}

/* ───────────── Column Inner ───────────── */

interface ColumnInnerProps extends StatusColumnProps {
  /** Column header acts as drag handle — these props make it draggable */
  headerDragRef?: React.Ref<HTMLDivElement>;
  headerDragListeners?: Record<string, unknown>;
  headerDragAttributes?: Record<string, unknown>;
}

const ColumnInner = forwardRef<HTMLDivElement, ColumnInnerProps & { style?: React.CSSProperties }>(
  function ColumnInner({ status, players, showBirthYear, onPlayerClick, onRemove, onDateChange, clubMembers, disableDrag, onStatusChange, headerDragRef, headerDragListeners, headerDragAttributes, style }, ref) {
    const config = RECRUITMENT_STATUSES.find((s) => s.value === status);
    const label = config?.labelPt ?? status;
    const colorClass = config?.tailwind ?? 'bg-neutral-400 text-white';

    // Droppable zone so empty columns accept card drops (only when drag enabled)
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `status-${status}`, disabled: disableDrag });

    // Drag IDs must match what KanbanBoard parses
    const sortableIds = players.map((p) => `pipeline-${p.id}-${status}`);

    return (
      <div
        ref={(node) => {
          if (!disableDrag) setDropRef(node);
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={style}
        className={`flex w-full max-w-full flex-col overflow-hidden rounded-lg bg-neutral-50 transition-colors md:min-w-[220px] md:w-auto ${
          isOver && !disableDrag ? 'border-2 border-blue-400' : 'border border-transparent'
        }`}
      >
        {/* Column header — drag handle on desktop, plain header on mobile */}
        <div
          ref={disableDrag ? undefined : headerDragRef}
          className={`flex items-center gap-2 border-b p-3 ${disableDrag ? '' : 'cursor-grab touch-none active:cursor-grabbing'}`}
          {...(disableDrag ? {} : headerDragListeners)}
          {...(disableDrag ? {} : headerDragAttributes)}
        >
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{players.length}</span>
        </div>

        {/* Cards — sortable on desktop, plain with status dropdown on mobile */}
        {disableDrag ? (
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {players.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Sem jogadores
              </p>
            )}
            {players.map((player) => (
              <PipelineCard
                key={player.id}
                player={player}
                showBirthYear={showBirthYear}
                clubMembers={clubMembers}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        ) : (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {players.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Sem jogadores
                </p>
              )}
              {players.map((player) => (
                <SortablePipelineCard
                  key={player.id}
                  player={player}
                  dragId={`pipeline-${player.id}-${status}`}
                  showBirthYear={showBirthYear}
                  clubMembers={clubMembers}
                  onPlayerClick={onPlayerClick}
                  onRemove={onRemove}
                  onDateChange={onDateChange}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    );
  }
);

/* ───────────── Sortable Column Wrapper (for column reorder) ───────────── */

export function SortableStatusColumn(props: StatusColumnProps) {
  const columnId = `column-${props.status}`;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <ColumnInner
      ref={setNodeRef}
      style={style}
      headerDragRef={setActivatorNodeRef}
      headerDragListeners={listeners as unknown as Record<string, unknown>}
      headerDragAttributes={attributes as unknown as Record<string, unknown>}
      {...props}
    />
  );
}

/* ───────────── Plain column export (for non-sortable contexts) ───────────── */

export function StatusColumn(props: StatusColumnProps) {
  return <ColumnInner {...props} />;
}

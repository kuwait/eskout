// src/components/pipeline/StatusColumn.tsx
// Single Kanban column representing one recruitment status with @dnd-kit sortable cards
// Supports within-column reordering and cross-column drag via DndContext in KanbanBoard
// RELEVANT FILES: src/components/pipeline/PipelineCard.tsx, src/components/pipeline/KanbanBoard.tsx, src/lib/constants.ts

'use client';

import { forwardRef, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building2, User } from 'lucide-react';
import { PipelineCard } from '@/components/pipeline/PipelineCard';
import type { PipelineTrainingSession } from '@/components/pipeline/PipelineView';
import { subZoneId } from '@/components/pipeline/kanban-helpers';
import { shortName } from '@/lib/utils';
import { RECRUITMENT_STATUSES } from '@/lib/constants';
import type { DecisionSide, Player, RecruitmentStatus } from '@/lib/types';

/* ───────────── Column width constants ───────────── */
/**
 * Card horizontal space consumed by non-name elements:
 * - card padding: p-2.5 (10px) + pr-7 (28px) = 38px
 * - avatar 20px + gap 6px = 26px
 * - column padding (p-2 on card list) = 16px
 * - border/rounding overhead ≈ 4px
 * Total base ≈ 84px
 */
export const COLUMN_MIN_PX = 100;
export const COLUMN_MAX_PX = 320;

interface StatusColumnProps {
  status: RecruitmentStatus;
  players: Player[];
  /** Show birth year on cards (when viewing all age groups) */
  showBirthYear?: boolean;
  /** Open player profile popup */
  onPlayerClick?: (playerId: number) => void;
  /** Remove from abordagens (set status to null) */
  onRemove?: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate' | 'decisionDate', newDate: string | null) => void;
  /** Club-scoped profiles for contact assignment in em_contacto cards */
  clubMembers?: { id: string; fullName: string }[];
  /** Disable drag-and-drop (mobile) — cards get status dropdown instead */
  disableDrag?: boolean;
  /** Move card to different status column (mobile alternative to drag) */
  onStatusChange?: (playerId: number, newStatus: RecruitmentStatus, decisionSide?: DecisionSide) => void;
  /** Change decision side within a_decidir column */
  onDecisionSideChange?: (playerId: number, side: DecisionSide) => void;
  /** Map of playerId -> last contact purpose label for em_contacto cards */
  contactPurposeMap?: Record<number, string>;
  /** Available contact purpose options for editing */
  contactPurposes?: { id: string; label: string }[];
  /** Map of playerId -> treinos do ciclo actual (para vir_treinar cards) */
  trainingSessionsMap?: Record<number, PipelineTrainingSession[]>;
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
  onStatusChange,
  onDecisionSideChange,
  contactPurposeLabel,
  contactPurposes,
  trainingSessions,
}: {
  player: Player;
  dragId: string;
  showBirthYear?: boolean;
  onPlayerClick?: (playerId: number) => void;
  onRemove?: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate' | 'decisionDate', newDate: string | null) => void;
  clubMembers?: { id: string; fullName: string }[];
  onStatusChange?: (playerId: number, newStatus: RecruitmentStatus) => void;
  onDecisionSideChange?: (playerId: number, side: DecisionSide) => void;
  contactPurposeLabel?: string;
  contactPurposes?: { id: string; label: string }[];
  trainingSessions?: PipelineTrainingSession[];
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
        // Don't start drag when interacting with text inputs (note editing, etc.)
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dnd-kit listeners type doesn't expose onPointerDown
        (listeners as any)?.onPointerDown?.(e);
        handlePointerDown(e);
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <PipelineCard player={player} showBirthYear={showBirthYear} onRemove={onRemove} onDateChange={onDateChange} clubMembers={clubMembers} onPlayerClick={onPlayerClick} onStatusChange={onStatusChange} onDecisionSideChange={onDecisionSideChange} contactPurposeLabel={contactPurposeLabel} contactPurposes={contactPurposes ?? []} trainingSessions={trainingSessions} />
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

/* ───────────── Decision Sub-Section (club / player split within A Decidir) ───────────── */

function DecisionSubSection({
  side,
  players,
  showBirthYear,
  onPlayerClick,
  onRemove,
  onDateChange,
  clubMembers,
  onStatusChange,
  onDecisionSideChange,
  disableDrag,
}: {
  side: DecisionSide;
  players: Player[];
  showBirthYear?: boolean;
  onPlayerClick?: (playerId: number) => void;
  onRemove?: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate' | 'decisionDate', newDate: string | null) => void;
  clubMembers?: { id: string; fullName: string }[];
  onStatusChange?: (playerId: number, newStatus: RecruitmentStatus) => void;
  onDecisionSideChange?: (playerId: number, side: DecisionSide) => void;
  disableDrag?: boolean;
}) {
  const Icon = side === 'club' ? Building2 : User;
  const label = side === 'club' ? 'Clube a decidir' : 'Jogador a decidir';
  const zoneId = subZoneId(side);

  // Droppable zone for this sub-section (desktop only)
  const { setNodeRef, isOver } = useDroppable({ id: zoneId, disabled: disableDrag });

  return (
    <div
      ref={disableDrag ? undefined : setNodeRef}
      className={`min-h-[40px] rounded transition-colors ${
        isOver && !disableDrag ? 'bg-blue-50' : ''
      }`}
    >
      {/* Sub-header */}
      <div className="flex items-center gap-1.5 px-1 py-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="rounded-full bg-neutral-200 px-1 py-px text-[9px] font-bold text-neutral-600">{players.length}</span>
      </div>

      {/* Cards */}
      {players.length === 0 ? (
        <p className="py-2 text-center text-[10px] text-muted-foreground/60">Sem jogadores</p>
      ) : (
        <div className="space-y-2">
          {disableDrag ? (
            players.map((player) => (
              <PipelineCard
                key={player.id}
                player={player}
                showBirthYear={showBirthYear}
                clubMembers={clubMembers}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                onStatusChange={onStatusChange}
                onDecisionSideChange={onDecisionSideChange}
              />
            ))
          ) : (
            players.map((player) => (
              <SortablePipelineCard
                key={player.id}
                player={player}
                dragId={`card-${player.id}`}
                showBirthYear={showBirthYear}
                clubMembers={clubMembers}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                onStatusChange={onStatusChange}
                onDecisionSideChange={onDecisionSideChange}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

const ColumnInner = forwardRef<HTMLDivElement, ColumnInnerProps & { style?: React.CSSProperties }>(
  function ColumnInner({ status, players, showBirthYear, onPlayerClick, onRemove, onDateChange, clubMembers, disableDrag, onStatusChange, onDecisionSideChange, contactPurposeMap = {}, contactPurposes = [], trainingSessionsMap = {}, headerDragRef, headerDragListeners, headerDragAttributes, style }, ref) {
    const config = RECRUITMENT_STATUSES.find((s) => s.value === status);
    const label = config?.labelPt ?? status;
    const light = config?.tailwindLight ?? { bg: 'bg-neutral-100', text: 'text-neutral-600', border: 'border-neutral-300', dot: 'bg-neutral-400' };

    // Droppable zone so empty columns accept card drops (only when drag enabled)
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `status-${status}`, disabled: disableDrag });

    // Drag IDs must match what KanbanBoard parses — status-agnostic for cross-container moves
    const sortableIds = players.map((p) => `card-${p.id}`);

    // Split a_decidir players by decision_side
    const isDecidirColumn = status === 'a_decidir';
    const clubPlayers = useMemo(
      () => isDecidirColumn ? players.filter((p) => p.decisionSide !== 'player') : [],
      [isDecidirColumn, players]
    );
    const playerPlayers = useMemo(
      () => isDecidirColumn ? players.filter((p) => p.decisionSide === 'player') : [],
      [isDecidirColumn, players]
    );

    // Per-column dynamic width: measure longest short name with canvas
    const columnWidth = useMemo(() => {
      if (disableDrag || players.length === 0) return undefined;
      let maxTextPx = 0;
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '500 14px Inter, system-ui, sans-serif';
          for (const p of players) {
            const w = ctx.measureText(shortName(p.name)).width;
            if (w > maxTextPx) maxTextPx = w;
          }
        }
      }
      if (maxTextPx === 0) return COLUMN_MIN_PX;
      // Fixed: card pad left 10 + right 24 = 34, list pad 16, avatar 20 + gap 6 = 26, border 2
      const fixedPx = 34 + 16 + 26 + 2 + (showBirthYear ? 48 : 0);
      const needed = Math.ceil(maxTextPx + fixedPx);
      return Math.min(Math.max(needed, COLUMN_MIN_PX), COLUMN_MAX_PX);
    }, [players, showBirthYear, disableDrag]);

    return (
      <div
        ref={(node) => {
          if (!disableDrag) setDropRef(node);
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={{ ...style, ...(columnWidth ? { minWidth: columnWidth, width: columnWidth } : {}) }}
        className={`flex w-full max-w-full flex-col overflow-hidden rounded-lg bg-neutral-50 transition-colors md:w-auto ${
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
          <span className={`inline-flex items-center truncate rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${light.bg} ${light.border} ${light.text}`}>
            {label}
          </span>
          <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${light.bg} ${light.text}`}>
            {players.length}
          </span>
        </div>

        {/* A Decidir: split into club/player sub-sections */}
        {isDecidirColumn ? (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex-1 overflow-y-auto p-2">
              <DecisionSubSection
                side="club"
                players={clubPlayers}
                showBirthYear={showBirthYear}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                clubMembers={clubMembers}
                onStatusChange={onStatusChange}
                onDecisionSideChange={onDecisionSideChange}
                disableDrag={disableDrag}
              />
              {/* Dashed separator */}
              <div className="my-2 border-t border-dashed border-neutral-300" />
              <DecisionSubSection
                side="player"
                players={playerPlayers}
                showBirthYear={showBirthYear}
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
                clubMembers={clubMembers}
                onStatusChange={onStatusChange}
                onDecisionSideChange={onDecisionSideChange}
                disableDrag={disableDrag}
              />
            </div>
          </SortableContext>
        ) : disableDrag ? (
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
                contactPurposeLabel={contactPurposeMap[player.id]}
                contactPurposes={contactPurposes}
                trainingSessions={trainingSessionsMap[player.id]}
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
                  dragId={`card-${player.id}`}
                  showBirthYear={showBirthYear}
                  clubMembers={clubMembers}
                  onPlayerClick={onPlayerClick}
                  onRemove={onRemove}
                  onDateChange={onDateChange}
                  onStatusChange={onStatusChange}
                  contactPurposeLabel={contactPurposeMap[player.id]}
                  contactPurposes={contactPurposes}
                  trainingSessions={trainingSessionsMap[player.id]}
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

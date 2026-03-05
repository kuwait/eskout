// src/components/pipeline/StatusColumn.tsx
// Single Kanban column representing one recruitment status with @dnd-kit sortable cards
// Supports within-column reordering and cross-column drag via DndContext in KanbanBoard
// RELEVANT FILES: src/components/pipeline/PipelineCard.tsx, src/components/pipeline/KanbanBoard.tsx, src/lib/constants.ts

'use client';

import { forwardRef } from 'react';
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
}

/* ───────────── Sortable Card Wrapper ───────────── */

function SortablePipelineCard({
  player,
  dragId,
  showBirthYear,
  onPlayerClick,
  onRemove,
  onDateChange,
}: {
  player: Player;
  dragId: string;
  showBirthYear?: boolean;
  onPlayerClick?: (playerId: number) => void;
  onRemove: (playerId: number) => void;
  onDateChange?: (playerId: number, field: 'trainingDate' | 'meetingDate' | 'signingDate', newDate: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="touch-none cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <PipelineCard player={player} showBirthYear={showBirthYear} onPlayerClick={onPlayerClick} onRemove={onRemove} onDateChange={onDateChange} />
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
  function ColumnInner({ status, players, showBirthYear, onPlayerClick, onRemove, onDateChange, headerDragRef, headerDragListeners, headerDragAttributes, style }, ref) {
    const config = RECRUITMENT_STATUSES.find((s) => s.value === status);
    const label = config?.labelPt ?? status;
    const colorClass = config?.tailwind ?? 'bg-neutral-400 text-white';

    // Droppable zone so empty columns accept card drops
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `status-${status}` });

    // Drag IDs must match what KanbanBoard parses
    const sortableIds = players.map((p) => `pipeline-${p.id}-${status}`);

    return (
      <div
        ref={(node) => {
          // Merge sortable outer ref + droppable ref
          setDropRef(node);
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        style={style}
        className={`flex w-full flex-col rounded-lg bg-neutral-50 transition-colors md:min-w-[220px] md:w-auto ${
          isOver ? 'border-2 border-blue-400' : 'border border-transparent'
        }`}
      >
        {/* Column header — entire header is the column drag handle */}
        <div
          ref={headerDragRef}
          className="flex cursor-grab touch-none items-center gap-2 border-b p-3 active:cursor-grabbing"
          {...headerDragListeners}
          {...headerDragAttributes}
        >
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{players.length}</span>
        </div>

        {/* Cards */}
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
                onPlayerClick={onPlayerClick}
                onRemove={onRemove}
                onDateChange={onDateChange}
              />
            ))}
          </div>
        </SortableContext>
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

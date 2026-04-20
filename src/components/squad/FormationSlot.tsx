// src/components/squad/FormationSlot.tsx
// Formation slot showing position badge, draggable player cards with badges
// Each slot is a droppable area; each player card is draggable for reordering
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/lib/constants.ts, src/lib/types/index.ts

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Trash2, User, Footprints, Calendar } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { POSITION_LABELS, SPECIAL_SECTION_LABELS, POSITION_CHIP_SOLID, POSITION_CHIP_OUTLINE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import type { Player, PositionCode } from '@/lib/types';
import type { SpecialSquadSection } from '@/lib/constants';

interface FormationSlotProps {
  position: string;
  /** Unique slot ID for DnD droppable — defaults to position */
  slotId?: string;
  /** Override the display label (e.g. "DC (E)") */
  positionLabel?: string;
  players: Player[];
  squadType: 'real' | 'shadow';
  onAdd: () => void;
  onRemovePlayer: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
  onToggleSigned?: (playerId: number, isSigned: boolean) => void;
  onTogglePreseason?: (playerId: number, isPreseason: boolean) => void;
  /** Move player to a special section (Dúvida / Possibilidades) — real squads only */
  onMoveToSection?: (playerId: number, section: SpecialSquadSection) => void;
}

/* ───────────── Rank styling for shadow squad priority ───────────── */

/** Left border color by rank (0-indexed) */
const RANK_BORDER: Record<number, string> = {
  0: 'border-l-3 border-l-amber-400',    // 1st — gold
  1: 'border-l-3 border-l-neutral-400',   // 2nd — silver
  2: 'border-l-3 border-l-amber-700',     // 3rd — bronze
};

/** Corner badge style by rank (0-indexed) */
const RANK_CORNER: Record<number, string> = {
  0: 'bg-amber-400 text-white',
  1: 'bg-neutral-300 text-white',
  2: 'bg-amber-700 text-white',
};

/** Get display name: first + last for 3+ word names, initial + last when still too long to fit */
function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstLast = parts.length === 2 ? name : `${first} ${last}`;
  // ~18 chars fit in the 190px card header at text-[12px] — beyond that, abbreviate first name
  if (firstLast.length > 18) return `${first.charAt(0)}. ${last}`;
  return firstLast;
}

/** Compact name for narrow mobile cards: always "F. Last" for 2+ words */
function compactName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
}

/** Compute age in years from an ISO dob string, returns null if invalid */
function computeAge(dobStr: string | null | undefined): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/* ───────────── Draggable Player Card ───────────── */

function DraggablePlayerCard({
  player,
  index,
  squadType,
  onRemove,
  onToggleDoubt,
  onToggleSigned,
  onTogglePreseason,
  onMoveToSection,
}: {
  player: Player;
  index: number;
  squadType: 'real' | 'shadow';
  onRemove: () => void;
  onToggleDoubt?: (playerId: number, isDoubt: boolean) => void;
  onToggleSigned?: (playerId: number, isSigned: boolean) => void;
  onTogglePreseason?: (playerId: number, isPreseason: boolean) => void;
  onMoveToSection?: (playerId: number, section: SpecialSquadSection) => void;
}) {
  const dragId = `player-${player.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });
  const [showActions, setShowActions] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Distinguish a genuine click from a click-after-drag by comparing pointerdown→pointerup coords.
  // dnd-kit's pointer listeners on the root (via {...listeners}) still fire; we add our own onPointerDown via composition.
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Merge dnd-kit ref with our own ref so we can detect outside clicks
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    setNodeRef(el);
    cardElRef.current = el;
  }, [setNodeRef]);

  // Close the expanded panel when the user taps outside the card
  useEffect(() => {
    if (!showActions) return;
    const handler = (e: PointerEvent) => {
      if (cardElRef.current && !cardElRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showActions]);

  // Compose dnd-kit's pointerdown listener with our own — record starting position so we
  // can suppress the toggle if the pointer moved (=drag) before pointerup.
  const composedOnPointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    // Forward to dnd-kit's listener so drag detection still works
    (listeners as { onPointerDown?: (ev: React.PointerEvent) => void } | undefined)?.onPointerDown?.(e);
  };

  function handleCardClick(e: React.MouseEvent) {
    // Ignore the click if the pointer travelled more than a few px between down and up (= drag, not tap)
    const start = pointerDownPos.current;
    if (start) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > 4 || dy > 4) return;
    }
    setShowActions((v) => !v);
  }

  const photoUrl = player.photoUrl || player.zzPhotoUrl;
  // Use normalized position CODE (MC / DC / GR) — matches scouting report convention
  const posCode = player.positionNormalized ?? null;
  // Full PT label used as tooltip/aria
  const posFull = posCode ? (POSITION_LABELS[posCode as PositionCode] ?? posCode) : null;

  // Compact dd/MM/yy for the meta strip — full dd/MM/yyyy + age available via tooltip
  const dobLabel = player.dob
    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return player.dob!; } })()
    : null;
  const age = computeAge(player.dob);
  const dobTooltipFull = player.dob
    ? (() => { try { return new Date(player.dob!).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return player.dob!; } })()
    : null;
  const dobTooltip = age !== null && dobTooltipFull ? `${dobTooltipFull} (${age} anos)` : dobTooltipFull ?? undefined;

  return (
    <div
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      // Must come AFTER {...listeners} so our composed handler wins (it still forwards to dnd-kit)
      onPointerDown={composedOnPointerDown}
      className={`relative w-[140px] cursor-grab rounded-md shadow-sm touch-none active:cursor-grabbing lg:w-[180px] ${
        player.isDoubt
          ? 'border border-dashed border-amber-400 bg-amber-50/90 opacity-80'
          : player.isPreseason
          ? 'border border-dashed border-sky-400 bg-sky-50/90'
          : player.isSigned
          ? 'border border-green-300 bg-green-50/80'
          : 'bg-white/95'
      } ${
        squadType === 'shadow' ? RANK_BORDER[index] ?? 'border-l-2 border-l-neutral-200' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Status flag — bottom-right corner (priority: Dúvida > Pré-Época > Assinou) */}
      {player.isDoubt ? (
        <span className="absolute -bottom-1 -right-0.5 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white shadow-sm" title="Dúvida">
          Dúvida
        </span>
      ) : player.isPreseason ? (
        <span className="absolute -bottom-1 -right-0.5 z-10 rounded-full bg-sky-500 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white shadow-sm" title="Pré-Época">
          Pré-Época
        </span>
      ) : player.isSigned ? (
        <span className="absolute -bottom-1 -right-0.5 z-10 rounded-full bg-green-500 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white shadow-sm" title="Assinou">
          Assinou
        </span>
      ) : null}

      {/* Rank corner badge — top-right */}
      {squadType === 'shadow' && (
        <span className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-md rounded-tr-md text-[9px] font-bold ${RANK_CORNER[index] ?? 'bg-neutral-100 text-neutral-400'}`}>
          {index + 1}
        </span>
      )}

      {/* Compact card: photo + name + club only */}
      <div className="flex items-center gap-2 p-1.5">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="h-8 w-8 shrink-0 rounded object-cover shadow-md ring-1 ring-black/20"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 shadow-md ring-1 ring-black/20">
            <User className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold leading-tight text-neutral-900" title={player.name}>
            {/* Mobile-narrow card (<lg): always abbreviate to "F. Last" to avoid truncation */}
            <span className="lg:hidden">{compactName(player.name)}</span>
            <span className="hidden lg:inline">{displayName(player.name)}</span>
          </p>
          <p className="truncate text-[10px] leading-tight text-neutral-500" title={player.club ?? undefined}>
            {player.club || '—'}
          </p>
        </div>
      </div>

      {/* Expanded details — shown on tap before actions */}
      {showActions && (
        <div
          className="relative rounded-b-md border-t border-neutral-100 bg-white px-2 pb-2 pt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Meta strip — justified: [pos chip] left · foot center · date right */}
          {(posCode || player.foot || dobLabel) && (
            <div
              className="flex items-center justify-between gap-1 text-[10px] font-medium text-neutral-700"
              title={[posFull, player.foot, dobTooltip].filter(Boolean).join(' · ')}
            >
              {posCode ? (
                /* Primary chip (solid tactical color) + optional secondary chip (inverted — same tactical color as border/text on white).
                   Tertiary dropped to keep the strip readable. */
                <span className="flex items-center gap-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white ${POSITION_CHIP_SOLID[posCode] ?? 'bg-neutral-700'}`}
                    title={posFull ?? posCode}
                  >
                    {posCode}
                  </span>
                  {player.secondaryPosition && player.secondaryPosition !== posCode && (
                    <span
                      className={`rounded border bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${POSITION_CHIP_OUTLINE[player.secondaryPosition] ?? 'border-neutral-300 text-neutral-600'}`}
                      title={(POSITION_LABELS as Record<string, string>)[player.secondaryPosition] ?? player.secondaryPosition}
                    >
                      {player.secondaryPosition}
                    </span>
                  )}
                </span>
              ) : <span />}
              {player.foot ? (
                <span className="flex items-center gap-0.5">
                  <Footprints className="h-3 w-3 text-neutral-400" aria-hidden="true" />
                  <span>{player.foot}</span>
                </span>
              ) : <span />}
              {dobLabel ? (
                <span className="flex items-center gap-0.5">
                  <Calendar className="h-3 w-3 text-neutral-400" aria-hidden="true" />
                  <span className="whitespace-nowrap">{dobLabel}</span>
                </span>
              ) : <span />}
            </div>
          )}

          {/* Squad flags — single row of compact pills (Dúvida · Pré-Época · Assinou) */}
          {(onToggleDoubt || onTogglePreseason || onToggleSigned) && (
            <div className="mt-2 flex items-center justify-center gap-1">
              {onToggleDoubt && (
                <button
                  className={`flex items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                    player.isDoubt
                      ? 'border-amber-400 bg-amber-500 text-white'
                      : 'border-amber-300 text-amber-600 hover:bg-amber-50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onToggleDoubt(player.id, !player.isDoubt); }}
                  aria-label={player.isDoubt ? 'Remover dúvida' : 'Marcar como dúvida'}
                >
                  Dúvida
                  {player.isDoubt && <span aria-hidden="true">✓</span>}
                </button>
              )}
              {onTogglePreseason && (
                <button
                  className={`flex items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                    player.isPreseason
                      ? 'border-sky-400 bg-sky-500 text-white'
                      : 'border-sky-300 text-sky-600 hover:bg-sky-50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onTogglePreseason(player.id, !player.isPreseason); }}
                  aria-label={player.isPreseason ? 'Remover pré-época' : 'Marcar como pré-época'}
                >
                  Pré-Época
                  {player.isPreseason && <span aria-hidden="true">✓</span>}
                </button>
              )}
              {onToggleSigned && (
                <button
                  className={`flex items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                    player.isSigned
                      ? 'border-green-400 bg-green-500 text-white'
                      : 'border-green-300 text-green-600 hover:bg-green-50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onToggleSigned(player.id, !player.isSigned); }}
                  aria-label={player.isSigned ? 'Remover assinatura' : 'Marcar como assinou'}
                >
                  Assinou
                  {player.isSigned && <span aria-hidden="true">✓</span>}
                </button>
              )}
            </div>
          )}

          {/* Navigation + remove — Ver perfil takes full width, Remover is icon-only */}
          <div className="mt-2 flex items-stretch gap-1">
            <Link
              href={`/jogadores/${player.id}`}
              className="flex flex-1 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
              onClick={(e) => { e.stopPropagation(); setShowActions(false); }}
            >
              Ver perfil
            </Link>
            <button
              className="flex shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-600 hover:bg-red-100"
              onClick={(e) => { e.stopPropagation(); setShowActions(false); onRemove(); }}
              aria-label={`Remover ${player.name}`}
              title="Remover do plantel"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Move to special section — real squads only */}
          {onMoveToSection && (
            <>
              <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                <span className="h-px flex-1 bg-neutral-200" />
                <span className="text-[8px] font-medium uppercase tracking-widest text-neutral-400">Mover para</span>
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                <button
                  className="whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-1 py-1.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-100"
                  onClick={(e) => { e.stopPropagation(); setShowActions(false); onMoveToSection(player.id, 'DUVIDA'); }}
                >
                  {SPECIAL_SECTION_LABELS.DUVIDA}
                </button>
                <button
                  className="whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 px-1 py-1.5 text-[9px] font-semibold text-purple-700 hover:bg-purple-100"
                  onClick={(e) => { e.stopPropagation(); setShowActions(false); onMoveToSection(player.id, 'POSSIBILIDADE'); }}
                >
                  {SPECIAL_SECTION_LABELS.POSSIBILIDADE}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── Formation Slot (droppable + sortable container) ───────────── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- onPlayerClick kept in interface for backward compat, Link replaced onClick
export function FormationSlot({ position, slotId, positionLabel, players, squadType, onAdd, onRemovePlayer, onPlayerClick, onToggleDoubt, onToggleSigned, onTogglePreseason, onMoveToSection }: FormationSlotProps) {
  const label = positionLabel ?? ((POSITION_LABELS as Record<string, string>)[position] ?? position);
  const displayCode = positionLabel ?? position;
  const dndId = slotId ?? position;

  // Make this slot a droppable target for cross-position drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `droppable-${dndId}` });

  // IDs for SortableContext — player-{id} format enables cross-position drag
  const sortableIds = players.map((p) => `player-${p.id}`);

  return (
    <div
      ref={setDropRef}
      className={`flex min-w-[110px] flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
        isOver ? 'bg-white/20' : ''
      }`}
    >
      {/* Position badge */}
      <span className="rounded bg-white/90 px-2.5 py-1 text-xs font-bold text-neutral-900 shadow-sm">
        {displayCode}
      </span>

      {/* Sortable player cards */}
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {players.map((p, i) => (
          <DraggablePlayerCard
            key={p.id}
            player={p}
            index={i}
            squadType={squadType}
            onRemove={() => onRemovePlayer(p.id)}
            onToggleDoubt={onToggleDoubt}
            onToggleSigned={onToggleSigned}
            onTogglePreseason={onTogglePreseason}
            onMoveToSection={onMoveToSection}
          />
        ))}
      </SortableContext>

      {/* Add button — onPointerDown stops DnD sensor from swallowing the tap */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 touch-auto rounded-full bg-white/30 px-3 text-xs text-white hover:bg-white/50"
        onClick={onAdd}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Adicionar ${label}`}
      >
        <Plus className="h-3.5 w-3.5" />
        {players.length === 0 && <span className="ml-0.5">Adicionar</span>}
      </Button>
    </div>
  );
}

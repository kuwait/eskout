// src/components/squad/SquadSpecialSection.tsx
// Collapsible section below the pitch for special squad groups (Dúvida, Possibilidades)
// Shows players not in a pitch position — in evaluation or external pipeline candidates
// RELEVANT FILES: src/components/squad/SquadPanelView.tsx, src/components/squad/FormationSlot.tsx, src/lib/constants.ts

'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Trash2, User } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  POSITION_LABELS,
  DOUBT_REASONS,
  DOUBT_REASON_CONFIG,
  CUSTOM_COLOR_CHOICES,
  CUSTOM_COLOR_CLASSES,
  POSITION_CHIP_SOLID,
} from '@/lib/constants';
import type {
  Player,
  PositionCode,
  RecruitmentStatus,
} from '@/lib/types';
import type { SpecialSquadSection, DoubtReason, CustomColorChoice } from '@/lib/constants';

/** Card border color per pipeline status — mirrors the tinted compact StatusBadge palette */
const STATUS_CARD_BORDER: Record<string, string> = {
  por_tratar:      'border-neutral-300',
  em_contacto:     'border-purple-300',
  vir_treinar:     'border-blue-300',
  reuniao_marcada: 'border-orange-300',
  a_decidir:       'border-blue-400',
  em_standby:      'border-slate-300',
  confirmado:      'border-green-300',
  assinou:         'border-green-400',
  rejeitado:       'border-red-300',
};

/** Resolve a player's doubt-reason visual style (border + bg + text + label) */
function getDoubtReasonStyle(player: Player): { border: string; bg: string; text: string; label: string } {
  const reason = (player.doubtReason ?? 'decidir') as DoubtReason;
  if (reason === 'outro') {
    const color = (player.doubtReasonColor as CustomColorChoice | null) ?? 'slate';
    const palette = CUSTOM_COLOR_CLASSES[color] ?? CUSTOM_COLOR_CLASSES.slate;
    const custom = (player.doubtReasonCustom ?? '').trim();
    return { ...palette, label: custom || DOUBT_REASON_CONFIG.outro.label };
  }
  const cfg = DOUBT_REASON_CONFIG[reason] ?? DOUBT_REASON_CONFIG.decidir;
  return { border: cfg.border, bg: cfg.bg, text: cfg.text, label: cfg.label };
}

/* ───────────── Section color config ───────────── */

const SECTION_STYLES: Record<SpecialSquadSection, {
  border: string;
  dropHighlight: string;
  headerBg: string;
  headerText: string;
  countBg: string;
  emptyText: string;
}> = {
  DUVIDA: {
    border: 'border-amber-200 dark:border-amber-800',
    dropHighlight: 'border-amber-500 bg-amber-50/50 dark:border-amber-400 dark:bg-amber-950/50',
    headerBg: 'bg-amber-50 dark:bg-amber-950/30',
    headerText: 'text-amber-800 dark:text-amber-300',
    countBg: 'bg-amber-500',
    emptyText: 'Sem jogadores em dúvida',
  },
  POSSIBILIDADE: {
    border: 'border-purple-200 dark:border-purple-800',
    dropHighlight: 'border-purple-500 bg-purple-50/50 dark:border-purple-400 dark:bg-purple-950/50',
    headerBg: 'bg-purple-50 dark:bg-purple-950/30',
    headerText: 'text-purple-800 dark:text-purple-300',
    countBg: 'bg-purple-500',
    emptyText: 'Sem possibilidades adicionadas',
  },
};

/* ───────────── Props ───────────── */

interface SquadSpecialSectionProps {
  sectionKey: SpecialSquadSection;
  label: string;
  players: Player[];
  onAdd: () => void;
  onRemovePlayer: (playerId: number) => void;
  /** Set the doubt reason for a player — used only in the DUVIDA section */
  onSetDoubtReason?: (
    playerId: number,
    reason: string | null,
    customText?: string | null,
    customColor?: string | null
  ) => void;
  /** Set the custom possibility motivo — used only in the POSSIBILIDADE section (real squads) */
  onSetPossibilityReason?: (
    playerId: number,
    customText: string | null,
    customColor: string | null
  ) => void;
}

/* ───────────── Helper ───────────── */

/**
 * Compact name for the narrow (~140px) section card:
 * - 1 word  → as-is
 * - 2 words → full name when it fits (≤ 14 chars), else initial + last ("S. Coelho")
 * - 3+ words → first + last, else initial + last if still too long
 * Lower threshold than the pitch card (190px wide) because the section cards are narrower.
 */
function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstLast = parts.length === 2 ? name : `${first} ${last}`;
  if (firstLast.length > 14) return `${first.charAt(0)}. ${last}`;
  return firstLast;
}

/* ───────────── Compact Player Card ───────────── */

function SectionPlayerCard({
  player,
  sectionKey,
  onRemove,
  onSetDoubtReason,
  onSetPossibilityReason,
}: {
  player: Player;
  sectionKey: SpecialSquadSection;
  onRemove: () => void;
  onSetDoubtReason?: (
    playerId: number,
    reason: string | null,
    customText?: string | null,
    customColor?: string | null
  ) => void;
  onSetPossibilityReason?: (
    playerId: number,
    customText: string | null,
    customColor: string | null
  ) => void;
}) {
  const dragId = `player-${player.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId });
  const [showActions, setShowActions] = useState(false);
  const photoUrl = player.photoUrl || player.zzPhotoUrl;
  const posLabel = player.positionNormalized
    ? (POSITION_LABELS[player.positionNormalized as PositionCode] ?? player.positionNormalized)
    : null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Merge dnd-kit ref with a local ref so we can recognize clicks on the anchor
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    setNodeRef(el);
    cardElRef.current = el;
  }, [setNodeRef]);

  // Distinguish a tap from a drag by comparing pointerdown → pointerup coords (dnd-kit's isDragging only goes true once the drag activates)
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const composedOnPointerDown = (e: React.PointerEvent) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    (listeners as { onPointerDown?: (ev: React.PointerEvent) => void } | undefined)?.onPointerDown?.(e);
  };

  function handleCardClick(e: React.MouseEvent) {
    const start = pointerDownPos.current;
    if (start) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > 4 || dy > 4) return; // was a drag — don't toggle
    }
    setShowActions((v) => !v);
  }

  // Dúvida: show doubt_reason strip+border. Possibilidades: show pipeline status strip+border.
  const isDuvida = sectionKey === 'DUVIDA';
  const doubtStyle = isDuvida ? getDoubtReasonStyle(player) : null;
  const effectiveStatus: RecruitmentStatus = (player.recruitmentStatus ?? 'por_tratar') as RecruitmentStatus;
  const borderClass = isDuvida
    ? doubtStyle!.border
    : (STATUS_CARD_BORDER[effectiveStatus] ?? STATUS_CARD_BORDER.por_tratar);

  return (
    // Popover wraps the card so expanded actions render via a Portal — escapes the
    // parent's overflow-hidden (which clipped the last card's actions) and stays pinned to the card.
    <Popover open={showActions} onOpenChange={setShowActions}>
      <PopoverAnchor asChild>
        <div
          ref={setRefs}
          style={style}
          {...attributes}
          {...listeners}
          onPointerDown={composedOnPointerDown}
          className={`relative w-full min-w-[100px] max-w-[160px] cursor-grab rounded-md border bg-white/95 shadow-sm touch-none active:cursor-grabbing ${borderClass}`}
          onClick={handleCardClick}
        >
          {/* Compact card: photo + name + club + position */}
          <div className="flex items-center gap-1.5 p-1.5">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt=""
                width={28}
                height={28}
                unoptimized
                className="h-7 w-7 shrink-0 rounded object-cover shadow-md ring-1 ring-black/20"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-400 shadow-md ring-1 ring-black/20 dark:bg-neutral-700">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
                {displayName(player.name)}
              </p>
              <p className="truncate text-[9px] leading-tight text-neutral-500 dark:text-neutral-400">
                {player.club || '—'}
              </p>
            </div>
            {/* Position code chip — tactical-role colored. Slimmer padding than pitch card to save horizontal space */}
            {posLabel && player.positionNormalized && (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide text-white ${POSITION_CHIP_SOLID[player.positionNormalized] ?? 'bg-neutral-700'}`}
                title={posLabel}
              >
                {player.positionNormalized}
              </span>
            )}
          </div>

          {/* Bottom strip —
              DUVIDA: doubt reason picker (opens Popover to change reason + custom text/color)
              POSSIBILIDADE: motivo picker (custom text + color) when set, else pipeline status (read-only) */}
          {isDuvida && doubtStyle ? (
            <DoubtReasonStrip
              player={player}
              style={doubtStyle}
              onSetDoubtReason={onSetDoubtReason}
            />
          ) : (
            <PossibilityReasonStrip
              player={player}
              effectiveStatus={effectiveStatus}
              onSetPossibilityReason={onSetPossibilityReason}
            />
          )}
        </div>
      </PopoverAnchor>
      {/* Expanded actions — portaled, pinned to the card; never clipped by parent overflow.
          onPointerDownOutside: prevent Radix's auto-close when the pointer lands on the anchor (our card).
          Otherwise Radix closes, then our manual onClick toggle flips it back open → popover never closes on tap. */}
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={4}
        className="w-[160px] p-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          if (cardElRef.current && cardElRef.current.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex items-stretch gap-1">
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
      </PopoverContent>
    </Popover>
  );
}

/* ───────────── Main Component ───────────── */

export function SquadSpecialSection({
  sectionKey,
  label,
  players,
  onAdd,
  onRemovePlayer,
  onSetDoubtReason,
  onSetPossibilityReason,
}: SquadSpecialSectionProps) {
  const styles = SECTION_STYLES[sectionKey];

  // Droppable zone — accepts dragged players from the pitch (same DndContext)
  const { setNodeRef, isOver } = useDroppable({ id: `droppable-${sectionKey}` });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 ${isOver ? styles.dropHighlight : styles.border} overflow-hidden transition-colors`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${styles.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide ${styles.headerText}`}>
            {label}
          </span>
          {players.length > 0 && (
            <span className={`${styles.countBg} flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white`}>
              {players.length}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`flex h-6 w-6 items-center justify-center rounded-full ${styles.headerText} hover:bg-black/5 dark:hover:bg-white/10`}
          onClick={onAdd}
          aria-label={`Adicionar jogador a ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content — wrapping player cards (SortableContext for drag) */}
      <div className="p-2">
        {players.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground italic">
            {styles.emptyText}
          </p>
        ) : (
          <SortableContext items={players.map((p) => `player-${p.id}`)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap items-start gap-2">
              {players.map((player) => (
                <SectionPlayerCard
                  key={player.id}
                  player={player}
                  sectionKey={sectionKey}
                  onRemove={() => onRemovePlayer(player.id)}
                  onSetDoubtReason={onSetDoubtReason}
                  onSetPossibilityReason={onSetPossibilityReason}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

/* ───────────── Doubt Reason Strip (Dúvida section only) ───────────── */

/**
 * Full-width bottom strip showing the doubt reason — click to open a Popover
 * with the 6 predefined reasons + custom text + color palette for 'outro'.
 */
function DoubtReasonStrip({
  player,
  style,
  onSetDoubtReason,
}: {
  player: Player;
  style: { border: string; bg: string; text: string; label: string };
  onSetDoubtReason?: (
    playerId: number,
    reason: string | null,
    customText?: string | null,
    customColor?: string | null
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentReason = (player.doubtReason ?? 'decidir') as DoubtReason;
  const currentCustomText = player.doubtReasonCustom ?? '';
  const currentCustomColor = (player.doubtReasonColor as CustomColorChoice | null) ?? 'slate';

  // Editable draft state — committed on "Guardar" when reason = 'outro'. Reset via onOpenChange.
  const [draftText, setDraftText] = useState(currentCustomText);
  const [draftColor, setDraftColor] = useState<CustomColorChoice>(currentCustomColor);
  // Local toggle so clicking "Outro" opens the editor without persisting yet — only "Guardar" commits.
  const [showOutroEditor, setShowOutroEditor] = useState(currentReason === 'outro');

  function handleOpenChange(next: boolean) {
    // Reset drafts + editor visibility to current persisted values every time the popover opens
    if (next) {
      setDraftText(currentCustomText);
      setDraftColor(currentCustomColor);
      setShowOutroEditor(currentReason === 'outro');
    }
    setOpen(next);
  }

  function commit(reason: DoubtReason, text?: string, color?: CustomColorChoice) {
    if (!onSetDoubtReason) return;
    if (reason === 'outro') {
      onSetDoubtReason(player.id, 'outro', (text ?? draftText).trim() || null, color ?? draftColor);
    } else {
      onSetDoubtReason(player.id, reason);
    }
    setOpen(false);
  }

  // Non-'outro' presets commit immediately. 'Outro' just opens the editor — persistence waits for "Guardar".
  function handleSelectPreset(reason: DoubtReason) {
    if (reason === 'outro') {
      setShowOutroEditor(true);
      return;
    }
    setShowOutroEditor(false);
    commit(reason);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center justify-center rounded-b-md border-t px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-85 ${style.border} ${style.bg} ${style.text}`}
          onClick={(e) => { e.stopPropagation(); handleOpenChange(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Mudar motivo da dúvida"
          disabled={!onSetDoubtReason}
        >
          <span className="truncate">{style.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Motivo da dúvida
          </p>
          {/* Preset buttons (all 6 reasons) */}
          <div className="grid grid-cols-2 gap-1">
            {DOUBT_REASONS.map((r) => {
              const cfg = DOUBT_REASON_CONFIG[r];
              // "Outro" pulses as active either because it's persisted OR because the editor is open
              const active = r === 'outro' ? (currentReason === 'outro' || showOutroEditor) : currentReason === r;
              return (
                <button
                  key={r}
                  type="button"
                  className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                    active
                      ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                  onClick={() => handleSelectPreset(r)}
                >
                  <span className="truncate">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* 'Outro' editor — visible when the persisted reason is 'outro' OR the user just clicked the preset */}
          {showOutroEditor && (
            <div className="space-y-2 border-t pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Motivo
                </label>
                <input
                  type="text"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value.slice(0, 40))}
                  placeholder="Motivo…"
                  maxLength={40}
                  className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cor
                </label>
                <div className="flex flex-wrap gap-1">
                  {CUSTOM_COLOR_CHOICES.map((c) => {
                    const palette = CUSTOM_COLOR_CLASSES[c];
                    const selected = draftColor === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDraftColor(c)}
                        className={`h-6 w-6 rounded-full ${palette.dot} ${
                          selected ? 'ring-2 ring-neutral-900 ring-offset-1' : 'ring-1 ring-black/10'
                        }`}
                        aria-label={`Cor ${c}`}
                      />
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                onClick={() => commit('outro', draftText, draftColor)}
              >
                Guardar
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────── Possibility Reason Strip (POSSIBILIDADE section, real squads only) ───────────── */

/**
 * Bottom strip for Possibilidade cards — when a custom motivo is set, renders a colored
 * label (like Dúvida); when empty, falls back to the pipeline status badge. Click to
 * open a Popover with a free-text Motivo + color palette. Persists on "Guardar".
 */
function PossibilityReasonStrip({
  player,
  effectiveStatus,
  onSetPossibilityReason,
}: {
  player: Player;
  effectiveStatus: RecruitmentStatus;
  onSetPossibilityReason?: (
    playerId: number,
    customText: string | null,
    customColor: string | null
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentText = (player.possibilityReasonCustom ?? '').trim();
  const currentColor = (player.possibilityReasonColor as CustomColorChoice | null) ?? 'slate';

  const [draftText, setDraftText] = useState(currentText);
  const [draftColor, setDraftColor] = useState<CustomColorChoice>(currentColor);

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftText(currentText);
      setDraftColor(currentColor);
    }
    setOpen(next);
  }

  function commit() {
    if (!onSetPossibilityReason) return;
    const text = draftText.trim();
    onSetPossibilityReason(player.id, text || null, text ? draftColor : null);
    setOpen(false);
  }

  function clearMotivo() {
    if (!onSetPossibilityReason) return;
    onSetPossibilityReason(player.id, null, null);
    setOpen(false);
  }

  // When a motivo exists, show it with the custom palette; otherwise fall back to pipeline status badge.
  const hasMotivo = currentText.length > 0;
  const palette = hasMotivo
    ? (CUSTOM_COLOR_CLASSES[currentColor] ?? CUSTOM_COLOR_CLASSES.slate)
    : null;

  // Trigger is the whole bottom strip — disabled when there's no handler (legacy squads)
  const disabled = !onSetPossibilityReason;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center justify-center rounded-b-md border-t px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-85 ${
            hasMotivo && palette
              ? `${palette.border} ${palette.bg} ${palette.text}`
              : 'border-neutral-200 bg-white text-neutral-400'
          }`}
          onClick={(e) => { e.stopPropagation(); handleOpenChange(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={hasMotivo ? 'Editar motivo' : 'Adicionar motivo'}
          disabled={disabled}
        >
          {hasMotivo ? (
            <span className="truncate">{currentText}</span>
          ) : (
            // Fallback shows the pipeline status — keeps parity with the old read-only strip
            <StatusBadge
              status={effectiveStatus}
              variant="compact"
              className="flex w-full items-center justify-center border-0 bg-transparent p-0 text-[9px] uppercase tracking-wider"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Motivo
          </p>
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value.slice(0, 40))}
            placeholder="Motivo…"
            maxLength={40}
            className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs focus:border-neutral-500 focus:outline-none"
          />
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cor
            </label>
            <div className="flex flex-wrap gap-1">
              {CUSTOM_COLOR_CHOICES.map((c) => {
                const pal = CUSTOM_COLOR_CLASSES[c];
                const selected = draftColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraftColor(c)}
                    className={`h-6 w-6 rounded-full ${pal.dot} ${
                      selected ? 'ring-2 ring-neutral-900 ring-offset-1' : 'ring-1 ring-black/10'
                    }`}
                    aria-label={`Cor ${c}`}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex items-stretch gap-1 pt-1">
            <button
              type="button"
              className="flex-1 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
              onClick={commit}
            >
              Guardar
            </button>
            {hasMotivo && (
              <button
                type="button"
                className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                onClick={clearMotivo}
                title="Remover motivo"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

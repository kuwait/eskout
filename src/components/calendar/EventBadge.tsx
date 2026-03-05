// src/components/calendar/EventBadge.tsx
// Card-style event entry for the calendar grid — multi-line, readable, not truncated
// Color-coded left border by event type. Shows time, title, player name.
// RELEVANT FILES: src/components/calendar/CalendarGrid.tsx, src/components/calendar/CalendarList.tsx, src/lib/constants.ts

'use client';

import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType } from '@/lib/types';
import { EVENT_TYPE_LABEL_MAP } from '@/lib/constants';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';

/* ───────────── Color map for left border accent ───────────── */

const BORDER_COLORS: Record<CalendarEventType, string> = {
  treino: 'border-l-blue-500',
  assinatura: 'border-l-green-500',
  reuniao: 'border-l-orange-500',
  observacao: 'border-l-purple-500',
  outro: 'border-l-neutral-400',
};

const BG_COLORS: Record<CalendarEventType, string> = {
  treino: 'bg-blue-50',
  assinatura: 'bg-green-50',
  reuniao: 'bg-orange-50',
  observacao: 'bg-purple-50',
  outro: 'bg-neutral-50',
};

const TEXT_COLORS: Record<CalendarEventType, string> = {
  treino: 'text-blue-700',
  assinatura: 'text-green-700',
  reuniao: 'text-orange-700',
  observacao: 'text-purple-700',
  outro: 'text-neutral-600',
};

/* ───────────── Props ───────────── */

interface EventBadgeProps {
  event: CalendarEvent;
  onClick?: (e: React.MouseEvent) => void;
}

/* ───────────── Component ───────────── */

export function EventBadge({ event, onClick }: EventBadgeProps) {
  const borderColor = BORDER_COLORS[event.eventType] ?? 'border-l-neutral-400';
  const bgColor = BG_COLORS[event.eventType] ?? 'bg-neutral-50';
  const textColor = TEXT_COLORS[event.eventType] ?? 'text-neutral-600';
  const typeLabel = EVENT_TYPE_LABEL_MAP[event.eventType] ?? event.eventType;
  const timeLabel = event.eventTime ? event.eventTime.slice(0, 5) : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded border-l-3 p-1.5 text-left transition-opacity hover:opacity-80',
        borderColor,
        bgColor,
      )}
    >
      {/* Row 1: Type label + time + location (top-right) */}
      <div className="flex items-center gap-1">
        <span className={cn('text-[10px] font-bold uppercase leading-none', textColor)}>
          {typeLabel}
        </span>
        {timeLabel && (
          <span className="text-[10px] font-medium text-neutral-500">{timeLabel}</span>
        )}
        {event.isPlayerDate && (
          <span className="text-[10px] text-neutral-400" title="via Abordagens">&#x25C7;</span>
        )}
        {/* Location pinned to the right */}
        {event.location && (
          <span className="ml-auto text-[10px] text-neutral-400 truncate max-w-[60%] text-right">
            {event.location}
          </span>
        )}
      </div>

      {/* Player name (with photo/placeholder) or title */}
      {event.playerName ? (
        <div className="mt-0.5 flex items-center gap-1.5">
          <PlayerAvatar
            player={{
              name: event.playerName,
              photoUrl: event.playerPhotoUrl,
              club: event.playerClub,
              position: event.playerPosition,
              dob: event.playerDob,
              foot: event.playerFoot,
            }}
            size={20}
          />
          <p className="text-xs font-medium leading-snug text-neutral-900">
            {event.playerName}
          </p>
        </div>
      ) : (
        <p className="mt-0.5 text-xs leading-snug text-neutral-700">
          {event.title}
        </p>
      )}

      {/* Lembrete: show "Assunto: title" since player name is not shown */}
      {event.eventType === 'outro' && event.playerName && (
        <p className="mt-0.5 text-[10px] leading-snug text-neutral-600">
          Assunto: {event.title}
        </p>
      )}

      {/* Assignee if present */}
      {event.assigneeName && (
        <p className="mt-0.5 text-[10px] leading-none text-neutral-400">
          Responsável: {event.assigneeName}
        </p>
      )}

      {/* Notes — always last, separated */}
      {event.notes && (
        <p className="mt-1 border-t border-neutral-200/60 pt-1 text-[10px] leading-snug text-neutral-500 line-clamp-2">
          Notas: {event.notes}
        </p>
      )}
    </button>
  );
}

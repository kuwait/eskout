// src/components/calendar/EventBadge.tsx
// Compact event entry for the calendar grid — color-coded, scannable
// Shows type, time, player (name, position code, club, escalão) or generic title
// RELEVANT FILES: src/components/calendar/CalendarGrid.tsx, src/components/calendar/CalendarList.tsx, src/lib/constants.ts

'use client';

import { cn, shortName } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType } from '@/lib/types';
import { EVENT_TYPE_LABEL_MAP } from '@/lib/constants';

/** Calendar-specific label overrides */
const CALENDAR_LABEL_OVERRIDES: Partial<Record<CalendarEventType, string>> = {
  treino: 'Treino',
};
import { PlayerAvatar } from '@/components/common/PlayerAvatar';

/* ───────────── Color tokens per event type ───────────── */

const ACCENT: Record<CalendarEventType, { border: string; bg: string; badge: string }> = {
  treino:     { border: 'border-l-blue-500',    bg: 'bg-blue-50/80',    badge: 'bg-blue-100 text-blue-700' },
  assinatura: { border: 'border-l-green-500',   bg: 'bg-green-50/80',   badge: 'bg-green-100 text-green-700' },
  reuniao:    { border: 'border-l-orange-500',  bg: 'bg-orange-50/80',  badge: 'bg-orange-100 text-orange-700' },
  observacao: { border: 'border-l-purple-500',  bg: 'bg-purple-50/80',  badge: 'bg-purple-100 text-purple-700' },
  outro:      { border: 'border-l-neutral-400', bg: 'bg-neutral-50/80', badge: 'bg-neutral-100 text-neutral-600' },
};

const DEFAULT_ACCENT = ACCENT.outro;

/* ───────────── Props ───────────── */

interface EventBadgeProps {
  event: CalendarEvent;
  onClick?: (e: React.MouseEvent) => void;
}

/* ───────────── Component ───────────── */

export function EventBadge({ event, onClick }: EventBadgeProps) {
  const colors = ACCENT[event.eventType] ?? DEFAULT_ACCENT;
  const typeLabel = CALENDAR_LABEL_OVERRIDES[event.eventType] ?? EVENT_TYPE_LABEL_MAP[event.eventType] ?? event.eventType;
  const timeLabel = event.eventTime ? event.eventTime.slice(0, 5) : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border-l-[3px] px-2 py-1.5 text-left transition-all',
        'hover:shadow-sm hover:brightness-[0.97]',
        colors.border,
        colors.bg,
      )}
    >
      {/* Row 1: type badge + time + year pill + escalão pill */}
      <div className="flex items-center gap-1">
        <span className={cn('rounded px-1 py-px text-[10px] font-bold uppercase tracking-wide leading-none', colors.badge)}>
          {typeLabel}
        </span>
        {timeLabel && (
          <span className="text-[11px] font-medium text-neutral-500">{timeLabel}</span>
        )}
        {event.isPlayerDate && (
          <span className="text-[10px] text-neutral-400" title="via Abordagens">&#x25C7;</span>
        )}
        {/* Right side: location + year + escalão */}
        <span className="ml-auto flex items-center gap-1 min-w-0">
          {event.location && (
            <span className="truncate text-[10px] text-neutral-400 max-w-[60px]">
              {event.location}
            </span>
          )}
          {event.playerTrainingEscalao && (
            <span className="shrink-0 rounded bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-700">
              {event.playerTrainingEscalao}
            </span>
          )}
        </span>
      </div>

      {/* Row 2: avatar + name + year */}
      {event.playerName ? (
        <>
          <div className="mt-1 flex items-center gap-1">
            <PlayerAvatar
              player={{
                name: event.playerName,
                photoUrl: event.playerPhotoUrl,
                club: event.playerClub,
                position: event.playerPosition,
                dob: event.playerDob,
                foot: event.playerFoot,
              }}
              size={18}
            />
            <span className="truncate text-xs font-semibold leading-none text-neutral-900">
              {shortName(event.playerName)}
              {event.playerDob && (
                <span className="ml-1 font-medium text-neutral-400">{new Date(event.playerDob).getFullYear()}</span>
              )}
            </span>
          </div>
          {/* Row 3: position pill + club */}
          <div className="mt-0.5 flex items-center gap-1 pl-0.5 min-w-0">
            {event.playerPosition && (
              <span className="shrink-0 rounded bg-green-50 px-1 py-px text-[10px] font-semibold text-green-700">
                {event.playerPosition}
              </span>
            )}
            {event.playerClub && (
              <span className="truncate text-[11px] font-medium leading-tight text-neutral-700">
                {event.playerClub}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs font-medium leading-snug text-neutral-800">
          {event.title}
        </p>
      )}

      {/* Lembrete with player: show title */}
      {event.eventType === 'outro' && event.playerName && (
        <p className="mt-0.5 truncate text-[11px] text-neutral-500 italic">{event.title}</p>
      )}

      {/* Assignee */}
      {event.assigneeName && (
        <p className="mt-0.5 truncate text-[11px] text-neutral-400">{event.assigneeName}</p>
      )}

      {/* Notes */}
      {event.notes && (
        <p className="mt-1 border-t border-neutral-200/50 pt-0.5 text-[11px] text-neutral-400 line-clamp-1 italic">
          {event.notes}
        </p>
      )}
    </button>
  );
}

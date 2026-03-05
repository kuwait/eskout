// src/components/calendar/CalendarList.tsx
// Mobile-first list view of calendar events grouped by day
// Simpler than the grid — shows events as cards sorted chronologically
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/components/calendar/EventBadge.tsx, src/lib/constants.ts

'use client';

import { cn } from '@/lib/utils';
import { Clock, GitBranch, MapPin, Users } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import { EVENT_TYPE_COLOR_MAP, EVENT_TYPE_LABEL_MAP } from '@/lib/constants';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';

/* ───────────── Portuguese Day-of-Week Names ───────────── */

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/* ───────────── Props ───────────── */

interface CalendarListProps {
  events: CalendarEvent[];
  year: number;
  month: number;
  onEventClick: (event: CalendarEvent) => void;
}

/* ───────────── Component ───────────── */

export function CalendarList({ events, year, month, onEventClick }: CalendarListProps) {
  // Group events by date
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const existing = grouped.get(event.eventDate) ?? [];
    existing.push(event);
    grouped.set(event.eventDate, existing);
  }

  // Sort dates
  const sortedDates = Array.from(grouped.keys()).sort();
  const today = new Date().toISOString().split('T')[0];

  if (sortedDates.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center text-neutral-400">
        <p className="text-lg font-medium">Sem eventos</p>
        <p className="text-sm">Nenhum evento agendado para este mês</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedDates.map((date) => {
        const dayEvents = grouped.get(date)!;
        const dateObj = new Date(date + 'T00:00:00');
        const dayNumber = dateObj.getDate();
        const weekday = WEEKDAY_NAMES[dateObj.getDay()];
        const isToday = date === today;
        const isPast = date < today;

        return (
          <div key={date}>
            {/* ───────────── Day Header ───────────── */}
            <div className={cn('mb-2 flex items-center gap-2', isPast && 'opacity-60')}>
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold',
                  isToday ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                )}
              >
                {dayNumber}
              </div>
              <div>
                <p className={cn('text-sm font-semibold', isToday && 'text-neutral-900')}>
                  {weekday}
                  {isToday && <span className="ml-1 text-xs text-neutral-400">— Hoje</span>}
                </p>
              </div>
            </div>

            {/* ───────────── Event Cards ───────────── */}
            <div className="ml-5 space-y-2 border-l-2 border-neutral-200 pl-5">
              {dayEvents.map((event) => {
                const colorClass = EVENT_TYPE_COLOR_MAP[event.eventType];
                const typeLabel = EVENT_TYPE_LABEL_MAP[event.eventType];

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick(event)}
                    className="w-full rounded-lg border bg-white p-3 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                  >
                    {/* Type badge + Photo/Placeholder with tooltip + Title/Player */}
                    <div className="mb-1 flex items-center gap-2">
                      <span className={cn('shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold', colorClass)}>
                        {typeLabel}
                      </span>
                      {event.playerName && (
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
                      )}
                      <span className="flex-1 text-sm font-medium">
                        {event.playerName ?? event.title}
                      </span>
                    </div>

                    {/* Lembrete: show "Assunto: title" when player is displayed */}
                    {event.eventType === 'outro' && event.playerName && (
                      <p className="mb-1 text-xs text-neutral-600">Assunto: {event.title}</p>
                    )}

                    {/* Details row */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                      {event.eventTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.eventTime.slice(0, 5)}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                      {event.assigneeName && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Responsável: {event.assigneeName}
                        </span>
                      )}
                      {event.isPlayerDate && (
                        <span className="flex items-center gap-1 text-neutral-400">
                          <GitBranch className="h-3 w-3" />
                          via Abordagens
                        </span>
                      )}
                    </div>

                    {/* Notes — always last, separated */}
                    {event.notes && (
                      <p className="mt-2 border-t pt-1.5 text-xs text-neutral-500 line-clamp-2">
                        Notas: {event.notes}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

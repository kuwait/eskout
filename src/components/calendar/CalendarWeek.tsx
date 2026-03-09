// src/components/calendar/CalendarWeek.tsx
// Weekly view of calendar events — 7 day sections (Monday to Sunday)
// Shows all days including empty ones, events sorted by time within each day
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/components/calendar/CalendarList.tsx, src/lib/utils/dates.ts

'use client';

import { cn } from '@/lib/utils';
import { GitBranch, MapPin, Plus, Users } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import { EVENT_TYPE_COLOR_MAP, EVENT_TYPE_LABEL_MAP } from '@/lib/constants';
import { PlayerAvatar } from '@/components/common/PlayerAvatar';

/* ───────────── Portuguese Day-of-Week Names (Monday first) ───────────── */

const WEEKDAY_NAMES = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

/* ───────────── Props ───────────── */

interface CalendarWeekProps {
  events: CalendarEvent[];
  /** Monday of the displayed week (YYYY-MM-DD) */
  weekStart: string;
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: string) => void;
}

/* ───────────── Component ───────────── */

export function CalendarWeek({ events, weekStart, onEventClick, onDayClick }: CalendarWeekProps) {
  const today = new Date().toISOString().split('T')[0];

  // Build 7 days starting from weekStart (Monday)
  const days: string[] = [];
  const startDate = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${dd}`);
  }

  // Group events by date
  const grouped = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const existing = grouped.get(event.eventDate) ?? [];
    existing.push(event);
    grouped.set(event.eventDate, existing);
  }

  return (
    <div className="space-y-1">
      {days.map((date, i) => {
        const dayEvents = grouped.get(date) ?? [];
        const dateObj = new Date(date + 'T00:00:00');
        const dayNumber = dateObj.getDate();
        const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
        const isToday = date === today;
        const isPast = date < today;

        return (
          <div key={date} className={cn('rounded-lg border bg-white', isPast && !isToday && 'opacity-60')}>
            {/* ───────────── Day Header ───────────── */}
            <button
              type="button"
              onClick={() => onDayClick(date)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  isToday ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
                )}
              >
                {dayNumber}
              </div>
              <div className="flex-1">
                <p className={cn('text-sm font-semibold', isToday && 'text-neutral-900')}>
                  {WEEKDAY_NAMES[i]}
                  <span className="ml-2 font-normal text-neutral-400">{dayNumber}/{monthStr}</span>
                  {isToday && <span className="ml-2 text-xs text-neutral-400">— Hoje</span>}
                </p>
              </div>
              {dayEvents.length === 0 && (
                <Plus className="h-4 w-4 text-neutral-300" />
              )}
            </button>

            {/* ───────────── Event List ───────────── */}
            {dayEvents.length > 0 && (
              <div className="space-y-1 px-4 pb-3">
                {dayEvents.map((event) => {
                  const colorClass = EVENT_TYPE_COLOR_MAP[event.eventType];
                  const typeLabel = EVENT_TYPE_LABEL_MAP[event.eventType];

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      className="flex w-full items-center gap-3 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-left transition-colors hover:bg-neutral-100 active:bg-neutral-200"
                    >
                      {/* Time column */}
                      <span className="w-12 shrink-0 text-sm font-semibold text-neutral-500">
                        {event.eventTime ? event.eventTime.slice(0, 5) : '—'}
                      </span>

                      {/* Player avatar */}
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
                          size={28}
                        />
                      )}

                      {/* Event info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', colorClass)}>
                            {typeLabel}
                          </span>
                          <span className="truncate text-sm font-medium text-neutral-900">
                            {event.playerName ?? event.title}
                          </span>
                        </div>
                        {/* Details row */}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
                          {event.location && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              {event.location}
                            </span>
                          )}
                          {event.assigneeName && (
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {event.assigneeName}
                            </span>
                          )}
                          {event.isPlayerDate && (
                            <span className="flex items-center gap-0.5">
                              <GitBranch className="h-2.5 w-2.5" />
                              via Abordagens
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// src/components/calendar/CalendarGrid.tsx
// Monthly calendar grid for desktop — shows days with event cards
// Each day cell is clickable to create a new event. Cells auto-expand to fit events.
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/components/calendar/EventBadge.tsx, src/lib/constants.ts

'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/types';
import { EventBadge } from '@/components/calendar/EventBadge';

/* ───────────── Portuguese Day Names ───────────── */

const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/* ───────────── Props ───────────── */

interface CalendarGridProps {
  events: CalendarEvent[];
  year: number;
  month: number;
  onDayClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

/* ───────────── Helpers ───────────── */

/** Build array of day cells for the grid, including padding from prev/next months */
function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  // getDay() returns 0=Sun. Convert to Mon=0 for our grid.
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const m = month - 1 < 1 ? 12 : month - 1;
    const y = month - 1 < 1 ? year - 1 : year;
    days.push({
      date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d,
      isCurrentMonth: true,
    });
  }

  // Next month padding (fill to complete last row)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month + 1 > 12 ? 1 : month + 1;
      const y = month + 1 > 12 ? year + 1 : year;
      days.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: false,
      });
    }
  }

  return days;
}

/* ───────────── Component ───────────── */

export function CalendarGrid({ events, year, month, onDayClick, onEventClick }: CalendarGridProps) {
  const days = buildCalendarDays(year, month);
  const today = new Date().toISOString().split('T')[0];

  // Track which day cells are expanded to show all events
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  // Group events by date for quick lookup
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const existing = eventsByDate.get(event.eventDate) ?? [];
    existing.push(event);
    eventsByDate.set(event.eventDate, existing);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      {/* ───────────── Weekday Headers ───────────── */}
      <div className="grid grid-cols-7 border-b bg-neutral-50">
        {WEEKDAY_HEADERS.map((day) => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-neutral-500">
            {day}
          </div>
        ))}
      </div>

      {/* ───────────── Day Cells ───────────── */}
      <div className="grid grid-cols-7">
        {days.map((dayInfo) => {
          const dayEvents = eventsByDate.get(dayInfo.date) ?? [];
          const isToday = dayInfo.date === today;
          // Show max 4 events unless day is expanded
          const MAX_VISIBLE = 4;
          const isExpanded = expandedDays.has(dayInfo.date);
          const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE);
          const hiddenCount = dayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={dayInfo.date}
              className={cn(
                'min-h-[120px] border-b border-r p-1.5 transition-colors cursor-pointer hover:bg-neutral-50/80',
                !dayInfo.isCurrentMonth && 'bg-neutral-50/50'
              )}
              onClick={() => onDayClick(dayInfo.date)}
            >
              {/* Day number */}
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday && 'bg-neutral-900 text-white font-bold',
                    !dayInfo.isCurrentMonth && 'text-neutral-300',
                    dayInfo.isCurrentMonth && !isToday && 'text-neutral-700'
                  )}
                >
                  {dayInfo.day}
                </span>
              </div>

              {/* Event cards */}
              <div className="space-y-1">
                {visibleEvents.map((event) => (
                  <EventBadge
                    key={event.id}
                    event={event}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                  />
                ))}
                {hiddenCount > 0 && !isExpanded && (
                  <button
                    type="button"
                    className="px-1 text-[10px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(dayInfo.date);
                    }}
                  >
                    +{hiddenCount} mais
                  </button>
                )}
                {isExpanded && dayEvents.length > MAX_VISIBLE && (
                  <button
                    type="button"
                    className="px-1 text-[10px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(dayInfo.date);
                    }}
                  >
                    ver menos
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

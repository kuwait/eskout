// src/lib/utils/dates.ts
// Date utility functions for calendar navigation (week ranges, formatting)
// Used by calendar page and CalendarView for week-based navigation
// RELEVANT FILES: src/app/calendario/page.tsx, src/components/calendar/CalendarView.tsx, src/components/calendar/CalendarWeek.tsx

/**
 * Get the Monday–Sunday date range for the week containing a given date.
 * Week starts on Monday (Portuguese/European convention).
 */
export function getWeekRange(dateStr: string): { start: string; end: string } {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat — shift so Mon=0
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: toDateString(monday),
    end: toDateString(sunday),
  };
}

/** Navigate weeks: returns the Monday of the week offset by `delta` weeks from `currentStart` */
export function shiftWeek(currentStart: string, delta: number): string {
  const date = new Date(currentStart + 'T00:00:00');
  date.setDate(date.getDate() + delta * 7);
  return toDateString(date);
}

/** Format date as YYYY-MM-DD */
function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

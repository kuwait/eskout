// src/components/calendar/CalendarView.tsx
// Main calendar view — supports month (grid/list) and week views
// View toggle is client-side (instant); only navigates to server when changing month/week out of range
// RELEVANT FILES: src/components/calendar/EventForm.tsx, src/components/calendar/CalendarExport.tsx, src/app/calendario/page.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, LayoutList, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CalendarEvent, Profile } from '@/lib/types';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { CalendarList } from '@/components/calendar/CalendarList';
import { CalendarWeek } from '@/components/calendar/CalendarWeek';
import { EventForm } from '@/components/calendar/EventForm';
import { CalendarExport } from '@/components/calendar/CalendarExport';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { getWeekRange, shiftWeek } from '@/lib/utils/dates';

/* ───────────── Portuguese Month Names ───────────── */

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ───────────── Props ───────────── */

type CalendarViewType = 'month' | 'week';

interface CalendarViewProps {
  events: CalendarEvent[];
  profiles: Profile[];
  year: number;
  month: number;
  initialView?: CalendarViewType;
  /** Monday of the week (YYYY-MM-DD), provided when view=week from server */
  weekStart?: string;
}

export function CalendarView({ events, profiles, year, month, initialView = 'month', weekStart: initialWeekStart }: CalendarViewProps) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [view, setView] = useState<CalendarViewType>(initialView);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Year/month shown in the picker popover (can differ from the loaded data while browsing)
  const [pickerYear, setPickerYear] = useState(year);
  const [pickerMonth, setPickerMonth] = useState(month);

  // Week start is client-side state — computed from today when switching to week view
  const [weekStart, setWeekStart] = useState<string>(
    initialWeekStart ?? getWeekRange(new Date().toISOString().split('T')[0]).start
  );

  /* ───────────── Realtime: refresh when other users modify calendar events ───────────── */

  useRealtimeTable('calendar_events', { onAny: () => router.refresh() });

  /* ───────────── Derived: events filtered for current week ───────────── */

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }, [weekStart]);

  const weekEvents = useMemo(() => {
    if (view !== 'week') return events;
    return events.filter((e) => e.eventDate >= weekStart && e.eventDate <= weekEnd);
  }, [events, view, weekStart, weekEnd]);

  /* ───────────── Navigation ───────────── */

  function navigateMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    startNavigation(() => router.push(`/calendario?year=${newYear}&month=${newMonth}`));
  }

  function navigateWeek(delta: number) {
    const newStart = shiftWeek(weekStart, delta);
    // Check if new week is still within the loaded month's data range
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const newEnd = (() => {
      const d = new Date(newStart + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // If the new week overlaps the current month, stay client-side
    if (newStart <= monthEnd && newEnd >= monthStart) {
      setWeekStart(newStart);
    } else {
      // Navigate to a new month to fetch fresh data
      const anchor = new Date(newStart + 'T00:00:00');
      startNavigation(() => router.push(`/calendario?view=week&date=${newStart}&year=${anchor.getFullYear()}&month=${anchor.getMonth() + 1}`));
    }
  }

  function switchView(newView: CalendarViewType) {
    if (newView === view) return;
    if (newView === 'week') {
      // Compute week from today, stay client-side
      const todayStr = new Date().toISOString().split('T')[0];
      setWeekStart(getWeekRange(todayStr).start);
    }
    setView(newView);
  }

  /* ───────────── Labels ───────────── */

  function getSubtitle(): string {
    if (view === 'week') {
      return formatWeekRange(weekStart);
    }
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  function getWeekButtonLabel(): string {
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const sDay = start.getDate();
    const eDay = end.getDate();
    const sMonth = MONTH_SHORT[start.getMonth()];
    const eMonth = MONTH_SHORT[end.getMonth()];
    if (start.getMonth() === end.getMonth()) {
      return `${sDay}–${eDay} ${sMonth}`;
    }
    return `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
  }

  /** Label for the center nav button in month view — always shows current month/year */
  function getMonthButtonLabel(): string {
    return `${MONTH_NAMES[month - 1]} ${year}`;
  }

  /** Navigate to a specific week (from picker) — client-side if within loaded month, otherwise server */
  function goToWeek(start: string, y: number, m: number) {
    // If week is within the already-loaded month, stay client-side
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const wEnd = (() => {
      const d = new Date(start + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    if (start <= monthEnd && wEnd >= monthStart) {
      setWeekStart(start);
    } else {
      startNavigation(() => router.push(`/calendario?view=week&date=${start}&year=${y}&month=${m}`));
    }
  }

  /** Navigate to a specific month (from picker) */
  function goToMonth(m: number, y: number) {
    setPickerOpen(false);
    if (view === 'week') {
      // In week view, go to first Monday of that month
      const firstDay = new Date(y, m - 1, 1);
      const { start } = getWeekRange(firstDay.toISOString().split('T')[0]);
      startNavigation(() => router.push(`/calendario?view=week&date=${start}&year=${y}&month=${m}`));
    } else {
      startNavigation(() => router.push(`/calendario?year=${y}&month=${m}`));
    }
  }

  /** Get weeks of a month for the week picker */
  function getWeeksOfMonth(y: number, m: number): { start: string; label: string }[] {
    const weeks: { start: string; label: string }[] = [];
    const seen = new Set<string>();
    // Iterate through all days of the month
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const { start } = getWeekRange(date.toISOString().split('T')[0]);
      if (seen.has(start)) continue;
      seen.add(start);
      const startDate = new Date(start + 'T00:00:00');
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      const sDay = startDate.getDate();
      const eDay = endDate.getDate();
      const sMonth = MONTH_SHORT[startDate.getMonth()];
      const eMonth = MONTH_SHORT[endDate.getMonth()];
      const label = startDate.getMonth() === endDate.getMonth()
        ? `${sDay}–${eDay} ${sMonth}`
        : `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
      weeks.push({ start, label });
    }
    return weeks;
  }

  /* ───────────── Event Handlers ───────────── */

  function handleDayClick(date: string) {
    setPrefillDate(date);
    setEditingEvent(null);
    setShowEventForm(true);
  }

  function handleEventClick(event: CalendarEvent) {
    setEditingEvent(event);
    setPrefillDate(null);
    setShowEventForm(true);
  }

  function handleFormClose() {
    setShowEventForm(false);
    setEditingEvent(null);
    setPrefillDate(null);
  }

  function handleNewEvent() {
    setEditingEvent(null);
    setPrefillDate(null);
    setShowEventForm(true);
  }

  return (
    <div>
      {/* ───────────── Header ───────────── */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold lg:text-2xl">Calendário</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowExport(true)}
            title="Exportar calendário"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleNewEvent} aria-label="Novo evento">
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Novo Evento</span>
          </Button>
        </div>
      </div>

      {/* ───────────── Navigation + View Toggle ───────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Período anterior" onClick={() => view === 'week' ? navigateWeek(-1) : navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (open) { setPickerYear(year); setPickerMonth(month); } }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[140px] max-w-[140px]">
                {view === 'week' ? getWeekButtonLabel() : getMonthButtonLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-3">
              {/* Year navigation */}
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => setPickerYear((y) => y - 1)} className="rounded p-1 hover:bg-neutral-100" aria-label="Ano anterior">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold">{pickerYear}</span>
                <button type="button" onClick={() => setPickerYear((y) => y + 1)} className="rounded p-1 hover:bg-neutral-100" aria-label="Próximo ano">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {view === 'week' ? (
                /* ── Week picker: month selector + weeks list ── */
                <div>
                  {/* Month selector — updates weeks below, does NOT navigate */}
                  <div className="mb-2 grid grid-cols-4 gap-1">
                    {MONTH_SHORT.map((name, i) => {
                      const m = i + 1;
                      const isSelected = m === pickerMonth;
                      const now = new Date();
                      const isCurrentMonth = pickerYear === now.getFullYear() && m === now.getMonth() + 1;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setPickerMonth(m)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-neutral-900 text-white'
                              : isCurrentMonth
                                ? 'ring-1 ring-emerald-500 text-emerald-600 hover:bg-neutral-100'
                                : 'hover:bg-neutral-100'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  {/* Weeks of the selected picker month */}
                  <div className="space-y-1 border-t pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-neutral-400">Semanas de {MONTH_NAMES[pickerMonth - 1]}</p>
                    {getWeeksOfMonth(pickerYear, pickerMonth).map((w) => {
                      const isSelected = w.start === weekStart;
                      const isCurrent = w.start === getWeekRange(new Date().toISOString().split('T')[0]).start;
                      return (
                        <button
                          key={w.start}
                          type="button"
                          onClick={() => { setPickerOpen(false); goToWeek(w.start, pickerYear, pickerMonth); }}
                          className={`w-full rounded px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-neutral-900 text-white'
                              : isCurrent
                                ? 'ring-1 ring-emerald-500 hover:bg-neutral-100'
                                : 'hover:bg-neutral-100'
                          }`}
                        >
                          {w.label}
                          {isCurrent && !isSelected && <span className="ml-1 text-[10px] text-emerald-500">semana atual</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── Month picker: 4x3 grid ── */
                <div className="grid grid-cols-4 gap-1">
                  {MONTH_SHORT.map((name, i) => {
                    const m = i + 1;
                    const isLoaded = pickerYear === year && m === month;
                    const now = new Date();
                    const isCurrentMonth = pickerYear === now.getFullYear() && m === now.getMonth() + 1;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => goToMonth(m, pickerYear)}
                        className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                          isLoaded
                            ? 'bg-neutral-900 text-white'
                            : isCurrentMonth
                              ? 'ring-1 ring-emerald-500 text-emerald-600 hover:bg-neutral-100'
                              : 'hover:bg-neutral-100'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Período seguinte" onClick={() => view === 'week' ? navigateWeek(1) : navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* View toggle — instant, no server roundtrip */}
        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => switchView('month')}
            className={`flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'month' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
            title="Vista mensal"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mês</span>
          </button>
          <button
            type="button"
            onClick={() => switchView('week')}
            className={`flex items-center gap-1.5 rounded-r-md border-l px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'week' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
            title="Vista semanal"
          >
            <LayoutList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Semana</span>
          </button>
        </div>
      </div>

      {/* ───────────── Calendar Content ───────────── */}
      {isNavigating ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : view === 'week' ? (
        <CalendarWeek
          events={weekEvents}
          weekStart={weekStart}
          onEventClick={handleEventClick}
          onDayClick={handleDayClick}
        />
      ) : (
        <>
          {/* Month: Grid (desktop) / List (mobile) */}
          <div className="hidden md:block">
            <CalendarGrid
              events={events}
              year={year}
              month={month}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          </div>
          <div className="md:hidden">
            <CalendarList
              events={events}
              year={year}
              month={month}
              onEventClick={handleEventClick}
            />
          </div>
        </>
      )}

      {/* ───────────── Event Form Dialog ───────────── */}
      {showEventForm && (
        <EventForm
          event={editingEvent}
          prefillDate={prefillDate}
          profiles={profiles}
          onClose={handleFormClose}
        />
      )}

      {/* ───────────── Export Dialog ───────────── */}
      {showExport && (
        <CalendarExport
          events={events}
          monthName={getSubtitle()}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

/* ───────────── Helpers ───────────── */

/** Format week range: "10–16 Mar 2026" or "28 Fev – 6 Mar 2026" */
function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = MONTH_SHORT[start.getMonth()];
  const eMonth = MONTH_SHORT[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${sDay}–${eDay} ${sMonth} ${start.getFullYear()}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${end.getFullYear()}`;
}

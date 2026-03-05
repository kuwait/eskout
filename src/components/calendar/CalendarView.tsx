// src/components/calendar/CalendarView.tsx
// Main calendar view — month grid on desktop, list view on mobile
// Handles navigation between months and event creation/editing
// RELEVANT FILES: src/components/calendar/EventForm.tsx, src/components/calendar/CalendarExport.tsx, src/app/calendario/page.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CalendarEvent, Player, Profile } from '@/lib/types';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { CalendarList } from '@/components/calendar/CalendarList';
import { EventForm } from '@/components/calendar/EventForm';
import { CalendarExport } from '@/components/calendar/CalendarExport';

/* ───────────── Portuguese Month Names ───────────── */

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/* ───────────── Props ───────────── */

interface CalendarViewProps {
  events: CalendarEvent[];
  profiles: Profile[];
  allPlayers: Player[];
  year: number;
  month: number;
}

export function CalendarView({ events, profiles, allPlayers, year, month }: CalendarViewProps) {
  const router = useRouter();
  const [showEventForm, setShowEventForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  // Pre-fill date when clicking a day cell
  const [prefillDate, setPrefillDate] = useState<string | null>(null);

  /* ───────────── Month Navigation ───────────── */

  function navigateMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    router.push(`/calendario?year=${newYear}&month=${newMonth}`);
  }

  function goToToday() {
    const now = new Date();
    router.push(`/calendario?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  }

  /* ───────────── Event Handlers ───────────── */

  function handleDayClick(date: string) {
    setPrefillDate(date);
    setEditingEvent(null);
    setShowEventForm(true);
  }

  function handleEventClick(event: CalendarEvent) {
    // All events open the form — pipeline-derived events are editable too (bidirectional sync)
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
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">Calendário</h1>
          <p className="text-sm text-muted-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
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
          <Button size="sm" onClick={handleNewEvent}>
            <Plus className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">Novo Evento</span>
          </Button>
        </div>
      </div>

      {/* ───────────── Month Navigation ───────────── */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ───────────── Calendar Grid (desktop) / List (mobile) ───────────── */}
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

      {/* ───────────── Event Form Dialog ───────────── */}
      {showEventForm && (
        <EventForm
          event={editingEvent}
          prefillDate={prefillDate}
          profiles={profiles}
          allPlayers={allPlayers}
          onClose={handleFormClose}
        />
      )}

      {/* ───────────── Export Dialog ───────────── */}
      {showExport && (
        <CalendarExport
          events={events}
          monthName={`${MONTH_NAMES[month - 1]} ${year}`}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

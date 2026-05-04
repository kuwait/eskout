// src/components/calendar/CalendarExport.tsx
// Export calendar events as ICS (iCalendar) or CSV file
// ICS works with Google Calendar, Apple Calendar, Outlook. CSV for spreadsheets.
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/lib/types/index.ts, src/lib/constants.ts

'use client';

import { X, Calendar, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { CalendarEvent } from '@/lib/types';
import { EVENT_TYPE_LABEL_MAP } from '@/lib/constants';

/* ───────────── Props ───────────── */

interface CalendarExportProps {
  events: CalendarEvent[];
  monthName: string;
  onClose: () => void;
}

/* ───────────── ICS Generation ───────────── */

function generateICS(events: CalendarEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eskout//Calendario//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    // Build date/time string: if time exists use DTSTART with time, else all-day
    const dateClean = event.eventDate.replace(/-/g, '');
    const hasTime = !!event.eventTime;
    let dtStart: string;
    let dtEnd: string;

    if (hasTime) {
      const timeClean = event.eventTime!.replace(/:/g, '').slice(0, 4) + '00';
      dtStart = `${dateClean}T${timeClean}`;
      // Default duration: 1 hour
      const startHour = parseInt(event.eventTime!.slice(0, 2), 10);
      const endHour = String(Math.min(startHour + 1, 23)).padStart(2, '0');
      const endTimeClean = `${endHour}${event.eventTime!.slice(3, 5)}00`;
      dtEnd = `${dateClean}T${endTimeClean}`;
    } else {
      dtStart = dateClean;
      // All-day: end is next day
      const nextDay = new Date(event.eventDate);
      nextDay.setDate(nextDay.getDate() + 1);
      dtEnd = nextDay.toISOString().split('T')[0].replace(/-/g, '');
    }

    const typeLabel = EVENT_TYPE_LABEL_MAP[event.eventType] ?? event.eventType;
    const summary = escapeICS(`[${typeLabel}] ${event.title}`);
    const description = escapeICS(
      [
        event.playerName ? `Jogador: ${event.playerName}` : '',
        event.assigneeName ? `Responsável: ${event.assigneeName}` : '',
        event.notes || '',
      ].filter(Boolean).join('\\n')
    );

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:eskout-${event.id}@eskout.app`);
    if (hasTime) {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    }
    lines.push(`SUMMARY:${summary}`);
    if (description) lines.push(`DESCRIPTION:${description}`);
    if (event.location) lines.push(`LOCATION:${escapeICS(event.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Escape special ICS characters */
function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/* ───────────── CSV Generation ───────────── */

function generateCSV(events: CalendarEvent[]): string {
  const headers = ['Data', 'Hora', 'Tipo', 'Título', 'Jogador', 'Responsável', 'Local', 'Notas'];
  const rows = events.map((e) => [
    formatDatePT(e.eventDate),
    e.eventTime?.slice(0, 5) ?? '',
    EVENT_TYPE_LABEL_MAP[e.eventType] ?? e.eventType,
    e.title,
    e.playerName ?? '',
    e.assigneeName,
    e.location,
    e.notes,
  ]);

  // CSV with BOM for Excel compatibility
  const BOM = '\uFEFF';
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  return BOM + csvContent;
}

/** Format date as dd/MM/yyyy */
function formatDatePT(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/* ───────────── Download Helper ───────────── */

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ───────────── Component ───────────── */

export function CalendarExport({ events, monthName, onClose }: CalendarExportProps) {
  function handleExportICS() {
    if (events.length === 0) {
      toast.error('Sem eventos para exportar');
      return;
    }
    const ics = generateICS(events);
    const filename = `eskout-calendario-${monthName.replace(' ', '-').toLowerCase()}.ics`;
    downloadFile(ics, filename, 'text/calendar;charset=utf-8');
    toast.success('Ficheiro ICS exportado');
    onClose();
  }

  function handleExportCSV() {
    if (events.length === 0) {
      toast.error('Sem eventos para exportar');
      return;
    }
    const csv = generateCSV(events);
    const filename = `eskout-calendario-${monthName.replace(' ', '-').toLowerCase()}.csv`;
    downloadFile(csv, filename, 'text/csv;charset=utf-8');
    toast.success('Ficheiro CSV exportado');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-xl bg-white p-4 sm:rounded-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Exportar Calendário</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-4 text-sm text-neutral-500">
          {events.length} evento{events.length !== 1 ? 's' : ''} em {monthName}
        </p>

        <div className="space-y-2">
          {/* ICS export */}
          <button
            type="button"
            onClick={handleExportICS}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-neutral-50"
          >
            <Calendar className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium">Calendário (ICS)</p>
              <p className="text-xs text-neutral-400">Google Calendar, Apple, Outlook</p>
            </div>
          </button>

          {/* CSV export */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-neutral-50"
          >
            <FileSpreadsheet className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium">Folha de Cálculo (CSV)</p>
              <p className="text-xs text-neutral-400">Excel, Google Sheets</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

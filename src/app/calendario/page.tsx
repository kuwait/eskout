// src/app/calendario/page.tsx
// Calendar page — shows monthly or weekly view of events (treinos, assinaturas, reunioes, etc.)
// Server component that fetches data and passes to client calendar view
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/lib/supabase/queries.ts, src/actions/calendar.ts

import { getCalendarEvents, getAllProfiles } from '@/lib/supabase/queries';
import { CalendarView } from '@/components/calendar/CalendarView';
import { getWeekRange } from '@/lib/utils/dates';

interface CalendarPageProps {
  searchParams: Promise<{ year?: string; month?: string; view?: string; date?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const now = new Date();
  const view = (params.view === 'week' ? 'week' : 'month') as 'month' | 'week';

  // For week view with explicit date param, derive year/month from that date
  // so we fetch the right month's data to cover the week
  let year: number;
  let month: number;
  let weekStart: string | undefined;

  if (view === 'week' && params.date) {
    const anchor = new Date(params.date + 'T00:00:00');
    year = params.year ? parseInt(params.year, 10) : anchor.getFullYear();
    month = params.month ? parseInt(params.month, 10) : anchor.getMonth() + 1;
    weekStart = getWeekRange(params.date).start;
  } else {
    year = params.year ? parseInt(params.year, 10) : now.getFullYear();
    month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;
  }

  // Fetch events and profiles (for assignee dropdown) in parallel
  const [events, profiles] = await Promise.all([
    getCalendarEvents(year, month),
    getAllProfiles(),
  ]);

  return (
    <div className="p-4 lg:p-6">
      <CalendarView
        events={events}
        profiles={profiles}
        year={year}
        month={month}
        initialView={view}
        weekStart={weekStart}
      />
    </div>
  );
}

// src/app/calendario/page.tsx
// Calendar page — shows monthly view of events (treinos, assinaturas, reuniões, etc.)
// Server component that fetches data and passes to client calendar view
// RELEVANT FILES: src/components/calendar/CalendarView.tsx, src/lib/supabase/queries.ts, src/actions/calendar.ts

import { getCalendarEvents, getAllProfiles, getAllPlayers } from '@/lib/supabase/queries';
import { CalendarView } from '@/components/calendar/CalendarView';

interface CalendarPageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  // Fetch events, profiles (for assignee dropdown), and all players (for picker) in parallel
  const [events, profiles, allPlayers] = await Promise.all([
    getCalendarEvents(year, month),
    getAllProfiles(),
    getAllPlayers(),
  ]);

  return (
    <div className="p-4 lg:p-6">
      <CalendarView
        events={events}
        profiles={profiles}
        allPlayers={allPlayers}
        year={year}
        month={month}
      />
    </div>
  );
}

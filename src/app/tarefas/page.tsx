// src/app/tarefas/page.tsx
// Personal tasks page — TODO list with manual + auto-generated tasks from pipeline + flagged notes
// Scouts are excluded (no tasks for scouts). Replaces /alertas for flagged observation notes.
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/actions/tasks.ts, src/lib/supabase/queries.ts

import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { getMyTasks } from '@/actions/tasks';
import { getFlaggedNotes } from '@/lib/supabase/queries';
import { getClubMembers } from '@/actions/users';
import { TasksView } from '@/components/tasks/TasksView';

/** Pick first valid absolute http(s) URL, rejecting placeholders and relative paths */
function pickValidUrl(...urls: (string | null | undefined)[]): string | null {
  for (const url of urls) {
    if (url && url.startsWith('http') && !url.includes('placeholder')) return url;
  }
  return null;
}

export default async function TarefasPage() {
  const { clubId, role } = await getActiveClub();
  const supabase = await createClient();

  // Fetch tasks, flagged notes, and club members in parallel
  const [tasks, flaggedNotes, clubMembers] = await Promise.all([
    getMyTasks(),
    getFlaggedNotes(),
    getClubMembers(),
  ]);

  // Fetch all players with paginated loop (Supabase default limit = 1000)
  const PAGE = 1000;
  const allPlayers: { id: number; name: string; club: string; position: string; photoUrl: string | null }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, club, position_normalized, photo_url, zz_photo_url')
      .eq('club_id', clubId)
      .order('name')
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    for (const p of data) {
      allPlayers.push({
        id: p.id as number,
        name: p.name as string,
        club: (p.club ?? '') as string,
        position: (p.position_normalized ?? '') as string,
        photoUrl: pickValidUrl(p.photo_url, p.zz_photo_url),
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return (
    <div className="p-4 lg:p-6">
      <TasksView
        initialTasks={tasks}
        flaggedNotes={flaggedNotes}
        userRole={role}
        clubMembers={clubMembers}
        allPlayers={allPlayers}
      />
    </div>
  );
}

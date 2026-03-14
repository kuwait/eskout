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
  const { role } = await getActiveClub();
  const supabase = await createClient();

  // Fetch tasks, flagged notes, and club members in parallel
  const [tasks, flaggedNotes, clubMembers] = await Promise.all([
    getMyTasks(),
    getFlaggedNotes(),
    getClubMembers(),
  ]);

  // Fetch photos only for players referenced in tasks (not all 6000)
  const taskPlayerIds = tasks.map((t) => t.playerId).filter((id): id is number => id !== null);
  let playerPhotos: { id: number; photoUrl: string | null }[] = [];
  if (taskPlayerIds.length > 0) {
    const { data } = await supabase
      .from('players')
      .select('id, photo_url, zz_photo_url')
      .in('id', taskPlayerIds);
    if (data) {
      playerPhotos = data.map((p) => ({
        id: p.id as number,
        photoUrl: pickValidUrl(p.photo_url, p.zz_photo_url),
      }));
    }
  }

  return (
    <div className="p-4 lg:p-6">
      <TasksView
        initialTasks={tasks}
        flaggedNotes={flaggedNotes}
        userRole={role}
        clubMembers={clubMembers}
        playerPhotos={playerPhotos}
      />
    </div>
  );
}

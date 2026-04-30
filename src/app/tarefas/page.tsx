// src/app/tarefas/page.tsx
// Personal tasks page — TODO list with manual + auto-generated tasks from pipeline + flagged notes
// Scouts are excluded (no tasks for scouts). Replaces /alertas for flagged observation notes.
// RELEVANT FILES: src/components/tasks/TasksView.tsx, src/actions/tasks.ts, src/lib/supabase/queries.ts

import { getAuthContext } from '@/lib/supabase/club-context';
import { getMyTasks } from '@/actions/tasks';
import { getFlaggedNotes } from '@/lib/supabase/queries';
import { getClubMembers } from '@/actions/users';
import { TasksView } from '@/components/tasks/TasksView';

export default async function TarefasPage() {
  const { role, userId } = await getAuthContext();

  // Fetch tasks, flagged notes, and club members in parallel.
  // Player photo URLs are now embedded in each task (see mapUserTaskRow), so a separate
  // fetch is no longer needed — and admin viewing other users' tasks now gets photos too.
  const [tasks, flaggedNotes, clubMembers] = await Promise.all([
    getMyTasks(),
    getFlaggedNotes(),
    getClubMembers(),
  ]);

  return (
    <div className="p-4 lg:p-6">
      <TasksView
        initialTasks={tasks}
        flaggedNotes={flaggedNotes}
        userRole={role}
        currentUserId={userId}
        clubMembers={clubMembers}
      />
    </div>
  );
}

// src/actions/tasks.ts
// Server Actions for personal user tasks (TODO list)
// CRUD for manual tasks + auto-task queries
// RELEVANT FILES: src/actions/pipeline.ts, src/lib/types/index.ts, src/lib/supabase/mappers.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { mapUserTaskRow } from '@/lib/supabase/mappers';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import type { ActionResponse, UserTask } from '@/lib/types';

/* ───────────── Queries ───────────── */

/** Get all tasks for the current user (or all club tasks if admin + userId provided) */
export async function getMyTasks(targetUserId?: string): Promise<UserTask[]> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();
  const queryUserId = (role === 'admin' && targetUserId) ? targetUserId : userId;

  const { data, error } = await supabase
    .from('user_tasks')
    .select('*, players(name, contact, club, meeting_date, signing_date, meeting_attendees, signing_attendees)')
    .eq('club_id', clubId)
    .eq('user_id', queryUserId)
    .order('completed', { ascending: true })
    .order('pinned', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapUserTaskRow);
}

/** Get pending task count for current user (for nav badge) */
export async function getMyTaskCount(): Promise<number> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from('user_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('completed', false);

  return count ?? 0;
}

/* ───────────── Mutations ───────────── */

/** Create a manual task */
export async function createTask(
  title: string,
  opts?: { playerId?: number; dueDate?: string; targetUserId?: string }
): Promise<ActionResponse<{ id: number }>> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') {
    return { success: false, error: 'Sem permissão' };
  }

  if (!title.trim()) {
    return { success: false, error: 'Título obrigatório' };
  }

  // Only admin can create tasks for others
  const targetUser = (role === 'admin' && opts?.targetUserId) ? opts.targetUserId : userId;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_tasks')
    .insert({
      club_id: clubId,
      user_id: targetUser,
      created_by: userId,
      player_id: opts?.playerId ?? null,
      title: title.trim(),
      due_date: opts?.dueDate ?? null,
      source: 'manual',
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: `Erro ao criar tarefa: ${error.message}` };
  }

  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'user_tasks', 'INSERT', userId, data.id);

  return { success: true, data: { id: data.id } };
}

/** Toggle task completion.
 *  When uncompleting an auto-task, if a pending duplicate exists (same user+player+source),
 *  delete the duplicate first to avoid unique constraint violation. */
export async function toggleTask(taskId: number): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // Get current state (include source + player_id for dedup check)
  const { data: task } = await supabase
    .from('user_tasks')
    .select('completed, user_id, source, player_id')
    .eq('id', taskId)
    .eq('club_id', clubId)
    .single();

  if (!task) {
    return { success: false, error: 'Tarefa não encontrada' };
  }
  if (task.user_id !== userId) {
    return { success: false, error: 'Sem permissão' };
  }

  const newCompleted = !task.completed;

  // When uncompleting an auto-task, check for pending duplicate and remove it
  if (!newCompleted && task.source !== 'manual' && task.player_id) {
    const { data: duplicate } = await supabase
      .from('user_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('player_id', task.player_id)
      .eq('source', task.source)
      .eq('completed', false)
      .neq('id', taskId)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      await supabase.from('user_tasks').delete().eq('id', duplicate.id);
      await broadcastRowMutation(clubId, 'user_tasks', 'DELETE', userId, duplicate.id);
    }
  }

  const { error } = await supabase
    .from('user_tasks')
    .update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: `Erro ao atualizar tarefa: ${error.message}` };
  }

  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, taskId);

  return { success: true };
}

/** Update a task (title, due date, player) */
export async function updateTask(
  taskId: number,
  updates: { title?: string; dueDate?: string | null; playerId?: number | null }
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  const supabase = await createClient();

  // Check ownership
  const { data: task } = await supabase
    .from('user_tasks')
    .select('user_id')
    .eq('id', taskId)
    .eq('club_id', clubId)
    .single();

  if (!task) {
    return { success: false, error: 'Tarefa não encontrada' };
  }
  if (task.user_id !== userId && role !== 'admin') {
    return { success: false, error: 'Sem permissão' };
  }

  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) {
    if (!updates.title.trim()) return { success: false, error: 'Título obrigatório' };
    payload.title = updates.title.trim();
  }
  if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
  if (updates.playerId !== undefined) payload.player_id = updates.playerId;

  if (Object.keys(payload).length === 0) {
    return { success: true };
  }

  const { error } = await supabase
    .from('user_tasks')
    .update(payload)
    .eq('id', taskId);

  if (error) {
    return { success: false, error: `Erro ao atualizar tarefa: ${error.message}` };
  }

  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'user_tasks', 'UPDATE', userId, taskId);

  return { success: true };
}

/** Delete a task (only own manual tasks, or admin can delete any) */
export async function deleteTask(taskId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  const supabase = await createClient();

  // Check ownership: user can only delete tasks they created, unless admin
  const { data: task } = await supabase
    .from('user_tasks')
    .select('user_id, created_by')
    .eq('id', taskId)
    .eq('club_id', clubId)
    .single();

  if (!task) {
    return { success: false, error: 'Tarefa não encontrada' };
  }
  // Non-admin can only delete their own self-created tasks
  if (role !== 'admin' && (task.user_id !== userId || task.created_by !== userId)) {
    return { success: false, error: 'Sem permissão para eliminar esta tarefa' };
  }

  const { error } = await supabase
    .from('user_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    return { success: false, error: `Erro ao eliminar tarefa: ${error.message}` };
  }

  revalidatePath('/tarefas');
  await broadcastRowMutation(clubId, 'user_tasks', 'DELETE', userId, taskId);

  return { success: true };
}

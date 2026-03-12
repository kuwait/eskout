// src/actions/master-activity.ts
// Server Action to fetch a user's activity timeline from all tracked tables
// Aggregates status_history, observation_notes, training_feedback, scout_evaluations, calendar_events, user_tasks, players
// RELEVANT FILES: src/app/master/online/OnlinePageClient.tsx, src/actions/master-users.ts, src/lib/supabase/server.ts

'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

/* ───────────── Types ───────────── */

export interface ActivityTimelineItem {
  id: string;
  type: 'status_change' | 'observation_note' | 'training_feedback' | 'scout_evaluation' | 'calendar_event' | 'task' | 'player_created' | 'player_approved';
  /** Human-readable description */
  description: string;
  /** Extra detail line (optional) */
  detail?: string;
  /** Player name if relevant */
  playerName?: string;
  createdAt: string;
}

/* ───────────── Main Action ───────────── */

export async function getUserActivityTimeline(
  userId: string,
  limit = 50,
): Promise<{ success: true; items: ActivityTimelineItem[] } | { success: false; error: string }> {
  // Auth + superadmin check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_superadmin) return { success: false, error: 'Acesso negado' };

  const service = await createServiceClient();
  const items: ActivityTimelineItem[] = [];

  // Parallel queries — all limited to recent activity
  const [
    statusRes,
    notesRes,
    feedbackRes,
    evalsRes,
    calendarRes,
    tasksCompletedRes,
    playersCreatedRes,
    playersApprovedRes,
  ] = await Promise.all([
    // 1. Status history — field changes
    service
      .from('status_history')
      .select('id, field_changed, old_value, new_value, notes, created_at, players(name)')
      .eq('changed_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 2. Observation notes
    service
      .from('observation_notes')
      .select('id, content, match_context, created_at, players(name)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 3. Training feedback
    service
      .from('training_feedback')
      .select('id, training_date, presence, feedback, rating, created_at, players(name)')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 4. Scout evaluations
    service
      .from('scout_evaluations')
      .select('id, rating, created_at, updated_at, players(name)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),

    // 5. Calendar events created
    service
      .from('calendar_events')
      .select('id, title, event_type, event_date, created_at, players(name)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 6. Tasks completed
    service
      .from('user_tasks')
      .select('id, title, completed, completed_at, created_at, players(name)')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(limit),

    // 7. Players created
    service
      .from('players')
      .select('id, name, created_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // 8. Players approved
    service
      .from('players')
      .select('id, name, updated_at')
      .eq('approved_by', userId)
      .order('updated_at', { ascending: false })
      .limit(limit),
  ]);

  // Map status_history
  for (const row of statusRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    const fieldLabel = FIELD_LABELS[row.field_changed] ?? row.field_changed;
    items.push({
      id: `sh-${row.id}`,
      type: 'status_change',
      description: `Alterou ${fieldLabel}`,
      detail: row.old_value || row.new_value
        ? `${row.old_value || '(vazio)'} → ${row.new_value || '(vazio)'}`
        : undefined,
      playerName: player?.name,
      createdAt: row.created_at,
    });
  }

  // Map observation notes
  for (const row of notesRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    const preview = row.content.length > 80 ? row.content.slice(0, 80) + '…' : row.content;
    items.push({
      id: `on-${row.id}`,
      type: 'observation_note',
      description: 'Adicionou nota de observação',
      detail: preview,
      playerName: player?.name,
      createdAt: row.created_at,
    });
  }

  // Map training feedback
  for (const row of feedbackRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    const presenceLabel = PRESENCE_LABELS[row.presence] ?? row.presence;
    const ratingStr = row.rating ? ` · ${row.rating}★` : '';
    items.push({
      id: `tf-${row.id}`,
      type: 'training_feedback',
      description: `Feedback de treino (${presenceLabel}${ratingStr})`,
      detail: row.feedback ? (row.feedback.length > 80 ? row.feedback.slice(0, 80) + '…' : row.feedback) : undefined,
      playerName: player?.name,
      createdAt: row.created_at,
    });
  }

  // Map scout evaluations
  for (const row of evalsRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    items.push({
      id: `se-${row.id}`,
      type: 'scout_evaluation',
      description: `Avaliou jogador (${row.rating}★)`,
      playerName: player?.name,
      createdAt: row.updated_at ?? row.created_at,
    });
  }

  // Map calendar events
  for (const row of calendarRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    const typeLabel = EVENT_TYPE_LABELS[row.event_type] ?? row.event_type;
    items.push({
      id: `ce-${row.id}`,
      type: 'calendar_event',
      description: `Criou evento: ${typeLabel}`,
      detail: row.title,
      playerName: player?.name,
      createdAt: row.created_at,
    });
  }

  // Map completed tasks
  for (const row of tasksCompletedRes.data ?? []) {
    const player = row.players as unknown as { name: string } | null;
    items.push({
      id: `ut-${row.id}`,
      type: 'task',
      description: 'Completou tarefa',
      detail: row.title,
      playerName: player?.name,
      createdAt: row.completed_at ?? row.created_at,
    });
  }

  // Map players created
  for (const row of playersCreatedRes.data ?? []) {
    items.push({
      id: `pc-${row.id}`,
      type: 'player_created',
      description: 'Adicionou jogador',
      playerName: row.name,
      createdAt: row.created_at,
    });
  }

  // Map players approved
  for (const row of playersApprovedRes.data ?? []) {
    items.push({
      id: `pa-${row.id}`,
      type: 'player_approved',
      description: 'Aprovou jogador',
      playerName: row.name,
      createdAt: row.updated_at,
    });
  }

  // Sort all by date descending, take top N
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { success: true, items: items.slice(0, limit) };
}

/* ───────────── Label Maps ───────────── */

const FIELD_LABELS: Record<string, string> = {
  recruitment_status: 'Estado',
  department_opinion: 'Opinião',
  is_shadow_squad: 'Plantel Sombra',
  is_real_squad: 'Plantel',
  shadow_position: 'Posição Sombra',
  real_squad_position: 'Posição Real',
  position_normalized: 'Posição',
  club: 'Clube',
  observer_decision: 'Decisão',
  training_date: 'Data Treino',
  meeting_date: 'Data Reunião',
  signing_date: 'Data Assinatura',
  contact_assigned_to: 'Responsável',
};

const PRESENCE_LABELS: Record<string, string> = {
  attended: 'Veio',
  missed: 'Faltou',
  rescheduled: 'Reagendado',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  treino: 'Treino',
  reuniao: 'Reunião',
  assinatura: 'Assinatura',
  observacao: 'Observação',
  outro: 'Outro',
};

// src/actions/scout-availability.ts
// Server Actions for scout availability — scouts declare when they're free for a round
// Scouts can add/remove their own availability; admin/editor can view all
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/lib/supabase/mappers.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { scoutAvailabilitySchema } from '@/lib/validators';
import type { ActionResponse, ScoutAvailability, ScoutAvailabilityRow } from '@/lib/types';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import { mapScoutAvailabilityRow } from '@/lib/supabase/mappers';

/* ───────────── Read ───────────── */

/** Fetch all availability entries for a round (RLS handles visibility) */
export async function getScoutAvailability(roundId: number): Promise<ScoutAvailability[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scout_availability')
    .select('*')
    .eq('round_id', roundId)
    .order('available_date', { ascending: true });

  if (error) {
    console.error('[getScoutAvailability] Failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapScoutAvailabilityRow(row as ScoutAvailabilityRow));
}

/** Fetch club members who can be scouts (admin/editor/scout roles) for the availability matrix */
export async function getClubScouts(): Promise<{ id: string; name: string; role: string }[]> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('club_memberships')
    .select('user_id, role, profiles:user_id(full_name)')
    .eq('club_id', clubId)
    .in('role', ['admin', 'editor', 'scout', 'recruiter']);

  if (error) {
    console.error('[getClubScouts] Failed:', error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.user_id,
    name: row.profiles?.full_name ?? 'Desconhecido',
    role: row.role,
  }));
}

/* ───────────── Create ───────────── */

export async function addAvailability(data: {
  roundId: number;
  availabilityType: string;
  availableDate?: string;
  period?: string;
  timeStart?: string;
  timeEnd?: string;
  notes?: string;
}): Promise<ActionResponse<ScoutAvailability>> {
  const parsed = scoutAvailabilitySchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from('scout_availability')
    .insert({
      club_id: clubId,
      round_id: parsed.data.roundId,
      scout_id: userId,
      availability_type: parsed.data.availabilityType,
      available_date: parsed.data.availableDate ?? null,
      period: parsed.data.period ?? null,
      time_start: parsed.data.timeStart ?? null,
      time_end: parsed.data.timeEnd ?? null,
      notes: parsed.data.notes ?? '',
    })
    .select('*')
    .single();

  if (error || !created) {
    // Unique constraint on "always" type
    if (error?.code === '23505') {
      return { success: false, error: 'Já declaraste disponibilidade total para esta jornada' };
    }
    return { success: false, error: `Erro ao adicionar: ${error?.message ?? 'desconhecido'}` };
  }

  revalidatePath(`/observacoes/${data.roundId}`);
  await broadcastRowMutation(clubId, 'scout_availability', 'INSERT', userId, created.id);
  return { success: true, data: mapScoutAvailabilityRow(created as ScoutAvailabilityRow) };
}

/* ───────────── Delete ───────────── */

export async function removeAvailability(
  availabilityId: number,
  roundId: number,
): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();

  // RLS ensures scout can only delete own
  const { error } = await supabase
    .from('scout_availability')
    .delete()
    .eq('id', availabilityId)
    .eq('scout_id', userId);

  if (error) {
    return { success: false, error: `Erro ao remover: ${error.message}` };
  }

  revalidatePath(`/observacoes/${roundId}`);
  await broadcastRowMutation(clubId, 'scout_availability', 'DELETE', userId, availabilityId);
  return { success: true };
}

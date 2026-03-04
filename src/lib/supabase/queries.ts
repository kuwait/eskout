// src/lib/supabase/queries.ts
// Database query functions for fetching players, age groups, and related data
// All queries run server-side via the Supabase server client
// RELEVANT FILES: src/lib/supabase/server.ts, src/lib/supabase/mappers.ts, src/actions/players.ts

import { createClient } from '@/lib/supabase/server';
import { mapPlayerRow } from '@/lib/supabase/mappers';
import type { Player, PlayerRow } from '@/lib/types';

/* ───────────── Players ───────────── */

export async function getPlayersByAgeGroup(ageGroupId: number): Promise<Player[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('age_group_id', ageGroupId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data as PlayerRow[]).map(mapPlayerRow);
}

export async function getPlayerById(id: number): Promise<Player | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapPlayerRow(data as PlayerRow);
}

/* ───────────── Profile (current user role) ───────────── */

export async function getCurrentUserRole(): Promise<'admin' | 'scout' | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return (data?.role as 'admin' | 'scout') ?? null;
}

// src/actions/observation-list.ts
// Server Actions for personal observation shortlist ("A Observar")
// Per-user bookmarks of players to observe — admin can secretly see all lists
// RELEVANT FILES: src/app/a-observar/page.tsx, src/lib/supabase/club-context.ts, src/lib/realtime/broadcast.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { broadcastRowMutation } from '@/lib/realtime/broadcast';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface ObservationEntry {
  id: number;
  playerId: number;
  playerName: string;
  playerClub: string;
  playerClubLogoUrl: string | null;
  playerPosition: string | null;
  playerDob: string;
  playerNationality: string | null;
  playerPhotoUrl: string | null;
  note: string | null;
  createdAt: string;
  /** Only present in admin "view all" — who owns this entry */
  ownerName?: string;
  ownerId?: string;
}

/* ───────────── Queries ───────────── */

/** Get observation list for the current user */
export async function getMyObservationList(): Promise<ObservationEntry[]> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_observation_list')
    .select('id, player_id, note, created_at, players(name, club, club_logo_url, position_normalized, dob, nationality, photo_url, zz_photo_url)')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapEntry);
}

/** Get all observation entries in the club (admin-only, secret) */
export async function getAllObservationLists(): Promise<ObservationEntry[]> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin') return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_observation_list')
    .select('id, user_id, player_id, note, created_at, players(name, club, club_logo_url, position_normalized, dob, nationality, photo_url, zz_photo_url), profiles!user_observation_list_user_id_fkey(full_name)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map((row) => {
    const entry = mapEntry(row);
    const profile = row.profiles as unknown as { full_name: string } | null;
    entry.ownerName = profile?.full_name ?? '—';
    entry.ownerId = (row as unknown as { user_id: string }).user_id;
    return entry;
  });
}

/** Get count for nav badge */
export async function getObservationCount(): Promise<number> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return 0;

  const supabase = await createClient();
  const { count } = await supabase
    .from('user_observation_list')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('user_id', userId);

  return count ?? 0;
}

/** Check if a player is in the current user's observation list */
export async function isPlayerObserved(playerId: number): Promise<boolean> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from('user_observation_list')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('player_id', playerId)
    .maybeSingle();

  return !!data;
}

/* ───────────── Mutations ───────────── */

/** Add a player to the current user's observation list */
export async function addToObservationList(
  playerId: number,
  note?: string | null,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_observation_list')
    .upsert(
      { club_id: clubId, user_id: userId, player_id: playerId, note: note ?? null },
      { onConflict: 'user_id,player_id,club_id' },
    );

  if (error) return { success: false, error: `Erro ao adicionar: ${error.message}` };

  revalidatePath('/a-observar');
  await broadcastRowMutation(clubId, 'user_observation_list', 'INSERT', userId, playerId);
  return { success: true };
}

/** Remove a player from the current user's observation list */
export async function removeFromObservationList(playerId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_observation_list')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('player_id', playerId);

  if (error) return { success: false, error: `Erro ao remover: ${error.message}` };

  revalidatePath('/a-observar');
  await broadcastRowMutation(clubId, 'user_observation_list', 'DELETE', userId, playerId);
  return { success: true };
}

/** Update the note on an observation entry */
export async function updateObservationNote(
  playerId: number,
  note: string | null,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('user_observation_list')
    .update({ note })
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('player_id', playerId);

  if (error) return { success: false, error: `Erro ao atualizar nota: ${error.message}` };

  revalidatePath('/a-observar');
  return { success: true };
}

/* ───────────── Export ───────────── */

/** Export the user's observation list as Excel (base64) */
export async function exportObservationListExcel(): Promise<ActionResponse<string>> {
  const { role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') return { success: false, error: 'Sem permissão' };

  const myList = await getMyObservationList();
  if (myList.length === 0) return { success: false, error: 'Lista vazia' };

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('A Observar');

  ws.columns = [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Clube', key: 'club', width: 20 },
    { header: 'Posição', key: 'position', width: 10 },
    { header: 'Data Nasc.', key: 'dob', width: 14 },
    { header: 'Nacionalidade', key: 'nationality', width: 16 },
    { header: 'Nota', key: 'note', width: 30 },
    { header: 'Adicionado', key: 'addedAt', width: 14 },
  ];

  // Header style
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  });

  for (const e of myList) {
    ws.addRow({
      name: e.playerName,
      club: e.playerClub,
      position: e.playerPosition ?? '',
      dob: e.playerDob ? new Date(e.playerDob).toLocaleDateString('pt-PT') : '',
      nationality: e.playerNationality ?? '',
      note: e.note ?? '',
      addedAt: new Date(e.createdAt).toLocaleDateString('pt-PT'),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { success: true, data: base64 };
}

/* ───────────── Helpers ───────────── */

function mapEntry(row: Record<string, unknown>): ObservationEntry {
  const player = row.players as { name: string; club: string; club_logo_url: string | null; position_normalized: string | null; dob: string; nationality: string | null; photo_url: string | null; zz_photo_url: string | null } | null;
  return {
    id: row.id as number,
    playerId: row.player_id as number,
    playerName: player?.name ?? '—',
    playerClub: player?.club ?? '—',
    playerClubLogoUrl: player?.club_logo_url ?? null,
    playerPosition: player?.position_normalized ?? null,
    playerDob: player?.dob ?? '',
    playerNationality: player?.nationality ?? null,
    playerPhotoUrl: (player?.photo_url?.trim() || player?.zz_photo_url?.trim()) || null,
    note: (row.note as string) ?? null,
    createdAt: row.created_at as string,
  };
}

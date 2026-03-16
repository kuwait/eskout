// src/actions/player-lists.ts
// Server Actions for the generic player lists system ("Listas")
// Supports multiple named lists per user; "A Observar" is a system list (auto-created, non-deletable)
// RELEVANT FILES: src/lib/types/index.ts, src/lib/validators.ts, src/app/listas/page.tsx, src/lib/realtime/broadcast.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { broadcastRowMutation, broadcastBulkMutation } from '@/lib/realtime/broadcast';
import { createListSchema, renameListSchema, addToListSchema } from '@/lib/validators';
import type { ActionResponse, PickerPlayer, PlayerList, PlayerListItem, PlayerListItemRow } from '@/lib/types';

/* ───────────── Constants ───────────── */

const SYSTEM_LIST_NAME = 'A Observar';
const SYSTEM_LIST_EMOJI = '👁';
const REVALIDATE_PATH = '/listas';

/* ───────────── Helpers ───────────── */

/** Ensure the system "A Observar" list exists for a user, returning its id */
async function ensureSystemList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  userId: string,
): Promise<number> {
  // Try to find existing system list
  const { data: existing } = await supabase
    .from('player_lists')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('is_system', true)
    .eq('name', SYSTEM_LIST_NAME)
    .maybeSingle();

  if (existing) return existing.id;

  // Create it (lazy init)
  const { data: created, error } = await supabase
    .from('player_lists')
    .insert({
      club_id: clubId,
      user_id: userId,
      name: SYSTEM_LIST_NAME,
      emoji: SYSTEM_LIST_EMOJI,
      is_system: true,
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(`Failed to create system list: ${error?.message}`);
  }

  return created.id;
}

/** Map a raw item row (with joined player) to the client-facing type */
function mapListItem(row: PlayerListItemRow): PlayerListItem {
  const p = row.players;
  return {
    id: row.id,
    listId: row.list_id,
    playerId: row.player_id,
    playerName: p?.name ?? '—',
    playerClub: p?.club ?? '—',
    playerClubLogoUrl: p?.club_logo_url ?? null,
    playerPosition: p?.position_normalized ?? null,
    playerDob: p?.dob ?? '',
    playerNationality: p?.nationality ?? null,
    playerPhotoUrl: (p?.photo_url?.trim() || p?.zz_photo_url?.trim()) || null,
    note: row.note ?? null,
    sortOrder: row.sort_order,
    addedAt: row.added_at,
    seenAt: row.seen_at ?? null,
  };
}

/* ───────────── Queries ───────────── */

/** Get all lists for the current user (with item counts). Auto-creates "A Observar" if missing. */
export async function getMyLists(): Promise<PlayerList[]> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();

  // Ensure system list exists
  await ensureSystemList(supabase, clubId, userId);

  // Fetch all user lists with aggregated item data
  const { data: lists, error } = await supabase
    .from('player_lists')
    .select('id, club_id, user_id, name, emoji, is_system, created_at, updated_at')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .order('is_system', { ascending: false }) // System lists first
    .order('created_at', { ascending: true });

  if (error || !lists) return [];

  // Fetch item counts and last-added dates in bulk
  const listIds = lists.map((l) => l.id);
  const { data: itemStats } = await supabase
    .from('player_list_items')
    .select('list_id, added_at')
    .in('list_id', listIds)
    .order('added_at', { ascending: false });

  // Aggregate counts and last-added per list
  const statsMap = new Map<number, { count: number; lastAddedAt: string | null }>();
  for (const item of itemStats ?? []) {
    const existing = statsMap.get(item.list_id);
    if (existing) {
      existing.count++;
    } else {
      statsMap.set(item.list_id, { count: 1, lastAddedAt: item.added_at });
    }
  }

  return lists.map((row) => {
    const stats = statsMap.get(row.id);
    return {
      id: row.id,
      clubId: row.club_id,
      userId: row.user_id,
      name: row.name,
      emoji: row.emoji,
      isSystem: row.is_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      itemCount: stats?.count ?? 0,
      lastAddedAt: stats?.lastAddedAt ?? null,
    };
  });
}

/** Get all lists in the club with owner info (admin-only) */
export async function getAllLists(): Promise<PlayerList[]> {
  const { clubId, role } = await getActiveClub();
  if (role !== 'admin') return [];

  const supabase = await createClient();

  const { data: lists, error } = await supabase
    .from('player_lists')
    .select('id, club_id, user_id, name, emoji, is_system, created_at, updated_at, profiles!player_lists_user_id_fkey(full_name)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error || !lists) return [];

  // Fetch item stats for all lists
  const listIds = lists.map((l) => l.id);
  const { data: itemStats } = await supabase
    .from('player_list_items')
    .select('list_id, added_at')
    .in('list_id', listIds)
    .order('added_at', { ascending: false });

  const statsMap = new Map<number, { count: number; lastAddedAt: string | null }>();
  for (const item of itemStats ?? []) {
    const existing = statsMap.get(item.list_id);
    if (existing) {
      existing.count++;
    } else {
      statsMap.set(item.list_id, { count: 1, lastAddedAt: item.added_at });
    }
  }

  return lists.map((row) => {
    const stats = statsMap.get(row.id);
    const profile = row.profiles as unknown as { full_name: string } | null;
    return {
      id: row.id,
      clubId: row.club_id,
      userId: row.user_id,
      name: row.name,
      emoji: row.emoji,
      isSystem: row.is_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      itemCount: stats?.count ?? 0,
      lastAddedAt: stats?.lastAddedAt ?? null,
      ownerName: profile?.full_name ?? '—',
    };
  });
}

/** Get items in a specific list (with joined player data) */
export async function getListItems(listId: number): Promise<PlayerListItem[]> {
  const { role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('player_list_items')
    .select('id, list_id, player_id, note, sort_order, added_at, seen_at, players(name, club, club_logo_url, position_normalized, dob, nationality, photo_url, zz_photo_url)')
    .eq('list_id', listId)
    .order('sort_order', { ascending: true })
    .order('added_at', { ascending: false });

  if (error || !data) return [];
  return (data as unknown as PlayerListItemRow[]).map(mapListItem);
}

/** Get list metadata by id */
export async function getListById(listId: number): Promise<PlayerList | null> {
  const { role } = await getActiveClub();
  if (role === 'scout') return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('player_lists')
    .select('id, club_id, user_id, name, emoji, is_system, created_at, updated_at')
    .eq('id', listId)
    .single();

  if (error || !data) return null;

  // Get item count
  const { count } = await supabase
    .from('player_list_items')
    .select('*', { count: 'exact', head: true })
    .eq('list_id', listId);

  // Get last added
  const { data: lastItem } = await supabase
    .from('player_list_items')
    .select('added_at')
    .eq('list_id', listId)
    .order('added_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: data.id,
    clubId: data.club_id,
    userId: data.user_id,
    name: data.name,
    emoji: data.emoji,
    isSystem: data.is_system,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    itemCount: count ?? 0,
    lastAddedAt: lastItem?.added_at ?? null,
  };
}

/** Get which of the user's lists contain a specific player (for profile bookmark dropdown) */
export async function getPlayerListMemberships(playerId: number): Promise<number[]> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();

  // Get all user's list IDs first
  const { data: myLists } = await supabase
    .from('player_lists')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (!myLists?.length) return [];

  const listIds = myLists.map((l) => l.id);

  // Find which of those lists contain this player
  const { data: items } = await supabase
    .from('player_list_items')
    .select('list_id')
    .eq('player_id', playerId)
    .in('list_id', listIds);

  return (items ?? []).map((i) => i.list_id);
}

/** Total count of items across all user lists (for nav badge) */
export async function getListsItemCount(): Promise<number> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return 0;

  const supabase = await createClient();

  // Get user's list IDs
  const { data: myLists } = await supabase
    .from('player_lists')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (!myLists?.length) return 0;

  const { count } = await supabase
    .from('player_list_items')
    .select('*', { count: 'exact', head: true })
    .in('list_id', myLists.map((l) => l.id));

  return count ?? 0;
}

/* ───────────── Mutations ───────────── */

/** Create a new custom list */
export async function createList(input: { name: string; emoji?: string }): Promise<ActionResponse<{ id: number }>> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const parsed = createListSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('player_lists')
    .insert({
      club_id: clubId,
      user_id: userId,
      name: parsed.data.name,
      emoji: parsed.data.emoji,
      is_system: false,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Erro ao criar lista: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'player_lists', 'INSERT', userId, data.id);
  return { success: true, data: { id: data.id } };
}

/** Rename a custom list (system lists cannot be renamed) */
export async function renameList(input: { listId: number; name: string; emoji?: string }): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const parsed = renameListSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Verify ownership and non-system
  const { data: list } = await supabase
    .from('player_lists')
    .select('id, is_system, user_id')
    .eq('id', parsed.data.listId)
    .single();

  if (!list) return { success: false, error: 'Lista não encontrada' };
  if (list.user_id !== userId) return { success: false, error: 'Sem permissão' };
  if (list.is_system) return { success: false, error: 'Não é possível renomear listas de sistema' };

  const updateData: Record<string, unknown> = { name: parsed.data.name, updated_at: new Date().toISOString() };
  if (parsed.data.emoji) updateData.emoji = parsed.data.emoji;

  const { error } = await supabase
    .from('player_lists')
    .update(updateData)
    .eq('id', parsed.data.listId);

  if (error) return { success: false, error: `Erro ao renomear: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'player_lists', 'UPDATE', userId, parsed.data.listId);
  return { success: true };
}

/** Delete a custom list and all its items (system lists cannot be deleted) */
export async function deleteList(listId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();

  // Verify ownership and non-system
  const { data: list } = await supabase
    .from('player_lists')
    .select('id, is_system, user_id')
    .eq('id', listId)
    .single();

  if (!list) return { success: false, error: 'Lista não encontrada' };
  if (list.user_id !== userId) return { success: false, error: 'Sem permissão' };
  if (list.is_system) return { success: false, error: 'Não é possível eliminar listas de sistema' };

  // CASCADE handles items deletion
  const { error } = await supabase
    .from('player_lists')
    .delete()
    .eq('id', listId);

  if (error) return { success: false, error: `Erro ao eliminar: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'player_lists', 'DELETE', userId, listId);
  return { success: true };
}

/** Add a player to a specific list */
export async function addPlayerToList(
  listId: number,
  playerId: number,
  note?: string | null,
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const parsed = addToListSchema.safeParse({ listId, playerId, note });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from('player_list_items')
    .upsert(
      { list_id: listId, player_id: playerId, note: note ?? null },
      { onConflict: 'list_id,player_id' },
    );

  if (error) return { success: false, error: `Erro ao adicionar: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'player_list_items', 'INSERT', userId, playerId);
  return { success: true };
}

/** Remove a player from a specific list */
export async function removePlayerFromList(listId: number, playerId: number): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('player_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('player_id', playerId);

  if (error) return { success: false, error: `Erro ao remover: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastRowMutation(clubId, 'player_list_items', 'DELETE', userId, playerId);
  return { success: true };
}

/** Update player list memberships in bulk (for profile bookmark dropdown — toggle multiple lists) */
export async function updatePlayerListMemberships(
  playerId: number,
  listIds: number[],
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();

  // Get user's current lists
  const { data: myLists } = await supabase
    .from('player_lists')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', userId);

  if (!myLists) return { success: false, error: 'Erro ao carregar listas' };
  const myListIds = new Set(myLists.map((l) => l.id));

  // Verify all target listIds belong to the user
  for (const id of listIds) {
    if (!myListIds.has(id)) return { success: false, error: 'Lista não encontrada' };
  }

  // Get current memberships for this player
  const { data: currentItems } = await supabase
    .from('player_list_items')
    .select('list_id')
    .eq('player_id', playerId)
    .in('list_id', Array.from(myListIds));

  const currentListIds = new Set((currentItems ?? []).map((i) => i.list_id));
  const targetListIds = new Set(listIds);

  // Lists to add to
  const toAdd = listIds.filter((id) => !currentListIds.has(id));
  // Lists to remove from
  const toRemove = Array.from(currentListIds).filter((id) => !targetListIds.has(id));

  // Execute additions
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('player_list_items')
      .upsert(
        toAdd.map((listId) => ({ list_id: listId, player_id: playerId })),
        { onConflict: 'list_id,player_id' },
      );
    if (error) return { success: false, error: `Erro ao adicionar: ${error.message}` };
  }

  // Execute removals
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('player_list_items')
      .delete()
      .eq('player_id', playerId)
      .in('list_id', toRemove);
    if (error) return { success: false, error: `Erro ao remover: ${error.message}` };
  }

  revalidatePath(REVALIDATE_PATH);
  await broadcastBulkMutation(clubId, 'player_list_items', userId, [playerId]);
  return { success: true };
}

/** Update the note on a list item */
export async function updateListItemNote(
  listId: number,
  playerId: number,
  note: string | null,
): Promise<ActionResponse> {
  const { role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('player_list_items')
    .update({ note })
    .eq('list_id', listId)
    .eq('player_id', playerId);

  if (error) return { success: false, error: `Erro ao atualizar nota: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  return { success: true };
}

/** Toggle seen status on a list item */
export async function toggleListItemSeen(
  listId: number,
  playerId: number,
  seen: boolean,
): Promise<ActionResponse> {
  const { role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('player_list_items')
    .update({ seen_at: seen ? new Date().toISOString() : null })
    .eq('list_id', listId)
    .eq('player_id', playerId);

  if (error) return { success: false, error: `Erro ao atualizar: ${error.message}` };

  revalidatePath(REVALIDATE_PATH);
  return { success: true };
}

/** Reorder items within a list */
export async function reorderListItems(
  listId: number,
  orderedPlayerIds: number[],
): Promise<ActionResponse> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return { success: false, error: 'Sem permissão' };

  const supabase = await createClient();

  // Update sort_order for each item
  const updates = orderedPlayerIds.map((playerId, index) =>
    supabase
      .from('player_list_items')
      .update({ sort_order: index })
      .eq('list_id', listId)
      .eq('player_id', playerId)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { success: false, error: `Erro ao reordenar: ${failed.error.message}` };

  revalidatePath(REVALIDATE_PATH);
  await broadcastBulkMutation(clubId, 'player_list_items', userId);
  return { success: true };
}

/* ───────────── Picker Players ───────────── */

/** Fetch lightweight player data for the add-to-list search dialog. Paginated to bypass Supabase 1000-row limit. */
export async function getPickerPlayers(): Promise<PickerPlayer[]> {
  const { clubId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();
  const PAGE_SIZE = 1000;
  const allRows: PickerPlayer[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, club, club_logo_url, position_normalized, secondary_position, tertiary_position, dob, foot, department_opinion, nationality')
      .eq('club_id', clubId)
      .order('name')
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;

    for (const row of data) {
      // Parse department_opinion — handles both JS array and Postgres string format
      let opinions: string[] = [];
      if (Array.isArray(row.department_opinion)) {
        opinions = row.department_opinion;
      } else if (typeof row.department_opinion === 'string' && row.department_opinion.startsWith('{')) {
        opinions = row.department_opinion.slice(1, -1).split(',').map((s: string) => s.replace(/"/g, ''));
      }

      allRows.push({
        id: row.id,
        name: row.name,
        club: row.club ?? '',
        clubLogoUrl: row.club_logo_url ?? null,
        positionNormalized: row.position_normalized ?? null,
        secondaryPosition: row.secondary_position ?? null,
        tertiaryPosition: row.tertiary_position ?? null,
        dob: row.dob ?? null,
        foot: row.foot ?? '',
        departmentOpinion: opinions,
        nationality: row.nationality ?? null,
      });
    }

    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allRows;
}

/* ───────────── Picker Search (server-side structural filters) ───────────── */

/** Lightweight columns selected for picker queries */
const PICKER_COLS = 'id, name, club, club_logo_url, position_normalized, secondary_position, tertiary_position, dob, foot, department_opinion, nationality' as const;

/** Parse department_opinion from DB row (handles both JS array and Postgres string format) */
function parseOpinions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.startsWith('{')) {
    return raw.slice(1, -1).split(',').map((s: string) => s.replace(/"/g, ''));
  }
  return [];
}

/** Map a raw picker row to PickerPlayer */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPickerRow(row: any): PickerPlayer {
  return {
    id: row.id,
    name: row.name,
    club: row.club ?? '',
    clubLogoUrl: row.club_logo_url ?? null,
    positionNormalized: row.position_normalized ?? null,
    secondaryPosition: row.secondary_position ?? null,
    tertiaryPosition: row.tertiary_position ?? null,
    dob: row.dob ?? null,
    foot: row.foot ?? '',
    departmentOpinion: parseOpinions(row.department_opinion),
    nationality: row.nationality ?? null,
  };
}

export interface PickerSearchFilters {
  position?: string;
  club?: string;
  opinion?: string;
  foot?: string;
  /** Server-side text search (ilike on name + club) — when set, position filter is relaxed */
  search?: string;
  /** Exclude players already selected (e.g. in squad, in list) */
  excludeIds?: number[];
}

/**
 * Search picker players with server-side structural filters.
 * Text search is NOT done here — callers apply fuzzyMatch client-side.
 * Returns all matching rows (paginated past Supabase 1000-row limit).
 */
export async function searchPickerPlayers(filters: PickerSearchFilters = {}): Promise<PickerPlayer[]> {
  const { clubId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();
  const PAGE = 1000;
  const all: PickerPlayer[] = [];
  let offset = 0;

  for (;;) {
    let query = supabase
      .from('players')
      .select(PICKER_COLS)
      .eq('club_id', clubId)
      .eq('pending_approval', false);

    // Server-side text search — each word matches name OR club
    if (filters.search) {
      const words = filters.search.trim().split(/\s+/).filter(w => w.length >= 2);
      for (const word of words) {
        query = query.or(`name.ilike.%${word}%,club.ilike.%${word}%`);
      }
    }

    // Position filter — always applied (even during text search)
    if (filters.position) {
      query = query.or(`position_normalized.eq.${filters.position},secondary_position.eq.${filters.position},tertiary_position.eq.${filters.position}`);
    }
    if (filters.club) query = query.eq('club', filters.club);
    if (filters.opinion) query = query.contains('department_opinion', [filters.opinion]);
    if (filters.foot) query = query.eq('foot', filters.foot);

    // When text searching, limit to 50 results (fast response)
    const limit = filters.search ? 50 : PAGE;
    const { data, error } = await query.order('name').range(offset, offset + limit - 1);
    if (error || !data?.length) break;

    for (const row of data) {
      // Skip excluded IDs
      if (filters.excludeIds?.includes(row.id)) continue;
      all.push(mapPickerRow(row));
    }

    if (data.length < limit) break;
    // When text searching, don't paginate further — 50 results is enough
    if (filters.search) break;
    offset += PAGE;
  }

  return all;
}

/**
 * Get distinct club names for filter dropdowns.
 */
export async function getPickerClubs(): Promise<string[]> {
  const { clubId, role } = await getActiveClub();
  if (role === 'scout') return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('players')
    .select('club')
    .eq('club_id', clubId)
    .not('club', 'is', null);

  if (!data) return [];
  return Array.from(new Set(data.map((r) => r.club as string).filter(Boolean))).sort();
}

/* ───────────── Export ───────────── */

/** Export a list as Excel (base64 string) */
export async function exportListExcel(listId: number): Promise<ActionResponse<string>> {
  const { role } = await getActiveClub();
  if (role !== 'admin' && role !== 'editor') return { success: false, error: 'Sem permissão' };

  const [list, items] = await Promise.all([
    getListById(listId),
    getListItems(listId),
  ]);

  if (!list) return { success: false, error: 'Lista não encontrada' };
  if (items.length === 0) return { success: false, error: 'Lista vazia' };

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(list.name);

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
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  });

  for (const item of items) {
    ws.addRow({
      name: item.playerName,
      club: item.playerClub,
      position: item.playerPosition ?? '',
      dob: item.playerDob ? new Date(item.playerDob).toLocaleDateString('pt-PT') : '',
      nationality: item.playerNationality ?? '',
      note: item.note ?? '',
      addedAt: new Date(item.addedAt).toLocaleDateString('pt-PT'),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { success: true, data: base64 };
}

/* ───────────── Backward Compatibility ───────────── */

/** Add player to the system "A Observar" list (bridge for existing code) */
export async function addToObservationList(
  playerId: number,
  note?: string | null,
): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();
  const systemListId = await ensureSystemList(supabase, clubId, userId);
  return addPlayerToList(systemListId, playerId, note);
}

/** Remove player from the system "A Observar" list (bridge for existing code) */
export async function removeFromObservationList(playerId: number): Promise<ActionResponse> {
  const { clubId, userId } = await getActiveClub();
  const supabase = await createClient();
  const systemListId = await ensureSystemList(supabase, clubId, userId);
  return removePlayerFromList(systemListId, playerId);
}

/** Check if player is in the system "A Observar" list (bridge for existing code) */
export async function isPlayerObserved(playerId: number): Promise<boolean> {
  const { clubId, userId, role } = await getActiveClub();
  if (role === 'scout') return false;

  const supabase = await createClient();
  const systemListId = await ensureSystemList(supabase, clubId, userId);

  const { data } = await supabase
    .from('player_list_items')
    .select('id')
    .eq('list_id', systemListId)
    .eq('player_id', playerId)
    .maybeSingle();

  return !!data;
}

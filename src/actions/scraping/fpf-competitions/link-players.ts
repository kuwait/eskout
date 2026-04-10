// src/actions/scraping/fpf-competitions/link-players.ts
// Auto-link FPF match players to eskout player records using fpf_player_id or name matching
// Also imports unlinked players from FPF profiles into eskout DB when they don't exist yet
// RELEVANT FILES: src/actions/scraping/fpf-competitions/stats.ts, src/actions/scraping/fpf.ts, src/actions/scraping/fpf-club-import.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/club-context';
import { birthYearToAgeGroup, CURRENT_SEASON } from '@/lib/constants';
import { fetchFpfData } from '@/actions/scraping/fpf';
import type { ActionResponse } from '@/lib/types';

/* ───────────── Retry Helper ───────────── */

/** Retry an async function with exponential backoff. Returns null after all retries fail. */
async function withRetry<T>(
  fn: () => Promise<T | null>,
  retries = 3,
  baseDelay = 1000,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await fn();
    if (result !== null) return result;
    if (attempt < retries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

/* ───────────── Auth Helper ───────────── */

async function requireSuperadmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin) return null;
  return supabase;
}

/* ───────────── Log Types ───────────── */

export interface LinkLogEntry {
  event: 'link_ok' | 'link_skip' | 'link_info';
  message: string;
}

export interface ImportLogEntry {
  event: 'import_ok' | 'import_skip' | 'import_fail' | 'import_info';
  message: string;
}

/* ───────────── Staff Filter ───────────── */

/** FPF match sheets include staff (coaches, physios, etc.) as "players".
 *  Filter them out — they're not real players and shouldn't be linked/imported. */
const STAFF_ROLES = new Set([
  'treinador principal', 'treinador adjunto', 'treinador',
  'fisioterapeuta', 'enfermeiro', 'massagista',
  'delegado', 'diretor', 'médico', 'medico',
  'outra', 'outro', 'preparador físico', 'preparador fisico',
  'treinador de guarda-redes', 'treinador de gr',
  'coordenador', 'analista',
]);

/** Returns true if the player_name looks like a staff role (not a real player) */
function isStaffEntry(playerName: string): boolean {
  return STAFF_ROLES.has(playerName.toLowerCase().trim());
}

/* ───────────── Link Players ───────────── */

/** Auto-link FPF match players to eskout players with detailed per-player log.
 *  Strategy 0: Match by fpf_player_id (string↔number)
 *  Strategy 1: Match by fpf_link URL containing the fpf_player_id
 *  Strategy 2: Match by name (case-insensitive exact) */
export async function linkMatchPlayersToEskout(
  competitionId: number,
): Promise<ActionResponse<{ linked: number; total: number; unlinked: number; log: LinkLogEntry[] }>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const log: LinkLogEntry[] = [];

  // Get competition info (escalão for age validation during name matching)
  const { data: comp } = await supabase
    .from('fpf_competitions')
    .select('escalao, expected_birth_year_end')
    .eq('id', competitionId)
    .single();
  const expectedBirthYearEnd = comp?.expected_birth_year_end as number | null;

  // Get all match IDs for this competition
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: { linked: 0, total: 0, unlinked: 0, log } };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Count how many are already linked (for the log)
  const { count: alreadyLinkedCount } = await supabase
    .from('fpf_match_players')
    .select('id', { count: 'exact', head: true })
    .in('match_id', matchIds)
    .not('eskout_player_id', 'is', null);

  // Get unlinked match players (no eskout_player_id yet)
  const PAGE = 1000;
  const unlinkedRows: { id: number; fpf_player_id: number | null; player_name: string; team_name: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('id, fpf_player_id, player_name, team_name')
      .in('match_id', matchIds)
      .is('eskout_player_id', null)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    unlinkedRows.push(...data);
    if (data.length < PAGE) break;
  }

  if (unlinkedRows.length === 0) {
    log.push({ event: 'link_info', message: `✅ Todos os jogadores já estão ligados (${alreadyLinkedCount ?? 0} registos)` });
    return { success: true, data: { linked: 0, total: 0, unlinked: 0, log } };
  }

  // Deduplicate by fpf_player_id or name+team — filter out staff by role name only
  const realPlayers = new Map<string, { ids: number[]; fpfPlayerId: number | null; name: string; teamName: string }>();
  let staffCount = 0;
  for (const row of unlinkedRows) {
    if (isStaffEntry(row.player_name)) {
      staffCount++;
      continue;
    }
    // Include team_name in key to avoid merging same-name players from different teams
    const key = row.fpf_player_id ? `fpf:${row.fpf_player_id}` : `name:${row.player_name.toLowerCase().trim()}|${row.team_name}`;
    const existing = realPlayers.get(key);
    if (existing) {
      existing.ids.push(row.id);
    } else {
      realPlayers.set(key, { ids: [row.id], fpfPlayerId: row.fpf_player_id, name: row.player_name, teamName: row.team_name });
    }
  }

  if (realPlayers.size === 0) {
    log.push({ event: 'link_info', message: `✅ Todos os jogadores já estão ligados (${staffCount} staff ignorados)` });
    return { success: true, data: { linked: 0, total: 0, unlinked: 0, log } };
  }

  const staffNote = staffCount > 0 ? `, ${staffCount} staff ignorados` : '';
  log.push({ event: 'link_info', message: `🔍 ${realPlayers.size} jogadores não ligados${staffNote}` });

  // Get all eskout players with their names, club, DOB, FPF IDs and FPF links for matching
  const allPlayers: { id: number; name: string; club: string | null; dob: string | null; fpf_player_id: string | null; fpf_link: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('players')
      .select('id, name, club, dob, fpf_player_id, fpf_link')
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    allPlayers.push(...data);
    if (data.length < PAGE) break;
  }

  // Build lookup maps
  // nameToPlayers: stores ALL players per name (may have duplicates)
  const nameToPlayers = new Map<string, { id: number; name: string; club: string | null; dob: string | null }[]>();
  const fpfIdToPlayer = new Map<number, { id: number; name: string }>();

  for (const p of allPlayers) {
    const nameKey = p.name.toLowerCase().trim();
    const list = nameToPlayers.get(nameKey) ?? [];
    list.push({ id: p.id, name: p.name, club: p.club, dob: p.dob });
    nameToPlayers.set(nameKey, list);

    if (p.fpf_player_id) {
      const numId = parseInt(p.fpf_player_id, 10);
      if (!isNaN(numId)) fpfIdToPlayer.set(numId, { id: p.id, name: p.name });
    }

    if (p.fpf_link) {
      const idMatch = p.fpf_link.match(/\/(\d+)(?:[/?#]|$)/);
      if (idMatch) {
        const linkId = parseInt(idMatch[1], 10);
        if (!fpfIdToPlayer.has(linkId)) fpfIdToPlayer.set(linkId, { id: p.id, name: p.name });
      }
    }
  }

  // Match and update
  let linked = 0;
  let notFound = 0;

  for (const [, player] of realPlayers) {
    let match: { id: number; name: string } | null = null;
    let method = '';

    // Strategy 0+1: match by FPF player ID (direct or via fpf_link)
    if (player.fpfPlayerId) {
      const found = fpfIdToPlayer.get(player.fpfPlayerId);
      if (found) {
        match = found;
        method = 'fpf_id';
      }
    }

    // Strategy 2: exact name match (case-insensitive) — only if:
    //   a) Their club matches the competition team name, AND
    //   b) Their age is compatible with the competition escalão (if known), AND
    //   c) Exactly 1 candidate remains after filtering
    // If multiple players share the name, or club/age doesn't match → "Não Ligados" for manual.
    if (!match) {
      const candidates = nameToPlayers.get(player.name.toLowerCase().trim());
      if (candidates) {
        // Filter by club match
        let filtered = candidates.filter((c) => c.club && clubsMatch(player.teamName, c.club));
        // Filter by age compatibility: reject players whose DOB makes them too young for this competition
        // Allow up to 2 years above (playing up by 1-2 years is real, +3 is almost certainly wrong link)
        if (expectedBirthYearEnd && filtered.length > 1) {
          const ageFiltered = filtered.filter((c) => {
            if (!c.dob) return true; // no DOB = can't validate, keep as candidate
            const birthYear = parseInt(c.dob.slice(0, 4), 10);
            if (isNaN(birthYear)) return true;
            // Reject if born more than 2 years after the expected youngest year
            return birthYear <= expectedBirthYearEnd + 2;
          });
          // Only apply age filter if it narrows results (don't discard all candidates)
          if (ageFiltered.length > 0) filtered = ageFiltered;
        }
        if (filtered.length === 1) {
          match = filtered[0];
          method = 'nome+idade';
        }
      }
    }

    if (match) {
      const { error } = await supabase
        .from('fpf_match_players')
        .update({ eskout_player_id: match.id })
        .in('id', player.ids);

      if (!error) {
        linked += player.ids.length;
        log.push({
          event: 'link_ok',
          message: `✓ ${player.name} → ${match.name} (${method}, ${player.ids.length} jogo${player.ids.length > 1 ? 's' : ''})`,
        });
      }
    } else {
      notFound++;
      const hasFpfId = player.fpfPlayerId ? `FPF#${player.fpfPlayerId}` : 'sem FPF ID';
      log.push({
        event: 'link_skip',
        message: `✗ ${player.name} — não encontrado no eskout (${hasFpfId})`,
      });
    }
  }

  log.push({
    event: 'link_info',
    message: `🔗 Resultado: ${linked} ligados, ${notFound} não encontrados`,
  });

  return { success: true, data: { linked, total: realPlayers.size, unlinked: notFound, log } };
}

/* ───────────── Import Unlinked Players ───────────── */

/** Result returned per player during import */
export interface ImportResult {
  name: string;
  action: 'created' | 'skipped' | 'error';
  reason?: string;
}

/** Import unlinked FPF competition players into eskout DB with detailed per-player log.
 *  For each player with fpf_player_id that's NOT in eskout:
 *  1. Build FPF profile URL from fpf_player_id
 *  2. Fetch profile data (name, DOB, club, nationality, photo)
 *  3. Create the player in the active club's scope
 *  4. Link back to fpf_match_players rows */
export async function importUnlinkedPlayers(
  competitionId: number,
): Promise<ActionResponse<{ imported: number; skipped: number; errors: number; results: ImportResult[]; log: ImportLogEntry[] }>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const { clubId } = await getAuthContext();
  const log: ImportLogEntry[] = [];

  // Get all match IDs for this competition
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: { imported: 0, skipped: 0, errors: 0, results: [], log } };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Get unlinked match players that have fpf_player_id (can't import without it)
  const PAGE = 1000;
  const unlinked: { id: number; fpf_player_id: number; player_name: string; team_name: string }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('id, fpf_player_id, player_name, team_name')
      .in('match_id', matchIds)
      .is('eskout_player_id', null)
      .not('fpf_player_id', 'is', null)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    unlinked.push(...(data as typeof unlinked));
    if (data.length < PAGE) break;
  }

  // Deduplicate by fpf_player_id — filter out staff by role name only
  const uniquePlayers = new Map<number, { ids: number[]; name: string; teamName: string }>();
  for (const row of unlinked) {
    if (isStaffEntry(row.player_name)) continue;
    const existing = uniquePlayers.get(row.fpf_player_id);
    if (existing) {
      existing.ids.push(row.id);
    } else {
      uniquePlayers.set(row.fpf_player_id, { ids: [row.id], name: row.player_name, teamName: row.team_name });
    }
  }

  if (uniquePlayers.size === 0) {
    log.push({ event: 'import_info', message: '✅ Nenhum jogador para importar — todos já ligados ou sem FPF ID' });
    return { success: true, data: { imported: 0, skipped: 0, errors: 0, results: [], log } };
  }

  // Count unlinked without fpf_player_id (can't import these)
  const noFpfIdCount = unlinked.length === 0 ? 0 : await (async () => {
    const { count } = await supabase
      .from('fpf_match_players')
      .select('id', { count: 'exact', head: true })
      .in('match_id', matchIds)
      .is('eskout_player_id', null)
      .is('fpf_player_id', null);
    return count ?? 0;
  })();

  log.push({
    event: 'import_info',
    message: `📥 A importar ${uniquePlayers.size} jogadores do FPF…${noFpfIdCount > 0 ? ` (${noFpfIdCount} sem FPF ID — não importáveis)` : ''}`,
  });

  const results: ImportResult[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let idx = 0;

  for (const [fpfPlayerId, player] of uniquePlayers) {
    idx++;
    const prefix = `[${idx}/${uniquePlayers.size}]`;
    const fpfLink = `https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/${fpfPlayerId}`;

    // Fetch player data from FPF profile page (with retry)
    const fpfData = await withRetry(() => fetchFpfData(fpfLink));
    if (!fpfData) {
      results.push({ name: player.name, action: 'error', reason: 'Perfil FPF não encontrado' });
      errors++;
      log.push({ event: 'import_fail', message: `${prefix} ✗ ${player.name} (${player.teamName}) — perfil FPF não encontrado (FPF#${fpfPlayerId})` });
      continue;
    }

    if (!fpfData.dob) {
      results.push({ name: player.name, action: 'skipped', reason: 'Sem data de nascimento no FPF' });
      skipped++;
      log.push({ event: 'import_skip', message: `${prefix} ⊘ ${player.name} (${player.teamName}) — sem data de nascimento no FPF` });
      continue;
    }

    const playerName = fpfData.fullName || player.name;
    const clubName = player.teamName;
    const birthYear = new Date(fpfData.dob).getFullYear();
    const ageGroupName = birthYearToAgeGroup(birthYear);

    if (!ageGroupName) {
      results.push({ name: playerName, action: 'skipped', reason: `Ano ${birthYear} sem escalão` });
      skipped++;
      log.push({ event: 'import_skip', message: `${prefix} ⊘ ${playerName} (${clubName}) — nascido ${birthYear}, sem escalão válido` });
      continue;
    }

    // Find or create age group for this club
    let { data: ageGroup } = await supabase
      .from('age_groups')
      .select('id')
      .eq('name', ageGroupName)
      .eq('season', CURRENT_SEASON)
      .eq('club_id', clubId)
      .single();

    if (!ageGroup) {
      const { data: newAg, error: agError } = await supabase
        .from('age_groups')
        .insert({ name: ageGroupName, generation_year: birthYear, season: CURRENT_SEASON, club_id: clubId })
        .select('id')
        .single();
      if (agError) {
        results.push({ name: playerName, action: 'error', reason: `Erro escalão: ${agError.message}` });
        errors++;
        log.push({ event: 'import_fail', message: `${prefix} ✗ ${playerName} — erro ao criar escalão ${ageGroupName}` });
        continue;
      }
      ageGroup = newAg;
    }

    // Create the player
    const { data: newPlayer, error: insertError } = await supabase
      .from('players')
      .insert({
        club_id: clubId,
        age_group_id: ageGroup!.id,
        name: playerName,
        dob: fpfData.dob,
        club: fpfData.currentClub || clubName,
        fpf_link: fpfLink,
        fpf_player_id: String(fpfPlayerId),
        fpf_last_checked: new Date().toISOString(),
        fpf_current_club: fpfData.currentClub ?? clubName,
        photo_url: fpfData.photoUrl ?? null,
        club_logo_url: fpfData.clubLogoUrl ?? null,
        nationality: fpfData.nationality ?? null,
        birth_country: fpfData.birthCountry ?? null,
        department_opinion: [],
        recruitment_status: null,
        created_by: null,
        pending_approval: false,
        admin_reviewed: true,
      })
      .select('id')
      .single();

    if (insertError) {
      results.push({ name: playerName, action: 'error', reason: insertError.message });
      errors++;
      log.push({ event: 'import_fail', message: `${prefix} ✗ ${playerName} — erro BD: ${insertError.message}` });
      continue;
    }

    // Link back all fpf_match_players rows for this player
    await supabase
      .from('fpf_match_players')
      .update({ eskout_player_id: newPlayer!.id })
      .in('id', player.ids);

    results.push({ name: playerName, action: 'created' });
    imported++;

    // Detailed log: name, club, DOB, escalão, nationality, games
    const details = [
      clubName,
      fpfData.dob,
      ageGroupName,
      fpfData.nationality ?? '?',
      `${player.ids.length} jogo${player.ids.length > 1 ? 's' : ''}`,
    ].join(' · ');
    log.push({ event: 'import_ok', message: `${prefix} ✓ ${playerName} — ${details}` });

    // Short delay between requests to be polite to FPF
    await new Promise((r) => setTimeout(r, 200));
  }

  // Summary
  const parts: string[] = [];
  if (imported > 0) parts.push(`${imported} importados`);
  if (skipped > 0) parts.push(`${skipped} ignorados`);
  if (errors > 0) parts.push(`${errors} erros`);
  log.push({ event: 'import_info', message: `📥 Resultado: ${parts.join(', ')}` });

  return { success: true, data: { imported, skipped, errors, results, log } };
}

/* ───────────── Get Unlinked Players ───────────── */

export interface CompetitionPlayer {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  totalGames: number;
  isStaff: boolean;
  eskoutPlayerId: number | null;
  /** Whether this player ever started or had minutes (false = likely staff with real name) */
  everPlayed: boolean;
}

/** Get ALL unique players in a competition with their link status.
 *  Returns aggregated stats per player. Staff flagged. */
export async function getCompetitionPlayersWithLinkStatus(
  competitionId: number,
): Promise<ActionResponse<CompetitionPlayer[]>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);
  if (!matches?.length) return { success: true, data: [] };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Fetch ALL match players (linked + unlinked)
  const PAGE = 1000;
  const rows: { fpf_player_id: number | null; player_name: string; team_name: string; eskout_player_id: number | null; is_starter: boolean; minutes_played: number | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('fpf_player_id, player_name, team_name, eskout_player_id, is_starter, minutes_played')
      .in('match_id', matchIds)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // Aggregate per unique player
  const playerMap = new Map<string, CompetitionPlayer>();
  for (const row of rows) {
    const key = row.fpf_player_id ? `fpf:${row.fpf_player_id}` : `name:${row.player_name.toLowerCase().trim()}|${row.team_name}`;
    const played = row.is_starter || (row.minutes_played ?? 0) > 0;
    const existing = playerMap.get(key);
    if (existing) {
      existing.totalGames++;
      if (played) existing.everPlayed = true;
      if (row.eskout_player_id) existing.eskoutPlayerId = row.eskout_player_id;
    } else {
      playerMap.set(key, {
        fpfPlayerId: row.fpf_player_id,
        playerName: row.player_name,
        teamName: row.team_name,
        totalGames: 1,
        isStaff: isStaffEntry(row.player_name) || !played,
        eskoutPlayerId: row.eskout_player_id,
        everPlayed: played,
      });
    }
  }

  // Final staff classification: role name OR never played across all games
  for (const player of playerMap.values()) {
    player.isStaff = isStaffEntry(player.playerName) || !player.everPlayed;
  }


  // Sort: linked first, then unlinked players, then staff
  const result = Array.from(playerMap.values()).sort((a, b) => {
    // Staff always last
    if (a.isStaff !== b.isStaff) return a.isStaff ? 1 : -1;
    // Linked before unlinked
    const aLinked = a.eskoutPlayerId != null;
    const bLinked = b.eskoutPlayerId != null;
    if (aLinked !== bLinked) return aLinked ? -1 : 1;
    // By games desc
    return b.totalGames - a.totalGames;
  });

  return { success: true, data: result };
}

/* ───────────── Unlink All ───────────── */

/** Remove all eskout links for a competition. Used to reset bad auto-links and start fresh. */
export async function unlinkAllPlayers(
  competitionId: number,
): Promise<ActionResponse<{ unlinked: number }>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: { unlinked: 0 } };
  const matchIds = matches.map((m: { id: number }) => m.id);

  const { data, error } = await supabase
    .from('fpf_match_players')
    .update({ eskout_player_id: null })
    .in('match_id', matchIds)
    .not('eskout_player_id', 'is', null)
    .select('id');

  if (error) return { success: false, error: error.message };
  return { success: true, data: { unlinked: data?.length ?? 0 } };
}

/* ───────────── Manual Link ───────────── */

/** Manually link an FPF competition player to an eskout player.
 *  Updates all match_player rows with the given fpf_player_id or name+team. */
export async function manualLinkPlayer(
  competitionId: number,
  fpfPlayerId: number | null,
  playerName: string,
  teamName: string,
  eskoutPlayerId: number,
): Promise<ActionResponse<{ updated: number }>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // Get match IDs for this competition
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: false, error: 'Competição sem jogos' };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Find all match_player rows to update
  let query = supabase
    .from('fpf_match_players')
    .select('id')
    .in('match_id', matchIds)
    .is('eskout_player_id', null);

  // Match by fpf_player_id if available, otherwise by name+team
  if (fpfPlayerId) {
    query = query.eq('fpf_player_id', fpfPlayerId);
  } else {
    query = query.eq('player_name', playerName).eq('team_name', teamName);
  }

  const { data: rowsToUpdate } = await query;
  if (!rowsToUpdate?.length) return { success: true, data: { updated: 0 } };

  const ids = rowsToUpdate.map((r: { id: number }) => r.id);

  const { error } = await supabase
    .from('fpf_match_players')
    .update({ eskout_player_id: eskoutPlayerId })
    .in('id', ids);

  if (error) return { success: false, error: error.message };
  return { success: true, data: { updated: ids.length } };
}

/* ───────────── Fuzzy Suggestions ───────────── */

/** Normalize a name for fuzzy matching: lowercase, remove accents, collapse whitespace */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a club name for comparison: strip common suffixes, lowercase, remove accents/punctuation.
 *  e.g. "Fc Porto" → "porto", "Boavista F.C." → "boavista", "S.C. Braga" → "braga" */
function normalizeClub(club: string): string {
  return club
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|f\.c\.|f\.c|s\.c\.|s\.c|sc|cf|cd|ud|ad|gd|gdrc|ac|cs|us|sr|sl|sad|clube|club|futebol|sport|sporting|associacao|uniao|grupo|desportivo|recreativo)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if two club names likely refer to the same club */
function clubsMatch(clubA: string, clubB: string): boolean {
  const a = normalizeClub(clubA);
  const b = normalizeClub(clubB);
  if (!a || !b) return false;
  // Exact match after normalization, or one contains the other
  return a === b || a.includes(b) || b.includes(a);
}

/** Score how well two names match. Higher = better. 0 = no match.
 *  Query words must match the FIRST and LAST name of the candidate.
 *  "Dinis Machado" matches "Dinis Duarte Machado De Sá Pereira" (first=Dinis, last≈Machado? no).
 *  Actually: first query word must match candidate's first name, last query word must match
 *  candidate's last name. Middle names are ignored. */
function nameMatchScore(query: string, candidate: string): number {
  const qNorm = normalizeName(query);
  const cNorm = normalizeName(candidate);

  // Exact match
  if (qNorm === cNorm) return 100;

  // Split into words (ignore tiny words like "de", "da", "do")
  const qWords = qNorm.split(' ').filter((w) => w.length >= 2);
  const cWords = cNorm.split(' ').filter((w) => w.length >= 2);

  if (qWords.length === 0 || cWords.length === 0) return 0;

  const cFirst = cWords[0];
  const cLast = cWords[cWords.length - 1];
  const qFirst = qWords[0];
  const qLast = qWords[qWords.length - 1];

  // First query word must match candidate's first name
  const firstMatch = qFirst === cFirst || cFirst.startsWith(qFirst) || qFirst.startsWith(cFirst);
  if (!firstMatch) return 0;

  // Last query word must match candidate's last name
  const lastMatch = qLast === cLast || cLast.startsWith(qLast) || qLast.startsWith(cLast);
  if (!lastMatch) return 0;

  // Both matched — score based on exact vs prefix
  let score = 0;
  score += (qFirst === cFirst) ? 40 : 20;
  score += (qLast === cLast) ? 40 : 20;

  return score;
}

export interface PlayerSuggestion {
  eskoutPlayerId: number;
  eskoutName: string;
  eskoutClub: string | null;
  eskoutFpfLink: string | null;
  eskoutPhotoUrl: string | null;
  score: number;
  /** True when suggestion comes from a different club than the scraped player */
  crossClub?: boolean;
}

export interface UnlinkedWithSuggestions {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  totalGames: number;
  suggestions: PlayerSuggestion[];
}

/** Get unlinked players with fuzzy name suggestions from the eskout DB.
 *  Fetches all eskout players once, then scores each against unlinked competition players. */
export async function getUnlinkedWithSuggestions(
  competitionId: number,
): Promise<ActionResponse<UnlinkedWithSuggestions[]>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // Get competition matches
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: [] };
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Fetch unlinked match players
  const PAGE = 1000;
  const rows: { fpf_player_id: number | null; player_name: string; team_name: string; is_starter: boolean; minutes_played: number | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('fpf_player_id, player_name, team_name, is_starter, minutes_played')
      .in('match_id', matchIds)
      .is('eskout_player_id', null)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // Deduplicate + filter staff
  const unlinked = new Map<string, { fpfPlayerId: number | null; name: string; teamName: string; totalGames: number; everPlayed: boolean }>();
  for (const row of rows) {
    if (isStaffEntry(row.player_name)) continue;
    const key = row.fpf_player_id ? `fpf:${row.fpf_player_id}` : `name:${row.player_name.toLowerCase().trim()}|${row.team_name}`;
    const played = row.is_starter || (row.minutes_played ?? 0) > 0;
    const existing = unlinked.get(key);
    if (existing) {
      existing.totalGames++;
      if (played) existing.everPlayed = true;
    } else {
      unlinked.set(key, { fpfPlayerId: row.fpf_player_id, name: row.player_name, teamName: row.team_name, totalGames: 1, everPlayed: played });
    }
  }

  // Filter out staff-by-play (never played = staff)
  const realUnlinked = Array.from(unlinked.values()).filter((p) => p.everPlayed);
  if (realUnlinked.length === 0) return { success: true, data: [] };

  // Fetch all eskout players (name + club + fpf IDs + photo) for matching
  const eskoutPlayers: { id: number; name: string; club: string | null; fpf_player_id: string | null; fpf_link: string | null; photo_url: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('players')
      .select('id, name, club, fpf_player_id, fpf_link, photo_url')
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    eskoutPlayers.push(...data);
    if (data.length < PAGE) break;
  }

  // Build FPF ID → eskout player lookup for instant matching
  const fpfIdToEskout = new Map<number, { id: number; name: string; club: string | null; fpf_link: string | null; photo_url: string | null }>();
  for (const ep of eskoutPlayers) {
    if (ep.fpf_player_id) {
      const numId = parseInt(ep.fpf_player_id, 10);
      if (!isNaN(numId)) fpfIdToEskout.set(numId, ep);
    }
    if (ep.fpf_link) {
      const idMatch = ep.fpf_link.match(/\/(\d+)(?:[/?#]|$)/);
      if (idMatch) {
        const linkId = parseInt(idMatch[1], 10);
        if (!fpfIdToEskout.has(linkId)) fpfIdToEskout.set(linkId, ep);
      }
    }
  }

  // For each unlinked player, find suggestions.
  // Strategy: FPF ID match first (100% reliable), then name+club fuzzy match.
  const MIN_SCORE = 50;
  const result: UnlinkedWithSuggestions[] = realUnlinked
    .sort((a, b) => b.totalGames - a.totalGames)
    .map((player) => {
      // Strategy 1: exact FPF player ID match — 100% reliable
      if (player.fpfPlayerId) {
        const match = fpfIdToEskout.get(player.fpfPlayerId);
        if (match) {
          return {
            fpfPlayerId: player.fpfPlayerId,
            playerName: player.name,
            teamName: player.teamName,
            totalGames: player.totalGames,
            suggestions: [{
              eskoutPlayerId: match.id,
              eskoutName: match.name,
              eskoutClub: match.club,
              eskoutFpfLink: match.fpf_link ?? null,
              eskoutPhotoUrl: match.photo_url ?? null,
              score: 100,
            }],
          };
        }
      }

      // Strategy 2: name + club fuzzy match
      const sameClub: PlayerSuggestion[] = [];
      const otherClub: PlayerSuggestion[] = [];

      for (const ep of eskoutPlayers) {
        const score = nameMatchScore(player.name, ep.name);
        if (score < MIN_SCORE) continue;

        const suggestion: PlayerSuggestion = {
          eskoutPlayerId: ep.id,
          eskoutName: ep.name,
          eskoutClub: ep.club,
          eskoutFpfLink: ep.fpf_link,
          eskoutPhotoUrl: ep.photo_url,
          score,
        };

        if (ep.club && clubsMatch(player.teamName, ep.club)) {
          sameClub.push(suggestion);
        } else {
          otherClub.push({ ...suggestion, crossClub: true });
        }
      }

      // Prefer same-club. Fallback to cross-club (marked) when no same-club match.
      let suggestions = sameClub.length > 0 ? sameClub : otherClub;
      suggestions.sort((a, b) => b.score - a.score);
      suggestions = suggestions.slice(0, 5);

      return {
        fpfPlayerId: player.fpfPlayerId,
        playerName: player.name,
        teamName: player.teamName,
        totalGames: player.totalGames,
        suggestions,
      };
    });

  return { success: true, data: result };
}

/* ───────────── Bulk Manual Link ───────────── */

export interface BulkLinkEntry {
  fpfPlayerId: number | null;
  playerName: string;
  teamName: string;
  eskoutPlayerId: number;
}

/** Link multiple competition players to eskout players in one call. */
export async function bulkLinkPlayers(
  competitionId: number,
  entries: BulkLinkEntry[],
): Promise<ActionResponse<{ linked: number }>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  if (entries.length === 0) return { success: true, data: { linked: 0 } };

  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: false, error: 'Competição sem jogos' };
  const matchIds = matches.map((m: { id: number }) => m.id);

  let linked = 0;

  for (const entry of entries) {
    // Find match_player rows for this player
    let query = supabase
      .from('fpf_match_players')
      .select('id')
      .in('match_id', matchIds)
      .is('eskout_player_id', null);

    if (entry.fpfPlayerId) {
      query = query.eq('fpf_player_id', entry.fpfPlayerId);
    } else {
      query = query.eq('player_name', entry.playerName).eq('team_name', entry.teamName);
    }

    const { data: rowsToUpdate } = await query;
    if (!rowsToUpdate?.length) continue;

    const ids = rowsToUpdate.map((r: { id: number }) => r.id);
    const { error } = await supabase
      .from('fpf_match_players')
      .update({ eskout_player_id: entry.eskoutPlayerId })
      .in('id', ids);

    if (!error) linked++;
  }

  return { success: true, data: { linked } };
}

/* ───────────── Search Eskout Players ───────────── */

/** Search eskout players by name/club for manual linking. Uses DB-level search per word
 *  then client-side fuzzy filtering. "rodrigo alfen" → finds "Rodrigo Costa" at "Alfenense". */
export async function searchEskoutPlayers(
  query: string,
): Promise<ActionResponse<PlayerSuggestion[]>> {
  const supabase = await requireSuperadmin();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  if (!query || query.trim().length < 2) return { success: true, data: [] };

  const words = query.toLowerCase().trim().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return { success: true, data: [] };

  // DB search: build chained ilike filters for ALL words on name.
  // Words that don't match name are checked client-side against club.
  // This narrows results much better than single-word search.
  type PlayerRow = { id: number; name: string; club: string | null; fpf_current_club: string | null; fpf_link: string | null; photo_url: string | null };
  const SELECT_COLS = 'id, name, club, fpf_current_club, fpf_link, photo_url';

  // Split words into name-words (try all in DB) and remaining (check client-side vs club)
  let dbQuery = supabase.from('players').select(SELECT_COLS);
  for (const w of words) {
    dbQuery = dbQuery.ilike('name', `%${w}%`);
  }
  let { data } = await dbQuery.limit(50);

  // If no results with all words in name, try with fewer name filters
  // (some words might be club names, not player names)
  if (!data?.length && words.length > 1) {
    // Try each single word as the name filter, check rest client-side
    for (const w of words) {
      const { data: rows } = await supabase
        .from('players')
        .select(SELECT_COLS)
        .ilike('name', `%${w}%`)
        .limit(500);
      if (rows && rows.length > 0) {
        const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const otherWords = words.filter((ow) => ow !== w);
        const filtered = rows.filter((p: PlayerRow) => {
          const haystack = normalize(`${p.name} ${p.club ?? ''} ${p.fpf_current_club ?? ''}`);
          return otherWords.every((ow) => haystack.includes(normalize(ow)));
        });
        if (filtered.length > 0) {
          data = filtered.slice(0, 50);
          break;
        }
      }
    }
  }

  if (!data?.length) return { success: true, data: [] };

  return {
    success: true,
    data: data.slice(0, 10).map((p: PlayerRow) => ({
      eskoutPlayerId: p.id,
      eskoutName: p.name,
      eskoutClub: p.club || p.fpf_current_club,
      eskoutFpfLink: p.fpf_link,
      eskoutPhotoUrl: p.photo_url,
      score: 0,
    })),
  };
}

// src/actions/scraping/fpf-competitions/stats.ts
// Aggregated statistics queries for FPF competition data — top scorers, minutes, cards, team stats
// All queries run on fpf_match_players with GROUP BY — no materialized views needed at this scale
// RELEVANT FILES: src/actions/scraping/fpf-competitions/scrape-competition.ts, src/lib/types/index.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResponse, FpfMatchRow, FpfMatchPlayerRow } from '@/lib/types';
import { aggregatePlayers, type PlayerStatRow } from './stats-utils';

/* ───────────── Auth Helper ───────────── */

/** Check user has competition read access (superadmin OR can_view_competitions) */
async function requireCompetitionAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin, can_view_competitions')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin && !profile?.can_view_competitions) return null;
  return supabase;
}

// Re-export types for consumers that import from stats.ts
export type { PlayerStatRow } from './stats-utils';

export interface TeamStatRow {
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

/** Classification grouped by series — each series has its own table */
export interface SeriesClassification {
  seriesName: string;
  teams: TeamStatRow[];
}

export interface MatchDetailRow {
  match: FpfMatchRow;
  players: FpfMatchPlayerRow[];
}

// aggregatePlayers imported from stats-utils.ts (sync function can't be exported from 'use server')

/* ───────────── Paginated Fetch ───────────── */

/** Fetch all match_players for a competition (paginated to bypass Supabase 1000-row limit) */
async function fetchAllMatchPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: number,
): Promise<FpfMatchPlayerRow[]> {
  // First get all match IDs for this competition
  const { data: matches } = await supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return [];
  const matchIds = matches.map((m: { id: number }) => m.id);

  // Fetch players in pages
  const PAGE = 1000;
  const allRows: FpfMatchPlayerRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('*')
      .in('match_id', matchIds)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    allRows.push(...(data as FpfMatchPlayerRow[]));
    if (data.length < PAGE) break;
  }

  return allRows;
}

/* ───────────── Top Scorers ───────────── */

export async function getTopScorers(
  competitionId: number,
  limit: number = 50,
): Promise<ActionResponse<PlayerStatRow[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const rows = await fetchAllMatchPlayers(supabase, competitionId);
  const stats = aggregatePlayers(rows)
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.totalMinutes - b.totalMinutes)
    .slice(0, limit);

  return { success: true, data: stats };
}

/* ───────────── Most Minutes ───────────── */

export async function getMostMinutes(
  competitionId: number,
  limit: number = 50,
): Promise<ActionResponse<PlayerStatRow[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const rows = await fetchAllMatchPlayers(supabase, competitionId);
  const stats = aggregatePlayers(rows)
    .filter((s) => s.totalMinutes > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, limit);

  return { success: true, data: stats };
}

/* ───────────── Most Cards ───────────── */

export async function getMostCards(
  competitionId: number,
  limit: number = 50,
): Promise<ActionResponse<PlayerStatRow[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const rows = await fetchAllMatchPlayers(supabase, competitionId);
  const stats = aggregatePlayers(rows)
    .filter((s) => s.yellowCards > 0 || s.redCards > 0)
    .sort((a, b) => {
      // Sort by total disciplinary points: red=3, yellow=1
      const aPoints = a.redCards * 3 + a.yellowCards;
      const bPoints = b.redCards * 3 + b.yellowCards;
      return bPoints - aPoints;
    })
    .slice(0, limit);

  return { success: true, data: stats };
}

/* ───────────── Team Stats ───────────── */

export async function getTeamStats(
  competitionId: number,
): Promise<ActionResponse<SeriesClassification[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // Fetch all matches for this competition
  const PAGE = 1000;
  const allMatches: FpfMatchRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_matches')
      .select('*')
      .eq('competition_id', competitionId)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    allMatches.push(...(data as FpfMatchRow[]));
    if (data.length < PAGE) break;
  }

  // Group matches by series_name (null → "Geral" for competitions with no series)
  // Clean up technical series names like "SerieId_88594" → sorted by ID and renamed
  const matchesBySeries = new Map<string, FpfMatchRow[]>();
  for (const m of allMatches) {
    const key = m.series_name || 'Geral';
    if (!matchesBySeries.has(key)) matchesBySeries.set(key, []);
    matchesBySeries.get(key)!.push(m);
  }

  // Rename "SerieId_XXXXX" entries to "Série 1", "Série 2", etc.
  const technicalKeys = Array.from(matchesBySeries.keys())
    .filter((k) => /^SerieId_\d+$/i.test(k))
    .sort((a, b) => {
      const idA = parseInt(a.replace(/\D/g, ''), 10);
      const idB = parseInt(b.replace(/\D/g, ''), 10);
      return idA - idB;
    });
  if (technicalKeys.length > 0) {
    technicalKeys.forEach((key, i) => {
      const matches = matchesBySeries.get(key)!;
      matchesBySeries.delete(key);
      matchesBySeries.set(`Série ${i + 1}`, matches);
    });
  }

  // Build classification for each series
  const result: SeriesClassification[] = [];
  for (const [seriesName, matches] of matchesBySeries) {
    const teamMap = new Map<string, TeamStatRow>();
    const getTeam = (name: string): TeamStatRow => {
      if (!teamMap.has(name)) {
        teamMap.set(name, { teamName: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
      }
      return teamMap.get(name)!;
    };

    for (const m of matches) {
      if (m.home_score == null || m.away_score == null || m.is_forfeit) continue;

      const home = getTeam(m.home_team);
      const away = getTeam(m.away_team);

      home.played++;
      away.played++;
      home.goalsFor += m.home_score;
      home.goalsAgainst += m.away_score;
      away.goalsFor += m.away_score;
      away.goalsAgainst += m.home_score;

      if (m.home_score > m.away_score) {
        home.won++;
        home.points += 3;
        away.lost++;
      } else if (m.home_score < m.away_score) {
        away.won++;
        away.points += 3;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
      }
    }

    // Calculate goal difference and sort by points → GD → GF
    const teams = Array.from(teamMap.values()).map((t) => ({
      ...t,
      goalDiff: t.goalsFor - t.goalsAgainst,
    }));
    teams.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor);

    result.push({ seriesName, teams });
  }

  // Sort series alphabetically (but "Geral" first if only one)
  result.sort((a, b) => {
    if (a.seriesName === 'Geral') return -1;
    if (b.seriesName === 'Geral') return 1;
    return a.seriesName.localeCompare(b.seriesName, 'pt');
  });

  return { success: true, data: result };
}

/* ───────────── Player Search ───────────── */

export async function searchPlayer(
  competitionId: number,
  query: string,
  limit: number = 30,
): Promise<ActionResponse<PlayerStatRow[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  if (!query || query.trim().length < 2) return { success: true, data: [] };

  const rows = await fetchAllMatchPlayers(supabase, competitionId);

  // Filter by name (case-insensitive partial match)
  const q = query.toLowerCase().trim();
  const filtered = rows.filter((r) => r.player_name.toLowerCase().includes(q));

  const stats = aggregatePlayers(filtered)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, limit);

  return { success: true, data: stats };
}

/* ───────────── Competition Matches ───────────── */

/** Get all matches for a competition (for results/upcoming games view) */
export async function getCompetitionMatches(
  competitionId: number,
  options?: { phaseName?: string; seriesName?: string; fixtureId?: number },
): Promise<ActionResponse<FpfMatchRow[]>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  let query = supabase
    .from('fpf_matches')
    .select('*')
    .eq('competition_id', competitionId)
    .order('match_date', { ascending: false });

  if (options?.phaseName) query = query.eq('phase_name', options.phaseName);
  if (options?.seriesName) query = query.eq('series_name', options.seriesName);
  if (options?.fixtureId) query = query.eq('fpf_fixture_id', options.fixtureId);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as FpfMatchRow[] };
}

/* ───────────── Match Detail ───────────── */

/** Get full match detail: match info + all player appearances */
export async function getMatchDetail(
  matchId: number,
): Promise<ActionResponse<MatchDetailRow>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  const { data: match } = await supabase
    .from('fpf_matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (!match) return { success: false, error: 'Jogo não encontrado' };

  const { data: players } = await supabase
    .from('fpf_match_players')
    .select('*')
    .eq('match_id', matchId)
    .order('is_starter', { ascending: false })
    .order('shirt_number');

  return {
    success: true,
    data: {
      match: match as FpfMatchRow,
      players: (players ?? []) as FpfMatchPlayerRow[],
    },
  };
}

/* ───────────── Player Profile Stats ───────────── */

/** Get FPF competition stats for a specific eskout player (for player profile) */
export async function getPlayerFpfStats(
  eskoutPlayerId: number,
): Promise<ActionResponse<{ competitions: { competition: string; season: string; stats: PlayerStatRow }[] }>> {
  const supabase = await requireCompetitionAccess();
  if (!supabase) return { success: false, error: 'Acesso negado' };

  // Get all appearances for this player
  const PAGE = 1000;
  const allRows: (FpfMatchPlayerRow & { fpf_matches: { competition_id: number } })[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('*, fpf_matches!inner(competition_id)')
      .eq('eskout_player_id', eskoutPlayerId)
      .range(offset, offset + PAGE - 1);

    if (!data?.length) break;
    allRows.push(...(data as typeof allRows));
    if (data.length < PAGE) break;
  }

  if (allRows.length === 0) return { success: true, data: { competitions: [] } };

  // Group by competition
  const byComp = new Map<number, FpfMatchPlayerRow[]>();
  for (const row of allRows) {
    const compId = row.fpf_matches.competition_id;
    if (!byComp.has(compId)) byComp.set(compId, []);
    byComp.get(compId)!.push(row);
  }

  // Get competition info
  const compIds = Array.from(byComp.keys());
  const { data: comps } = await supabase
    .from('fpf_competitions')
    .select('id, name, season')
    .in('id', compIds);

  const competitions = (comps ?? []).map((c: { id: number; name: string; season: string }) => {
    const rows = byComp.get(c.id) ?? [];
    const stats = aggregatePlayers(rows);
    return {
      competition: c.name,
      season: c.season,
      stats: stats[0] ?? {
        fpfPlayerId: null, playerName: '', teamName: '', gamesStarted: 0, gamesAsSub: 0,
        totalGames: 0, totalMinutes: 0, goals: 0, penaltyGoals: 0, ownGoals: 0,
        yellowCards: 0, redCards: 0, eskoutPlayerId: eskoutPlayerId,
      },
    };
  });

  return { success: true, data: { competitions } };
}

// src/actions/scraping/fpf-competitions/scrape-competition.ts
// Orchestrator: scrape all fixtures and matches for an FPF competition (incremental)
// Handles progress tracking, rate limiting, batch inserts, and resume-on-failure
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, src/actions/scraping/fpf-competitions/scrape-match.ts

'use server';

import { createClient } from '@/lib/supabase/server';
import { humanDelay } from '../helpers';
import { getCompetitionFixtures, getFixtureMatches } from './browse';
import { scrapeMatch, calculateMinutes } from './scrape-match';
import { ESCALAO_MATCH_DURATION, FPF_CLASS_TO_ESCALAO, getEscalaoBirthYearRange } from '@/lib/constants';
import { linkMatchPlayersToEskout, importUnlinkedPlayers } from './link-players';
import { addFpfCompetitionSchema, type AddFpfCompetitionData } from '@/lib/validators';
import type { ActionResponse, FpfCompetitionRow, FpfMatchEventType } from '@/lib/types';

/* ───────────── Auth Helper ───────────── */

async function requireSuperadmin(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_superadmin) return null;
  return { supabase, userId: user.id };
}

/* ───────────── Discover Fixtures ───────────── */

/** Step 1 of scraping: discover all fixtures for a competition (no DB writes, just reads FPF).
 *  Returns fixture list so the client can loop them one-by-one with full progress. */
export async function discoverCompetitionFixtures(
  competitionId: number,
): Promise<ActionResponse<{
  fixtures: { fixtureId: number; name: string; phaseName: string; seriesName: string }[];
  existingMatchIds: number[];
  /** Number of matches already scraped per fpf_fixture_id — used to skip complete fixtures */
  matchCountByFixture: Record<number, number>;
}>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const { data: comp } = await auth.supabase
    .from('fpf_competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (!comp) return { success: false, error: 'Competição não encontrada' };

  // Update status to scraping
  await auth.supabase
    .from('fpf_competitions')
    .update({ scrape_status: 'scraping', scrape_error: null })
    .eq('id', competitionId);

  // Discover fixtures from FPF
  const fixturesRes = await getCompetitionFixtures(comp.fpf_competition_id, comp.fpf_season_id);
  if (!fixturesRes.success || !fixturesRes.data) {
    await auth.supabase
      .from('fpf_competitions')
      .update({ scrape_status: 'error', scrape_error: fixturesRes.error ?? 'Falha ao buscar jornadas' })
      .eq('id', competitionId);
    return { success: false, error: fixturesRes.error ?? 'Falha ao buscar jornadas' };
  }

  // Update fixture count
  await auth.supabase
    .from('fpf_competitions')
    .update({ total_fixtures: fixturesRes.data.length })
    .eq('id', competitionId);

  // Get already-scraped matches: matchIds (for skip) + counts per fixture (for smart skip)
  const { data: existingMatches } = await auth.supabase
    .from('fpf_matches')
    .select('fpf_match_id, fpf_fixture_id')
    .eq('competition_id', competitionId);

  const existingMatchIds = (existingMatches ?? []).map((m: { fpf_match_id: number }) => m.fpf_match_id);

  // Count matches per fixture to skip already-complete fixtures
  const matchCountByFixture: Record<number, number> = {};
  for (const m of existingMatches ?? []) {
    const fid = (m as { fpf_fixture_id: number }).fpf_fixture_id;
    matchCountByFixture[fid] = (matchCountByFixture[fid] ?? 0) + 1;
  }

  return { success: true, data: { fixtures: fixturesRes.data, existingMatchIds, matchCountByFixture } };
}

/* ───────────── Add Competition ───────────── */

/** Track a new competition for scraping */
export async function addCompetition(data: AddFpfCompetitionData): Promise<ActionResponse<FpfCompetitionRow>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const parsed = addFpfCompetitionSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { fpfCompetitionId, fpfSeasonId, name, associationName, associationId, classId, escalao, season, matchDurationMinutes } = parsed.data;

  // Resolve escalão and birth year range from classId
  const resolvedEscalao = escalao ?? (classId ? FPF_CLASS_TO_ESCALAO[classId] ?? null : null);
  const resolvedDuration = matchDurationMinutes ?? (resolvedEscalao ? ESCALAO_MATCH_DURATION[resolvedEscalao] ?? 70 : 70);

  // Extract season start year from season string (e.g. "2025/2026" → 2025)
  const seasonStartYear = parseInt(season.split('/')[0], 10);
  const birthRange = resolvedEscalao ? getEscalaoBirthYearRange(resolvedEscalao, seasonStartYear) : null;

  const { data: row, error } = await auth.supabase
    .from('fpf_competitions')
    .upsert({
      fpf_competition_id: fpfCompetitionId,
      fpf_season_id: fpfSeasonId,
      name,
      association_name: associationName ?? null,
      association_id: associationId ?? null,
      class_id: classId ?? null,
      escalao: resolvedEscalao,
      season,
      expected_birth_year_start: birthRange?.start ?? null,
      expected_birth_year_end: birthRange?.end ?? null,
      match_duration_minutes: resolvedDuration,
      created_by: auth.userId,
    }, { onConflict: 'fpf_competition_id,fpf_season_id' })
    .select()
    .single();

  if (error) return { success: false, error: `Erro ao guardar: ${error.message}` };
  return { success: true, data: row as FpfCompetitionRow };
}

/* ───────────── Scrape Competition ───────────── */

/** Log entry returned to client for live progress */
export interface ScrapeLogEntry {
  event: 'info' | 'fixture_ok' | 'fixture_fail' | 'match_ok' | 'match_fail' | 'match_skip';
  message: string;
  durationMs?: number;
}

/** Scrape progress snapshot */
export interface ScrapeProgress {
  totalFixtures: number;
  doneFixtures: number;
  totalMatches: number;
  scrapedMatches: number;
  newMatches: number;
  skippedMatches: number;
  errors: number;
}

/** Scrape a single fixture — called by the client in a loop for granular progress.
 *  Returns per-match log entries so the UI can show exactly what happened. */
export async function scrapeOneFixture(
  competitionId: number,
  fixtureId: number,
  fixtureName: string,
  phaseName: string,
  seriesName: string,
  existingMatchIds: number[],
): Promise<ActionResponse<{ log: ScrapeLogEntry[]; newMatches: number; skipped: number; errors: number; newMatchIds: number[] }>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const { data: comp } = await auth.supabase
    .from('fpf_competitions')
    .select('match_duration_minutes')
    .eq('id', competitionId)
    .single();

  const matchDuration = comp?.match_duration_minutes ?? 70;
  const existingSet = new Set(existingMatchIds);
  const log: ScrapeLogEntry[] = [];
  let newMatches = 0;
  let skipped = 0;
  let errors = 0;

  // Find skeleton matches (future games saved without score) so we can re-scrape when played
  const { data: skeletonRows } = await auth.supabase
    .from('fpf_matches')
    .select('fpf_match_id')
    .eq('competition_id', competitionId)
    .is('home_score', null);
  const skeletonMatchIds = new Set((skeletonRows ?? []).map((r: { fpf_match_id: number }) => r.fpf_match_id));
  const newMatchIds: number[] = [];
  const t0 = Date.now();

  // Fetch matches for this fixture from FPF
  log.push({ event: 'info', message: `A buscar jogos de ${fixtureName} (${seriesName || phaseName})…` });
  const matchesRes = await getFixtureMatches(fixtureId);
  if (!matchesRes.success || !matchesRes.data) {
    log.push({ event: 'fixture_fail', message: `${fixtureName} — falhou a obter jogos`, durationMs: Date.now() - t0 });
    return { success: true, data: { log, newMatches: 0, skipped: 0, errors: 1, newMatchIds: [] } };
  }

  const fixtureMatches = matchesRes.data;

  // Early return: no matches at all or all already scraped
  const newMatches_check = fixtureMatches.filter((fm) => !existingSet.has(fm.matchId));
  if (newMatches_check.length === 0) {
    const totalSkipped = fixtureMatches.length;
    log.push({ event: 'match_skip', message: `${fixtureName} — sem jogos novos (${totalSkipped} já existentes)`, durationMs: Date.now() - t0 });
    return { success: true, data: { log, newMatches: 0, skipped: totalSkipped, errors: 0, newMatchIds: [] } };
  }

  const playedCount = newMatches_check.filter((fm) => fm.isPlayed).length;
  const futureCount = newMatches_check.length - playedCount;
  log.push({ event: 'info', message: `${fixtureName}: ${playedCount} jogos jogados + ${futureCount} futuros de ${fixtureMatches.length}` });

  for (const fm of fixtureMatches) {
    // Skip already-scraped matches UNLESS it was a skeleton (no score) that has now been played
    if (existingSet.has(fm.matchId)) {
      if (fm.isPlayed && skeletonMatchIds.has(fm.matchId)) {
        // Skeleton match now played — delete old skeleton, re-scrape with full data
        await auth.supabase.from('fpf_matches').delete().eq('fpf_match_id', fm.matchId).eq('competition_id', competitionId);
        skeletonMatchIds.delete(fm.matchId);
        existingSet.delete(fm.matchId);
        log.push({ event: 'info', message: `♻ ${fm.homeTeam} vs ${fm.awayTeam} — jogo futuro agora jogado, a re-scrape…` });
      } else {
        skipped++;
        continue;
      }
    }
    // Future matches: insert skeleton (teams + date, no lineup/events)
    if (!fm.isPlayed) {
      const { error: futErr } = await auth.supabase
        .from('fpf_matches')
        .insert({
          competition_id: competitionId,
          fpf_match_id: fm.matchId,
          fpf_fixture_id: fixtureId,
          fixture_name: fixtureName,
          phase_name: phaseName || null,
          series_name: seriesName || null,
          home_team: fm.homeTeam,
          away_team: fm.awayTeam,
          home_score: null,
          away_score: null,
          match_date: fm.date || null,
          match_time: fm.time || null,
          venue: null,
          referee: null,
          is_forfeit: false,
          has_lineup_data: false,
        });
      if (!futErr) {
        newMatches++;
        newMatchIds.push(fm.matchId);
        existingSet.add(fm.matchId);
      }
      continue;
    }

    // Scrape the match sheet
    log.push({ event: 'info', message: `A scrape: ${fm.homeTeam} vs ${fm.awayTeam}…` });
    const parsed = await scrapeMatch(fm.matchId);
    if (!parsed) {
      log.push({ event: 'match_fail', message: `${fm.homeTeam} vs ${fm.awayTeam} — falhou a obter ficha` });
      errors++;
      continue;
    }

    // Fallback team names: parser may fail to extract from HTML, use fixture data.
    // Patch player teamNames before inserting — players get assigned homeTeam/awayTeam
    // inside the parser, but if extractTeamNames failed they'll be empty strings.
    const realHome = parsed.homeTeam || fm.homeTeam;
    const realAway = parsed.awayTeam || fm.awayTeam;
    if (!parsed.homeTeam || !parsed.awayTeam) {
      const oldHome = parsed.homeTeam || '';
      const oldAway = parsed.awayTeam || '';
      for (const p of parsed.players) {
        if (p.teamName === oldHome) p.teamName = realHome;
        else if (p.teamName === oldAway) p.teamName = realAway;
      }
      for (const e of parsed.events) {
        if (e.teamName === oldHome) e.teamName = realHome;
        else if (e.teamName === oldAway) e.teamName = realAway;
      }
    }

    // DB-level dedup: check if a match with the same teams already exists in this fixture.
    // This catches ghosts from FPF classification links that have different matchIds
    // but resolve to the same physical match (scrapeMatch returns accurate team names).
    const { count: dupCount } = await auth.supabase
      .from('fpf_matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
      .eq('fpf_fixture_id', fixtureId)
      .eq('home_team', realHome)
      .eq('away_team', realAway);

    if (dupCount && dupCount > 0) {
      log.push({ event: 'match_skip', message: `${realHome} vs ${realAway} — duplicado (já existe nesta jornada)` });
      skipped++;
      existingSet.add(fm.matchId);
      continue;
    }

    // Insert match
    const { data: matchRow, error: matchErr } = await auth.supabase
      .from('fpf_matches')
      .insert({
        competition_id: competitionId,
        fpf_match_id: fm.matchId,
        fpf_fixture_id: fixtureId,
        fixture_name: fixtureName,
        phase_name: phaseName || null,
        series_name: seriesName || null,
        home_team: parsed.homeTeam || fm.homeTeam,
        away_team: parsed.awayTeam || fm.awayTeam,
        home_score: parsed.homeScore ?? fm.homeScore,
        away_score: parsed.awayScore ?? fm.awayScore,
        match_date: parsed.date,
        match_time: parsed.time,
        venue: parsed.venue,
        referee: parsed.referee,
        is_forfeit: parsed.isForfeit,
        has_lineup_data: parsed.hasLineupData,
      })
      .select('id')
      .single();

    if (matchErr || !matchRow) {
      log.push({ event: 'match_fail', message: `${fm.homeTeam} vs ${fm.awayTeam} — erro DB: ${matchErr?.message}` });
      errors++;
      continue;
    }

    const matchDbId = matchRow.id;

    // Calculate minutes + build event maps
    const minutesMap = calculateMinutes(parsed.players, parsed.events, matchDuration);
    const playerGoals = new Map<string, number>();
    const playerPenalties = new Map<string, number>();
    const playerOwnGoals = new Map<string, number>();
    const playerYellows = new Map<string, number>();
    const playerReds = new Map<string, number>();
    const playerRedMinute = new Map<string, number>();
    const playerSubInMinute = new Map<string, number>();
    const playerSubOutMinute = new Map<string, number>();

    for (const event of parsed.events) {
      const inc = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
      switch (event.eventType) {
        case 'goal': inc(playerGoals, event.playerName); break;
        case 'penalty_goal': inc(playerPenalties, event.playerName); inc(playerGoals, event.playerName); break;
        case 'own_goal': inc(playerOwnGoals, event.playerName); break;
        case 'yellow_card': inc(playerYellows, event.playerName); break;
        case 'red_card':
          inc(playerReds, event.playerName);
          if (event.minute != null) playerRedMinute.set(event.playerName, event.minute);
          break;
        case 'substitution_in':
          if (event.minute != null) playerSubInMinute.set(event.playerName, event.minute);
          break;
        case 'substitution_out':
          if (event.minute != null) playerSubOutMinute.set(event.playerName, event.minute);
          break;
      }
    }

    // Insert match players
    if (parsed.hasLineupData) {
      const playerRows = parsed.players
        .filter((p) => p.isStarter || minutesMap.has(p.playerName) || playerSubInMinute.has(p.playerName))
        .map((p) => ({
          match_id: matchDbId,
          fpf_player_id: p.fpfPlayerId,
          player_name: p.playerName,
          shirt_number: p.shirtNumber,
          team_name: p.teamName,
          is_starter: p.isStarter,
          is_substitute: p.isSubstitute,
          subbed_in_minute: playerSubInMinute.get(p.playerName) ?? null,
          subbed_out_minute: playerSubOutMinute.get(p.playerName) ?? null,
          minutes_played: minutesMap.get(p.playerName) ?? 0,
          goals: playerGoals.get(p.playerName) ?? 0,
          penalty_goals: playerPenalties.get(p.playerName) ?? 0,
          own_goals: playerOwnGoals.get(p.playerName) ?? 0,
          yellow_cards: playerYellows.get(p.playerName) ?? 0,
          red_cards: playerReds.get(p.playerName) ?? 0,
          red_card_minute: playerRedMinute.get(p.playerName) ?? null,
        }));

      if (playerRows.length > 0) {
        await auth.supabase.from('fpf_match_players').insert(playerRows);
      }
    }

    // Insert match events
    if (parsed.events.length > 0) {
      const eventRows = parsed.events.map((e) => ({
        match_id: matchDbId,
        event_type: e.eventType as FpfMatchEventType,
        minute: e.minute,
        player_name: e.playerName,
        fpf_player_id: e.fpfPlayerId,
        team_name: e.teamName,
        related_player_name: e.relatedPlayerName,
        related_fpf_player_id: e.relatedFpfPlayerId,
        notes: e.notes,
      }));
      await auth.supabase.from('fpf_match_events').insert(eventRows);
    }

    const score = `${parsed.homeScore ?? fm.homeScore ?? '?'}-${parsed.awayScore ?? fm.awayScore ?? '?'}`;
    log.push({ event: 'match_ok', message: `${parsed.homeTeam || fm.homeTeam} ${score} ${parsed.awayTeam || fm.awayTeam}` });

    newMatches++;
    newMatchIds.push(fm.matchId);
    existingSet.add(fm.matchId);

    // Small delay between matches
    await humanDelay(1500, 2500);
  }

  const ctxLabel = [seriesName, phaseName].filter(Boolean).join(' — ');
  const fullLabel = ctxLabel ? `${fixtureName} (${ctxLabel})` : fixtureName;
  log.push({
    event: 'fixture_ok',
    message: `${fullLabel} concluída — ${newMatches} novos, ${skipped} ignorados`,
    durationMs: Date.now() - t0,
  });

  return { success: true, data: { log, newMatches, skipped, errors, newMatchIds } };
}

/** Update competition stats after scraping (called by client when done or between fixtures). */
export async function updateCompetitionStats(
  competitionId: number,
  isDone: boolean,
): Promise<ActionResponse<void>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const sb = auth.supabase;

  // 1. Fetch all matches for this competition (paginated — can exceed 1000)
  const PAGE = 1000;
  const matches: { id: number; series_name: string | null; home_team: string; away_team: string }[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await sb
      .from('fpf_matches')
      .select('id, series_name, home_team, away_team')
      .eq('competition_id', competitionId)
      .range(offset, offset + PAGE - 1);
    if (data && data.length > 0) {
      matches.push(...data);
      offset += PAGE;
      hasMore = data.length === PAGE;
    } else {
      hasMore = false;
    }
  }

  // Aggregate match-level stats
  const seriesSet = new Set<string>();
  const teamsSet = new Set<string>();
  for (const m of matches) {
    if (m.series_name) seriesSet.add(m.series_name);
    teamsSet.add(m.home_team);
    teamsSet.add(m.away_team);
  }

  // 2. Fetch player stats — batch .in() in chunks of 300 match IDs
  const matchIds = matches.map((m) => m.id);
  const allPlayers = new Set<string>();
  const linkedPlayers = new Set<string>();
  const unlinkedPlayers = new Set<string>();

  if (matchIds.length > 0) {
    const ID_CHUNK = 300;
    for (let c = 0; c < matchIds.length; c += ID_CHUNK) {
      const chunk = matchIds.slice(c, c + ID_CHUNK);
      let pOffset = 0;
      let pMore = true;
      while (pMore) {
        const { data: page } = await sb
          .from('fpf_match_players')
          .select('fpf_player_id, eskout_player_id')
          .in('match_id', chunk)
          .range(pOffset, pOffset + PAGE - 1);
        if (page && page.length > 0) {
          for (const p of page) {
            if (!p.fpf_player_id) continue;
            const key = String(p.fpf_player_id);
            allPlayers.add(key);
            if (p.eskout_player_id) linkedPlayers.add(key); else unlinkedPlayers.add(key);
          }
          pOffset += PAGE;
          pMore = page.length === PAGE;
        } else {
          pMore = false;
        }
      }
    }
  }

  // 3. Write denormalized stats to fpf_competitions
  await sb
    .from('fpf_competitions')
    .update({
      scraped_matches: matches.length,
      total_matches: matches.length,
      total_series: seriesSet.size,
      total_teams: teamsSet.size,
      total_players: allPlayers.size,
      linked_players: linkedPlayers.size,
      unlinked_players: unlinkedPlayers.size,
      last_scraped_at: new Date().toISOString(),
      scrape_status: isDone ? 'complete' : 'partial',
    })
    .eq('id', competitionId);

  return { success: true, data: undefined };
}

/** Backfill series_name and phase_name on existing matches using the fixture parser.
 *  Runs for ALL tracked competitions. Fixes matches scraped before the series parser was fixed. */
/** Update series_name and phase_name on existing matches using fixture context from discover.
 *  Called per-competition from the client (which already has the fixture list from discoverCompetitionFixtures). */
export async function updateMatchSeriesNames(
  competitionId: number,
  fixtureContext: { fixtureId: number; phaseName: string; seriesName: string }[],
): Promise<ActionResponse<{ updated: number; total: number }>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  // Build fixtureId → context lookup
  const ctxMap = new Map<number, { phaseName: string; seriesName: string }>();
  for (const f of fixtureContext) {
    ctxMap.set(f.fixtureId, { phaseName: f.phaseName, seriesName: f.seriesName });
  }

  // Get all matches for this competition
  const { data: matches } = await auth.supabase
    .from('fpf_matches')
    .select('id, fpf_fixture_id, series_name, phase_name')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: { updated: 0, total: 0 } };

  let updated = 0;
  for (const m of matches) {
    const ctx = ctxMap.get(m.fpf_fixture_id);
    if (!ctx) continue;

    const needsUpdate =
      (ctx.seriesName && m.series_name !== ctx.seriesName) ||
      (ctx.phaseName && m.phase_name !== ctx.phaseName);

    if (needsUpdate) {
      await auth.supabase
        .from('fpf_matches')
        .update({
          series_name: ctx.seriesName || m.series_name,
          phase_name: ctx.phaseName || m.phase_name,
        })
        .eq('id', m.id);
      updated++;
    }
  }

  return { success: true, data: { updated, total: matches.length } };
}

/** Scrape a batch of fixtures for a competition. Returns progress + log entries.
 *  Called repeatedly by the client until all fixtures are done (incremental).
 *  @deprecated Use discoverCompetitionFixtures + scrapeOneFixture for granular progress */
export async function scrapeCompetitionBatch(
  competitionId: number,
  fixtureOffset: number = 0,
  batchSize: number = 5,
): Promise<ActionResponse<{ progress: ScrapeProgress; log: ScrapeLogEntry[]; done: boolean }>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const log: ScrapeLogEntry[] = [];

  // Get competition record
  const { data: comp } = await auth.supabase
    .from('fpf_competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (!comp) return { success: false, error: 'Competição não encontrada' };

  // Update status to scraping
  await auth.supabase
    .from('fpf_competitions')
    .update({ scrape_status: 'scraping', scrape_error: null })
    .eq('id', competitionId);

  // Discover all fixtures (if not cached)
  const fixturesRes = await getCompetitionFixtures(comp.fpf_competition_id, comp.fpf_season_id);
  if (!fixturesRes.success || !fixturesRes.data) {
    await auth.supabase
      .from('fpf_competitions')
      .update({ scrape_status: 'error', scrape_error: fixturesRes.error ?? 'Falha ao buscar jornadas' })
      .eq('id', competitionId);
    return { success: false, error: fixturesRes.error ?? 'Falha ao buscar jornadas' };
  }

  const allFixtures = fixturesRes.data;
  const batchFixtures = allFixtures.slice(fixtureOffset, fixtureOffset + batchSize);
  const isDone = fixtureOffset + batchSize >= allFixtures.length;

  // Update total fixtures count
  await auth.supabase
    .from('fpf_competitions')
    .update({ total_fixtures: allFixtures.length })
    .eq('id', competitionId);

  log.push({ event: 'info', message: `Jornadas ${fixtureOffset + 1}-${Math.min(fixtureOffset + batchSize, allFixtures.length)} de ${allFixtures.length}` });

  // Get already-scraped matchIds to skip
  const { data: existingMatches } = await auth.supabase
    .from('fpf_matches')
    .select('fpf_match_id')
    .eq('competition_id', competitionId);

  const existingIds = new Set((existingMatches ?? []).map((m: { fpf_match_id: number }) => m.fpf_match_id));

  let newMatches = 0;
  let skipped = 0;
  let errors = 0;
  const matchDuration = comp.match_duration_minutes ?? 70;

  for (const fixture of batchFixtures) {
    const t0 = Date.now();

    // Get matches for this fixture
    const matchesRes = await getFixtureMatches(fixture.fixtureId);
    if (!matchesRes.success || !matchesRes.data) {
      log.push({ event: 'fixture_fail', message: `${fixture.name} (${fixture.phaseName} ${fixture.seriesName}) — falhou`, durationMs: Date.now() - t0 });
      errors++;
      continue;
    }

    const fixtureMatches = matchesRes.data;
    let fixtureNew = 0;
    let fixtureSkipped = 0;

    for (const fm of fixtureMatches) {
      // Skip already-scraped matches (incremental)
      if (existingIds.has(fm.matchId)) {
        fixtureSkipped++;
        skipped++;
        continue;
      }

      // Future matches: insert skeleton
      if (!fm.isPlayed) {
        const { error: futErr } = await auth.supabase
          .from('fpf_matches')
          .insert({
            competition_id: competitionId,
            fpf_match_id: fm.matchId,
            fpf_fixture_id: fixture.fixtureId,
            fixture_name: fixture.name,
            phase_name: fixture.phaseName || null,
            series_name: fixture.seriesName || null,
            home_team: fm.homeTeam,
            away_team: fm.awayTeam,
            home_score: null,
            away_score: null,
            match_date: fm.date || null,
            match_time: fm.time || null,
            venue: null,
            referee: null,
            is_forfeit: false,
            has_lineup_data: false,
          });
        if (!futErr) {
          fixtureNew++;
          existingIds.add(fm.matchId);
        }
        continue;
      }

      // Scrape the match sheet
      const parsed = await scrapeMatch(fm.matchId);
      if (!parsed) {
        log.push({ event: 'match_fail', message: `Jogo ${fm.matchId} — falhou a obter ficha` });
        errors++;
        continue;
      }

      // Fallback team names — same fix as first scraping path
      const realHome2 = parsed.homeTeam || fm.homeTeam;
      const realAway2 = parsed.awayTeam || fm.awayTeam;
      if (!parsed.homeTeam || !parsed.awayTeam) {
        const oldHome = parsed.homeTeam || '';
        const oldAway = parsed.awayTeam || '';
        for (const p of parsed.players) {
          if (p.teamName === oldHome) p.teamName = realHome2;
          else if (p.teamName === oldAway) p.teamName = realAway2;
        }
        for (const e of parsed.events) {
          if (e.teamName === oldHome) e.teamName = realHome2;
          else if (e.teamName === oldAway) e.teamName = realAway2;
        }
      }

      // Insert match
      const { data: matchRow, error: matchErr } = await auth.supabase
        .from('fpf_matches')
        .insert({
          competition_id: competitionId,
          fpf_match_id: fm.matchId,
          fpf_fixture_id: fixture.fixtureId,
          fixture_name: fixture.name,
          phase_name: fixture.phaseName || parsed.homeTeam ? fixture.phaseName : null,
          series_name: fixture.seriesName || null,
          home_team: realHome2,
          away_team: realAway2,
          home_score: parsed.homeScore ?? fm.homeScore,
          away_score: parsed.awayScore ?? fm.awayScore,
          match_date: parsed.date,
          match_time: parsed.time,
          venue: parsed.venue,
          referee: parsed.referee,
          is_forfeit: parsed.isForfeit,
          has_lineup_data: parsed.hasLineupData,
        })
        .select('id')
        .single();

      if (matchErr || !matchRow) {
        log.push({ event: 'match_fail', message: `Jogo ${fm.matchId} — erro ao guardar: ${matchErr?.message}` });
        errors++;
        continue;
      }

      const matchDbId = matchRow.id;

      // Calculate minutes for each player
      const minutesMap = calculateMinutes(parsed.players, parsed.events, matchDuration);

      // Build goal/card counts per player from events
      const playerGoals = new Map<string, number>();
      const playerPenalties = new Map<string, number>();
      const playerOwnGoals = new Map<string, number>();
      const playerYellows = new Map<string, number>();
      const playerReds = new Map<string, number>();
      const playerRedMinute = new Map<string, number>();
      const playerSubInMinute = new Map<string, number>();
      const playerSubOutMinute = new Map<string, number>();

      for (const event of parsed.events) {
        const inc = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

        switch (event.eventType) {
          case 'goal': inc(playerGoals, event.playerName); break;
          case 'penalty_goal': inc(playerPenalties, event.playerName); inc(playerGoals, event.playerName); break;
          case 'own_goal': inc(playerOwnGoals, event.playerName); break;
          case 'yellow_card': inc(playerYellows, event.playerName); break;
          case 'red_card':
            inc(playerReds, event.playerName);
            if (event.minute != null) playerRedMinute.set(event.playerName, event.minute);
            break;
          case 'substitution_in':
            if (event.minute != null) playerSubInMinute.set(event.playerName, event.minute);
            break;
          case 'substitution_out':
            if (event.minute != null) playerSubOutMinute.set(event.playerName, event.minute);
            break;
        }
      }

      // Insert match players (only those who participated: starters + subs who entered)
      if (parsed.hasLineupData) {
        const playerRows = parsed.players
          .filter((p) => p.isStarter || minutesMap.has(p.playerName) || playerSubInMinute.has(p.playerName))
          .map((p) => ({
            match_id: matchDbId,
            fpf_player_id: p.fpfPlayerId,
            player_name: p.playerName,
            shirt_number: p.shirtNumber,
            team_name: p.teamName,
            is_starter: p.isStarter,
            is_substitute: p.isSubstitute,
            subbed_in_minute: playerSubInMinute.get(p.playerName) ?? null,
            subbed_out_minute: playerSubOutMinute.get(p.playerName) ?? null,
            minutes_played: minutesMap.get(p.playerName) ?? 0,
            goals: playerGoals.get(p.playerName) ?? 0,
            penalty_goals: playerPenalties.get(p.playerName) ?? 0,
            own_goals: playerOwnGoals.get(p.playerName) ?? 0,
            yellow_cards: playerYellows.get(p.playerName) ?? 0,
            red_cards: playerReds.get(p.playerName) ?? 0,
            red_card_minute: playerRedMinute.get(p.playerName) ?? null,
          }));

        if (playerRows.length > 0) {
          await auth.supabase.from('fpf_match_players').insert(playerRows);
        }
      }

      // Insert match events (raw log)
      if (parsed.events.length > 0) {
        const eventRows = parsed.events.map((e) => ({
          match_id: matchDbId,
          event_type: e.eventType as FpfMatchEventType,
          minute: e.minute,
          player_name: e.playerName,
          fpf_player_id: e.fpfPlayerId,
          team_name: e.teamName,
          related_player_name: e.relatedPlayerName,
          related_fpf_player_id: e.relatedFpfPlayerId,
          notes: e.notes,
        }));

        await auth.supabase.from('fpf_match_events').insert(eventRows);
      }

      fixtureNew++;
      newMatches++;
      existingIds.add(fm.matchId);

      // Small delay between matches within a fixture
      await humanDelay(1500, 2500);
    }

    const elapsed = Date.now() - t0;
    log.push({
      event: 'fixture_ok',
      message: `${fixture.name} (${fixture.seriesName || fixture.phaseName}) — ${fixtureNew} novos, ${fixtureSkipped} já existentes`,
      durationMs: elapsed,
    });

    // Delay between fixtures
    await humanDelay(2000, 3500);
  }

  // Update competition stats
  const { count: totalScraped } = await auth.supabase
    .from('fpf_matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competitionId);

  const { count: totalMatchesInFixtures } = await auth.supabase
    .from('fpf_matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competitionId);

  await auth.supabase
    .from('fpf_competitions')
    .update({
      scraped_matches: totalScraped ?? 0,
      total_matches: totalMatchesInFixtures ?? 0,
      last_scraped_at: new Date().toISOString(),
      scrape_status: isDone ? 'complete' : 'scraping',
    })
    .eq('id', competitionId);

  // Auto-link existing eskout players + import new ones from FPF when scraping completes
  if (isDone) {
    const linkRes = await linkMatchPlayersToEskout(competitionId);
    if (linkRes.success && linkRes.data) {
      for (const entry of linkRes.data.log) {
        log.push({ event: 'info', message: entry.message });
      }
    }

    const importRes = await importUnlinkedPlayers(competitionId);
    if (importRes.success && importRes.data) {
      for (const entry of importRes.data.log) {
        log.push({ event: 'info', message: entry.message });
      }
    }
  }

  const progress: ScrapeProgress = {
    totalFixtures: allFixtures.length,
    doneFixtures: Math.min(fixtureOffset + batchSize, allFixtures.length),
    totalMatches: (totalScraped ?? 0) + skipped,
    scrapedMatches: totalScraped ?? 0,
    newMatches,
    skippedMatches: skipped,
    errors,
  };

  return { success: true, data: { progress, log, done: isDone } };
}

/* ───────────── List Tracked Competitions ───────────── */

/** Summary stats for a competition card — enriched from matches table */
export interface CompetitionSummary {
  competition: FpfCompetitionRow;
  seriesCount: number;
  fixtureCount: number;
  matchCount: number;
  teamsCount: number;
  playersCount: number;
  linkedPlayersCount: number;
  unlinkedPlayersCount: number;
}

/** Get all tracked competitions with summary stats (for the competition list page).
 *  Stats are denormalized on the fpf_competitions row — single SELECT, instant load.
 *  Also resets stale 'scraping' status — no server process survives a page reload. */
export async function getTrackedCompetitions(): Promise<ActionResponse<CompetitionSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  // Reset stale 'scraping' status — if we're loading the page, nothing is actively scraping
  await supabase
    .from('fpf_competitions')
    .update({ scrape_status: 'partial' })
    .eq('scrape_status', 'scraping');

  // RLS handles access (superadmin OR can_view_competitions)
  const { data, error } = await supabase
    .from('fpf_competitions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  const comps = (data ?? []) as FpfCompetitionRow[];

  // All stats come from denormalized columns — no extra queries needed
  const result: CompetitionSummary[] = comps.map((c) => ({
    competition: c,
    seriesCount: c.total_series,
    fixtureCount: c.total_fixtures,
    matchCount: c.scraped_matches,
    teamsCount: c.total_teams,
    playersCount: c.total_players,
    linkedPlayersCount: c.linked_players,
    unlinkedPlayersCount: c.unlinked_players,
  }));

  return { success: true, data: result };
}

/** Re-fetch summary stats for a single competition (after scraping/linking finishes).
 *  Reads denormalized columns — single SELECT. */
export async function getCompetitionSummary(competitionId: number): Promise<ActionResponse<CompetitionSummary>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };

  const { data: comp } = await supabase
    .from('fpf_competitions')
    .select('*')
    .eq('id', competitionId)
    .single();

  if (!comp) return { success: false, error: 'Competição não encontrada' };

  const c = comp as FpfCompetitionRow;
  return {
    success: true,
    data: {
      competition: c,
      seriesCount: c.total_series,
      fixtureCount: c.total_fixtures,
      matchCount: c.scraped_matches,
      teamsCount: c.total_teams,
      playersCount: c.total_players,
      linkedPlayersCount: c.linked_players,
      unlinkedPlayersCount: c.unlinked_players,
    },
  };
}

/** Wipe all match data for a competition (matches, players, events) so it can be re-scraped cleanly.
 *  Use when match data is corrupted (e.g. ghost duplicates from FPF classification links). */
export async function resetCompetitionMatches(
  competitionId: number,
): Promise<ActionResponse<{ deleted: number }>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  // Get all match IDs for this competition
  const { data: matches } = await auth.supabase
    .from('fpf_matches')
    .select('id')
    .eq('competition_id', competitionId);

  if (!matches?.length) return { success: true, data: { deleted: 0 } };

  const matchIds = matches.map((m) => m.id);

  // Delete in batches: events → players → matches (FK order)
  for (let i = 0; i < matchIds.length; i += 100) {
    const batch = matchIds.slice(i, i + 100);
    await auth.supabase.from('fpf_match_events').delete().in('match_id', batch);
    await auth.supabase.from('fpf_match_players').delete().in('match_id', batch);
    await auth.supabase.from('fpf_matches').delete().in('id', batch);
  }

  // Reset competition stats
  await auth.supabase
    .from('fpf_competitions')
    .update({
      scraped_matches: 0,
      total_matches: 0,
      scrape_status: 'pending',
    })
    .eq('id', competitionId);

  return { success: true, data: { deleted: matchIds.length } };
}

/** Delete a tracked competition and all its data */
export async function deleteCompetition(competitionId: number): Promise<ActionResponse<void>> {
  const auth = await requireSuperadmin();
  if (!auth) return { success: false, error: 'Acesso negado' };

  const { error } = await auth.supabase
    .from('fpf_competitions')
    .delete()
    .eq('id', competitionId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

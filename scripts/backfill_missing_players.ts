// scripts/backfill_missing_players.ts
// Backfill missing fpf_match_players for matches where subs entering late were dropped
// Re-parses each match HTML, compares with DB, inserts only missing players
// Run: npx tsx scripts/backfill_missing_players.ts
// RELEVANT FILES: src/actions/scraping/fpf-competitions/scrape-match.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { parseMatchHtml, calculateMinutes } from '../src/actions/scraping/fpf-competitions/scrape-match';
import { browserHeaders } from '../src/actions/scraping/helpers';

const FPF_BASE = 'https://resultados.fpf.pt';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function fetchMatchHtml(matchId: number): Promise<string | null> {
  try {
    const res = await fetch(`${FPF_BASE}/Match/GetMatchInformation?matchId=${matchId}`, {
      headers: browserHeaders(),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function main() {
  // 1. Get all Sub-15 competition IDs
  const { data: comps } = await supabase
    .from('fpf_competitions')
    .select('id, match_duration_minutes')
    .eq('escalao', 'Sub-15');

  if (!comps?.length) { console.log('No Sub-15 competitions found'); return; }

  const compDuration = new Map(comps.map(c => [c.id, c.match_duration_minutes]));
  const compIds = comps.map(c => c.id);

  // 2. Get all matches (paginated — Supabase default limit is 1000)
  const allMatches: { id: number; fpf_match_id: number; competition_id: number }[] = [];
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const { data } = await supabase
      .from('fpf_matches')
      .select('id, fpf_match_id, competition_id')
      .in('competition_id', compIds)
      .range(offset, offset + PAGE - 1);
    if (!data?.length) break;
    allMatches.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const matches = allMatches;

  if (!matches.length) { console.log('No matches found'); return; }
  console.log(`Total Sub-15 matches: ${matches.length}`);

  // 3. Find matches with substitutions at min >= 70 (paginated)
  const matchIds = matches.map(m => m.id);
  const allEvents: { match_id: number }[] = [];

  // Query in chunks of 500 to avoid .in() limits
  for (let i = 0; i < matchIds.length; i += 500) {
    const chunk = matchIds.slice(i, i + 500);
    let evOffset = 0;
    for (;;) {
      const { data } = await supabase
        .from('fpf_match_events')
        .select('match_id')
        .in('match_id', chunk)
        .eq('event_type', 'substitution_in')
        .gte('minute', 70)
        .range(evOffset, evOffset + PAGE - 1);
      if (!data?.length) break;
      allEvents.push(...data);
      if (data.length < PAGE) break;
      evOffset += PAGE;
    }
  }

  const affectedMatchIds = [...new Set(allEvents.map(e => e.match_id))];
  console.log(`Found ${affectedMatchIds.length} matches with late subs to check\n`);

  const matchMap = new Map(matches.map(m => [m.id, m]));

  let totalAdded = 0;
  let totalUpdated = 0;
  let matchesFixed = 0;
  let errors = 0;

  for (let i = 0; i < affectedMatchIds.length; i++) {
    const matchDbId = affectedMatchIds[i];
    const match = matchMap.get(matchDbId);
    if (!match) continue;

    const duration = compDuration.get(match.competition_id) ?? 80;

    // Fetch and parse HTML
    const html = await fetchMatchHtml(match.fpf_match_id);
    if (!html) {
      console.log(`  [${i + 1}/${affectedMatchIds.length}] Match ${match.fpf_match_id} — fetch failed`);
      errors++;
      continue;
    }

    const parsed = parseMatchHtml(html);
    if (!parsed.hasLineupData) continue;

    const minutesMap = calculateMinutes(parsed.players, parsed.events, duration);

    // Build event maps for stats
    const playerSubInMinute = new Map<string, number>();
    const playerSubOutMinute = new Map<string, number>();
    const playerGoals = new Map<string, number>();
    const playerPenalties = new Map<string, number>();
    const playerOwnGoals = new Map<string, number>();
    const playerYellows = new Map<string, number>();
    const playerReds = new Map<string, number>();
    const playerRedMinute = new Map<string, number>();

    const inc = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

    for (const event of parsed.events) {
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

    // Get existing players in DB for this match
    const { data: existingPlayers } = await supabase
      .from('fpf_match_players')
      .select('player_name, team_name')
      .eq('match_id', matchDbId);

    const existingSet = new Set(
      (existingPlayers ?? []).map(p => `${p.player_name}::${p.team_name}`)
    );

    // Find missing players — those parsed but not in DB
    const allParsedPlayers = parsed.players.filter(
      (p) => p.isStarter || minutesMap.has(p.playerName) || playerSubInMinute.has(p.playerName)
    );

    const missing = allParsedPlayers.filter(
      (p) => !existingSet.has(`${p.playerName}::${p.teamName}`)
    );

    if (missing.length === 0) continue;

    // Insert missing players
    const rows = missing.map((p) => ({
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

    const { error } = await supabase.from('fpf_match_players').insert(rows);
    if (error) {
      console.log(`  [${i + 1}/${affectedMatchIds.length}] Match ${match.fpf_match_id} — INSERT ERROR: ${error.message}`);
      errors++;
      continue;
    }

    // Also update minutes_played for existing players that may have wrong values (due to wrong match duration)
    for (const p of allParsedPlayers) {
      if (existingSet.has(`${p.playerName}::${p.teamName}`)) {
        const mins = minutesMap.get(p.playerName) ?? 0;
        const subIn = playerSubInMinute.get(p.playerName) ?? null;
        const subOut = playerSubOutMinute.get(p.playerName) ?? null;
        const goals = playerGoals.get(p.playerName) ?? 0;

        await supabase
          .from('fpf_match_players')
          .update({ minutes_played: mins, subbed_in_minute: subIn, subbed_out_minute: subOut, goals })
          .eq('match_id', matchDbId)
          .eq('player_name', p.playerName)
          .eq('team_name', p.teamName);
        totalUpdated++;
      }
    }

    totalAdded += missing.length;
    matchesFixed++;
    const names = missing.map(p => p.playerName).join(', ');
    console.log(`  [${i + 1}/${affectedMatchIds.length}] Match ${match.fpf_match_id} — added ${missing.length}: ${names}`);

    // Rate limiting — don't hammer FPF
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Done. Fixed ${matchesFixed} matches, added ${totalAdded} players, updated ${totalUpdated} existing, ${errors} errors.`);
}

main().catch(console.error);

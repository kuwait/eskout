// scripts/triage_2011_h2_fpf.ts
// Ranks FPF Sub-15 players born 2011-07-07 to 2011-12-31 (eligible for next season)
// by total minutes played in C.D. SUB-15 / I DIVISÃO. Output: ranked markdown.
// RELEVANT FILES: scripts/triage_2011_h2.ts, scripts/insert_triage_to_list.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ───────────── Env loader ───────────── */

try {
  const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/* ───────────── Config ───────────── */

const COMPETITION_ID = parseInt(process.env.COMP_ID ?? '15', 10); // default: C.D. SUB-15 / I DIVISÃO
const DOB_FROM = '2011-07-07';
const DOB_TO = '2011-12-31';
const MIN_MINUTES = parseInt(process.env.MIN_MIN ?? '0', 10);

/* ───────────── Main ───────────── */

interface PlayerRow {
  player_id: number;
  name: string;
  dob: string;
  club: string | null;
  fpf_link: string | null;
  team_name: string;
  total_minutes: number;
  games_played: number;
  starts: number;
  goals: number;
  yellow_cards: number;
  red_cards: number;
}

async function main() {
  // 1. Validate competition
  const { data: comp } = await supabase
    .from('fpf_competitions')
    .select('id, name, season, scraped_matches, total_players, linked_players')
    .eq('id', COMPETITION_ID)
    .single();
  if (!comp) throw new Error(`Competition ${COMPETITION_ID} not found`);
  console.log(`Competição: ${comp.name} (${comp.season})`);
  console.log(`Jogos: ${comp.scraped_matches} · Jogadores ligados: ${comp.linked_players}/${comp.total_players}`);

  // 2. Pull all match_players for this competition that are linked to eskout players
  //    born in the DOB window. Page through (could exceed 1000 rows).
  const matchIds: number[] = [];
  const PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from('fpf_matches')
      .select('id')
      .eq('competition_id', COMPETITION_ID)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    matchIds.push(...data.map((m) => m.id));
    if (data.length < PAGE) break;
  }
  console.log(`Match IDs: ${matchIds.length}`);

  // 3. Pull match_players in chunks of match IDs (Supabase .in() limit)
  const ID_CHUNK = 200;
  const allRows: any[] = [];
  for (let c = 0; c < matchIds.length; c += ID_CHUNK) {
    const chunk = matchIds.slice(c, c + ID_CHUNK);
    let pOff = 0;
    while (true) {
      const { data, error } = await supabase
        .from('fpf_match_players')
        .select(
          `eskout_player_id, player_name, team_name, is_starter, minutes_played, goals,
           yellow_cards, red_cards`,
        )
        .in('match_id', chunk)
        .not('eskout_player_id', 'is', null)
        .range(pOff, pOff + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      pOff += PAGE;
    }
  }
  console.log(`Match player rows (linked only): ${allRows.length}`);

  // 4. Get DOB + name + club + fpf_link for each unique eskout_player_id, filtered to DOB window.
  const uniqueIds = [...new Set(allRows.map((r) => r.eskout_player_id))];
  console.log(`Unique linked players: ${uniqueIds.length}`);

  // Fetch player metadata in batches (Supabase 1000 row limit; .in() also has size limits)
  const ID_FETCH = 500;
  const playerMeta = new Map<number, { name: string; dob: string; club: string | null; fpf_link: string | null }>();
  for (let c = 0; c < uniqueIds.length; c += ID_FETCH) {
    const ids = uniqueIds.slice(c, c + ID_FETCH);
    const { data, error } = await supabase
      .from('players')
      .select('id, name, dob, club, fpf_link')
      .in('id', ids)
      .gte('dob', DOB_FROM)
      .lte('dob', DOB_TO);
    if (error) throw error;
    for (const p of data || []) {
      playerMeta.set(p.id, {
        name: p.name,
        dob: p.dob,
        club: p.club,
        fpf_link: p.fpf_link,
      });
    }
  }
  console.log(`Players in DOB window ${DOB_FROM}..${DOB_TO}: ${playerMeta.size}`);

  // 5. Aggregate stats per eligible player
  const stats = new Map<number, PlayerRow>();
  for (const r of allRows) {
    const meta = playerMeta.get(r.eskout_player_id);
    if (!meta) continue; // not in DOB window
    let row = stats.get(r.eskout_player_id);
    if (!row) {
      row = {
        player_id: r.eskout_player_id,
        name: meta.name,
        dob: meta.dob,
        club: meta.club,
        fpf_link: meta.fpf_link,
        team_name: r.team_name,
        total_minutes: 0,
        games_played: 0,
        starts: 0,
        goals: 0,
        yellow_cards: 0,
        red_cards: 0,
      };
      stats.set(r.eskout_player_id, row);
    }
    row.total_minutes += r.minutes_played ?? 0;
    row.games_played += 1;
    if (r.is_starter) row.starts += 1;
    row.goals += r.goals ?? 0;
    row.yellow_cards += r.yellow_cards ?? 0;
    row.red_cards += r.red_cards ?? 0;
  }

  // 6. Sort by total_minutes desc, apply min threshold
  const all = [...stats.values()].sort((a, b) => b.total_minutes - a.total_minutes);
  const filtered = all.filter((p) => p.total_minutes >= MIN_MINUTES);

  console.log(`\n=== Ranking ===`);
  console.log(`Elegíveis com ≥ ${MIN_MINUTES} min: ${filtered.length} de ${all.length} totais`);

  // 7. Write markdown
  const lines: string[] = [];
  lines.push(`# Triagem FPF — ${comp.name} (${comp.season})`);
  lines.push('');
  lines.push(`Jogadores nascidos **${DOB_FROM}** a **${DOB_TO}** com ≥ **${MIN_MINUTES}** min nesta competição.`);
  lines.push(`Total: **${filtered.length}** jogadores (de ${all.length} elegíveis nesta competição).`);
  lines.push('');
  lines.push('| # | Nome | DOB | Equipa FPF | Clube (Eskout) | Min | Jogos | Tit | Golos | FPF |');
  lines.push('|---|------|-----|------------|----------------|-----|-------|-----|-------|-----|');
  filtered.forEach((p, i) => {
    const fpf = p.fpf_link ? `[link](${p.fpf_link})` : '';
    lines.push(
      `| ${i + 1} | ${p.name} | ${p.dob} | ${p.team_name} | ${p.club ?? ''} | **${p.total_minutes}** | ${p.games_played} | ${p.starts} | ${p.goals} | ${fpf} |`,
    );
  });

  // Distribution summary at the end
  lines.push('');
  lines.push('### Distribuição (todos os elegíveis)');
  lines.push('');
  const buckets: { label: string; min: number; max: number }[] = [
    { label: '≥ 1500 min (titular indiscutível)', min: 1500, max: Infinity },
    { label: '1000–1499 min (titular regular)', min: 1000, max: 1499 },
    { label: '500–999 min (rotação)', min: 500, max: 999 },
    { label: '200–499 min (sub usado)', min: 200, max: 499 },
    { label: '1–199 min (raro)', min: 1, max: 199 },
    { label: '0 min (na ficha mas nunca jogou)', min: 0, max: 0 },
  ];
  for (const b of buckets) {
    const n = all.filter((p) => p.total_minutes >= b.min && p.total_minutes <= b.max).length;
    lines.push(`- ${b.label}: **${n}**`);
  }

  const outDir = resolve(__dirname, '..', 'data');
  const outMd = resolve(outDir, `triage_2011_h2_fpf_${COMPETITION_ID}.md`);
  const outJson = resolve(outDir, `triage_2011_h2_fpf_${COMPETITION_ID}.json`);
  writeFileSync(outMd, lines.join('\n'), 'utf8');
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        competitionId: COMPETITION_ID,
        competitionName: comp.name,
        dobFrom: DOB_FROM,
        dobTo: DOB_TO,
        minMinutes: MIN_MINUTES,
        players: filtered,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Wrote ${outMd}`);
  console.log(`Wrote ${outJson}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

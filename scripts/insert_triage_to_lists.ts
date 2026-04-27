// scripts/insert_triage_to_lists.ts
// Creates 3 player_lists owned by Diogo @ Boavista from the FPF Sub-15 triage dump,
// bucketed by total minutes (A: ≥1200, B: 900-1199, C: 700-899).
// RELEVANT FILES: scripts/triage_2011_h2_fpf.ts, src/actions/player-lists.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const OWNER_USER_ID = '1abb6848-5812-4e83-8800-20c2cc12108b'; // Diogo Nunes
const CLUB_ID = 'b2a1af88-c9c7-4127-ab66-7059747e5776'; // Boavista FC

interface Bucket {
  name: string;
  min: number;
  max: number;
}

// Pick which dump and which thresholds via env vars:
//   COMP_ID=15 BUCKETS_PRESET=I_DIV          npx tsx scripts/insert_triage_to_lists.ts  (default)
//   COMP_ID=19 BUCKETS_PRESET=II_DIV_HIGH    npx tsx scripts/insert_triage_to_lists.ts
const COMP_ID = parseInt(process.env.COMP_ID ?? '15', 10);
const PRESET = (process.env.BUCKETS_PRESET ?? 'I_DIV') as keyof typeof PRESETS;

const PRESETS = {
  I_DIV: [
    { name: 'Sub-15 26/27 — A (≥1200 min FPF)', min: 1200, max: Infinity },
    { name: 'Sub-15 26/27 — B (900-1199 min FPF)', min: 900, max: 1199 },
    { name: 'Sub-15 26/27 — C (700-899 min FPF)', min: 700, max: 899 },
  ],
  II_DIV_HIGH: [
    { name: 'Sub-15 26/27 — A II Div (≥1400 min FPF)', min: 1400, max: Infinity },
    { name: 'Sub-15 26/27 — B II Div (1100-1399 min FPF)', min: 1100, max: 1399 },
    { name: 'Sub-15 26/27 — C II Div (900-1099 min FPF)', min: 900, max: 1099 },
  ],
  AVEIRO_ELITE: [
    { name: 'Sub-15 26/27 — A Aveiro Elite (≥1200 min FPF)', min: 1200, max: Infinity },
    { name: 'Sub-15 26/27 — B Aveiro Elite (900-1199 min FPF)', min: 900, max: 1199 },
    { name: 'Sub-15 26/27 — C Aveiro Elite (700-899 min FPF)', min: 700, max: 899 },
  ],
} satisfies Record<string, Bucket[]>;

const BUCKETS: Bucket[] = PRESETS[PRESET];

/* ───────────── Main ───────────── */

interface DumpPlayer {
  player_id: number;
  name: string;
  total_minutes: number;
  games_played: number;
  starts: number;
  goals: number;
  team_name: string;
}

async function main() {
  // Load dump
  const dumpPath = resolve(__dirname, '..', 'data', `triage_2011_h2_fpf_${COMP_ID}.json`);
  const dump: { players: DumpPlayer[] } = JSON.parse(readFileSync(dumpPath, 'utf8'));
  console.log(`Loaded ${dump.players.length} players from ${dumpPath}`);
  console.log(`Preset: ${PRESET}`);

  // Pre-flight: check for name collisions in this club
  const { data: existing } = await supabase
    .from('player_lists')
    .select('id, name')
    .eq('club_id', CLUB_ID)
    .in('name', BUCKETS.map((b) => b.name));
  if (existing && existing.length > 0) {
    console.error('Já existem listas com estes nomes neste clube:');
    for (const l of existing) console.error(`  - ${l.name} (id ${l.id})`);
    console.error('Apaga ou renomeia primeiro e volta a correr.');
    process.exit(1);
  }

  // Per bucket: create list, then insert items
  for (const bucket of BUCKETS) {
    const players = dump.players
      .filter((p) => p.total_minutes >= bucket.min && p.total_minutes <= bucket.max)
      .sort((a, b) => b.total_minutes - a.total_minutes);

    console.log(`\n=== ${bucket.name} ===`);
    console.log(`Jogadores: ${players.length}`);

    if (players.length === 0) {
      console.log('  (vazio — saltando)');
      continue;
    }

    // Create list
    const { data: list, error: listErr } = await supabase
      .from('player_lists')
      .insert({
        club_id: CLUB_ID,
        user_id: OWNER_USER_ID,
        name: bucket.name,
        is_system: false,
      })
      .select('id')
      .single();
    if (listErr || !list) {
      console.error(`  Erro ao criar lista: ${listErr?.message}`);
      continue;
    }
    console.log(`  Lista criada: id=${list.id}`);

    // Insert items (sort_order = ranking inside bucket; note = stats summary)
    const items = players.map((p, idx) => ({
      list_id: list.id,
      player_id: p.player_id,
      sort_order: idx,
      note: `${p.total_minutes} min · ${p.games_played} jogos (${p.starts} tit) · ${p.goals} golo${p.goals === 1 ? '' : 's'} · ${p.team_name}`,
    }));

    // Insert in chunks to be safe (though 100 should fit any limit)
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const { error: itemErr } = await supabase.from('player_list_items').insert(chunk);
      if (itemErr) {
        console.error(`  Erro ao inserir batch ${i}-${i + chunk.length}: ${itemErr.message}`);
        continue;
      }
      inserted += chunk.length;
    }
    console.log(`  Items inseridos: ${inserted}/${players.length}`);
  }

  console.log('\nFeito. Vê em /listas.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

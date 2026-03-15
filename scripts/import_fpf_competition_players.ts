// scripts/import_fpf_competition_players.ts
// Import players scraped from FPF competition match sheets into Supabase
// For clubs whose players lack FPF profiles (no DOB) — only names + club available
// RELEVANT FILES: data/beira_mar_competition_players.json, scripts/import_initial_data.ts, src/lib/constants.ts

// Usage:
//   DRY_RUN=1 CLUB_ID=<uuid> npx tsx scripts/import_fpf_competition_players.ts   # Preview only
//   CLUB_ID=<uuid> npx tsx scripts/import_fpf_competition_players.ts              # Insert into DB

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/* ───────────── Config ───────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
let CLUB_ID = process.env.CLUB_ID;
const CLUB_NAME = process.env.CLUB_NAME;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!CLUB_ID && !CLUB_NAME) {
  console.error('Missing CLUB_ID or CLUB_NAME env var.\nUsage: CLUB_NAME=Boavista DRY_RUN=1 npx tsx scripts/import_fpf_competition_players.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SEASON = '2025/2026';

/* ───────────── Types ───────────── */

interface PlayerEntry {
  name: string;
  escalao: string;
  position: string | null;
  team: string;
  source: string;
  notes?: string;
}

interface DataFile {
  club: string;
  players: PlayerEntry[];
}

interface FpfLinkEntry {
  full_name: string;
  fpf_link: string;
  playerId: number;
  notes?: string;
}

// Escalão key in fpf_links.json → escalão name in competition_players.json
const ESCALAO_KEY_MAP: Record<string, string> = {
  'sub15': 'Sub-15',
  'sub13': 'Sub-13',
  'sub12': 'Sub-12',
};

/* ───────────── Escalão → Generation Year ───────────── */

// Season 2025/2026 → end year 2026
// Sub-N → birth year = 2026 - N
const ESCALAO_TO_YEAR: Record<string, number> = {
  'Sub-15': 2011,
  'Sub-14': 2012,
  'Sub-13': 2013,
  'Sub-12': 2014,
};

/* ───────────── Main ───────────── */

async function main() {
  // Resolve club ID from name if needed
  if (!CLUB_ID && CLUB_NAME) {
    const { data } = await supabase.from('clubs').select('id').ilike('name', `%${CLUB_NAME}%`).single();
    if (!data) { console.error(`Club "${CLUB_NAME}" not found`); process.exit(1); }
    CLUB_ID = data.id;
    console.log(`🏟️  Found club: ${CLUB_NAME} → ${CLUB_ID}`);
  }

  console.log('🏟️  FPF Competition Player Import — SC Beira-Mar');
  console.log(`   Club ID: ${CLUB_ID}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE (will insert into DB)'}\n`);

  // Read data files
  const raw = readFileSync(resolve(__dirname, '../data/beira_mar_competition_players.json'), 'utf-8');
  const data: DataFile = JSON.parse(raw);
  console.log(`📋 ${data.players.length} jogadores no ficheiro (clube: ${data.club})`);

  const fpfLinksRaw = readFileSync(resolve(__dirname, '../data/beira_mar_fpf_links.json'), 'utf-8');
  const fpfLinksData = JSON.parse(fpfLinksRaw);

  // Build lookup: "name|escalao" → FpfLinkEntry
  // Special case: "Martim Ferreira" exists in both Sub-15 and Sub-13 (different players)
  const fpfLookup = new Map<string, FpfLinkEntry>();
  for (const [escalaoKey, players] of Object.entries(fpfLinksData.found as Record<string, Record<string, FpfLinkEntry | string>>)) {
    const escalaoName = ESCALAO_KEY_MAP[escalaoKey];
    if (!escalaoName) continue;
    for (const [shortName, entry] of Object.entries(players)) {
      if (typeof entry === 'string') continue; // NOT_FOUND entries
      // Strip escalão suffix from key name (e.g. "Martim Ferreira (Sub-15)" → "Martim Ferreira")
      const cleanName = shortName.replace(/\s*\(Sub-\d+\)\s*$/, '');
      fpfLookup.set(`${cleanName}|${escalaoName}`, entry);
    }
  }
  console.log(`🔗 ${fpfLookup.size} links FPF carregados\n`);

  // Fetch existing age groups
  const { data: ageGroups, error: agError } = await supabase
    .from('age_groups')
    .select('id, name, generation_year')
    .eq('club_id', CLUB_ID)
    .eq('season', SEASON);

  if (agError || !ageGroups) {
    console.error('Erro ao buscar escalões:', agError);
    process.exit(1);
  }

  const ageGroupMap = new Map<number, number>();
  for (const ag of ageGroups) {
    ageGroupMap.set(ag.generation_year, ag.id);
  }
  console.log(`📊 ${ageGroupMap.size} escalões encontrados\n`);

  // Create missing age groups
  for (const [escalao, year] of Object.entries(ESCALAO_TO_YEAR)) {
    if (!ageGroupMap.has(year)) {
      if (DRY_RUN) {
        console.log(`  [DRY] Criar escalão: ${escalao} (${year})`);
        ageGroupMap.set(year, -1); // Placeholder
      } else {
        const { data: newAg, error } = await supabase
          .from('age_groups')
          .insert({ name: escalao, generation_year: year, season: SEASON, club_id: CLUB_ID })
          .select('id')
          .single();
        if (error) {
          console.error(`  ✗ Erro ao criar escalão ${escalao}:`, error.message);
          continue;
        }
        ageGroupMap.set(year, newAg.id);
        console.log(`  ✓ Escalão criado: ${escalao} (id=${newAg.id})`);
      }
    }
  }

  // Check for existing Beira-Mar players to avoid duplicates
  const { data: existingPlayers } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('club_id', CLUB_ID)
    .ilike('club', '%Beira%Mar%');

  const existingNames = new Set(
    (existingPlayers ?? []).map((p: { name: string }) => p.name.toLowerCase().trim())
  );
  console.log(`\n🔍 ${existingNames.size} jogadores do Beira-Mar já na base de dados\n`);

  // Group by escalão for display
  const byEscalao = new Map<string, PlayerEntry[]>();
  for (const p of data.players) {
    const list = byEscalao.get(p.escalao) ?? [];
    list.push(p);
    byEscalao.set(p.escalao, list);
  }

  let created = 0;
  let skipped = 0;
  let duplicates = 0;
  let withFpfLink = 0;
  let withoutFpfLink = 0;

  for (const [escalao, players] of byEscalao) {
    const year = ESCALAO_TO_YEAR[escalao];
    const ageGroupId = year ? ageGroupMap.get(year) : null;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`${escalao} (${players.length} jogadores)`);
    console.log(`${'─'.repeat(50)}`);

    if (!ageGroupId && !DRY_RUN) {
      console.error(`  ✗ Escalão ${escalao} não encontrado — saltando`);
      skipped += players.length;
      continue;
    }

    for (const player of players) {
      const nameLower = player.name.toLowerCase().trim();

      // Check duplicate
      if (existingNames.has(nameLower)) {
        console.log(`  ⏭ ${player.name} (já existe)`);
        duplicates++;
        continue;
      }

      // Look up FPF link data
      const fpfEntry = fpfLookup.get(`${player.name}|${escalao}`);
      const displayName = fpfEntry?.full_name ?? player.name;
      const fpfLink = fpfEntry?.fpf_link ?? null;
      // fpf_player_id is TEXT in the players table
      const fpfPlayerId = fpfEntry?.playerId ? String(fpfEntry.playerId) : null;

      if (fpfEntry) withFpfLink++;
      else withoutFpfLink++;

      // Build notes
      const noteParts: string[] = [];
      noteParts.push(`Importado de FPF competição: ${player.source}`);
      if (player.team !== 'A') noteParts.push(`Equipa ${player.team}`);
      if (player.notes) noteParts.push(player.notes);
      if (!fpfEntry) noteParts.push('SEM link FPF — adicionar manualmente');
      const notes = noteParts.join('. ');

      if (DRY_RUN) {
        const pos = player.position ? ` [${player.position}]` : '';
        const fpfTag = fpfEntry ? ` 🔗` : ' ⚠️ sem FPF';
        console.log(`  [DRY] + ${displayName}${pos} (${player.team})${fpfTag}`);
        created++;
        existingNames.add(nameLower);
        continue;
      }

      const { error } = await supabase.from('players').insert({
        club_id: CLUB_ID,
        age_group_id: ageGroupId,
        name: displayName,
        dob: null,
        club: data.club,
        position_normalized: player.position,
        fpf_link: fpfLink,
        fpf_player_id: fpfPlayerId,
        department_opinion: ['Por Observar'],
        recruitment_status: null,
        notes,
        pending_approval: false,
        admin_reviewed: true,
      });

      if (error) {
        console.error(`  ✗ ${displayName}: ${error.message}`);
        skipped++;
      } else {
        const pos = player.position ? ` [${player.position}]` : '';
        const fpfTag = fpfEntry ? ' 🔗' : '';
        console.log(`  ✓ ${displayName}${pos}${fpfTag}`);
        created++;
        existingNames.add(nameLower);
      }
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 RESULTADO FINAL`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`  ✓ Criados:      ${created}`);
  console.log(`    🔗 Com FPF:   ${withFpfLink}`);
  console.log(`    ⚠️  Sem FPF:  ${withoutFpfLink}`);
  console.log(`  ⏭ Duplicados:  ${duplicates}`);
  console.log(`  ✗ Erros:       ${skipped}`);
  console.log(`  Total:         ${data.players.length}`);
  if (DRY_RUN) console.log(`\n  ⚠️  DRY RUN — nada foi inserido. Remove DRY_RUN=1 para inserir.`);
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

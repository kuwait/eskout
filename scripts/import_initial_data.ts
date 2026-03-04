// scripts/import_initial_data.ts
// One-time import script: reads data/all_players.json and inserts into Supabase
// Run with: npx tsx scripts/import_initial_data.ts
// RELEVANT FILES: data/all_players.json, supabase/migrations/001_initial_schema.sql, src/lib/types/index.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/* ───────────── Config ───────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SEASON = '2025/2026';
const BATCH_SIZE = 100;

/* ───────────── Types ───────────── */

interface PlayerJson {
  id: number;
  name: string;
  year: string;
  escalao: string;
  op: string;
  dob: string;
  club: string;
  pos: string;
  pn: string;
  foot: string;
  num: string;
  contact: string;
  ref: string;
  notes: string;
  obs: string;
  eval: string;
  dec: string;
  fpf: string;
  reports: string[];
  reportLinks: { num: number; label: string; link: string }[];
  status: string;
}

/* ───────────── Helpers ───────────── */

// Map JSON status to recruitment_status
function mapStatus(status: string): string {
  const map: Record<string, string> = {
    signed: 'confirmed',
    shortlist: 'shortlist',
    to_observe: 'to_observe',
    target: 'target',
    in_contact: 'in_contact',
    negotiating: 'negotiating',
    confirmed: 'confirmed',
    rejected: 'rejected',
  };
  return map[status] ?? 'pool';
}

// Parse dd/mm/yyyy to yyyy-mm-dd
function parseDate(dob: string): string | null {
  if (!dob) return null;
  const parts = dob.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Extract FPF player ID from URL
function extractFpfId(url: string): string | null {
  const match = url.match(/playerId\/(\d+)/);
  return match ? match[1] : null;
}

// Normalize foot values to match DB constraint (Dir, Esq, Amb, or null)
function normalizeFoot(foot: string): string | null {
  if (!foot) return null;
  const lower = foot.toLowerCase().trim();
  if (lower === 'dir' || lower === 'direito') return 'Dir';
  if (lower === 'esq' || lower === 'esq.' || lower === 'esquerdo') return 'Esq';
  if (lower === 'amb' || lower.includes('ambos') || lower.includes('ambidestro')) return 'Amb';
  // Unknown values (e.g. "Médio") → null
  return null;
}

// Determine if player is at Boavista (real squad)
function isRealSquad(club: string): boolean {
  return club?.toLowerCase().includes('boavista') ?? false;
}

/* ───────────── Main ───────────── */

async function main() {
  console.log('Reading all_players.json...');
  const raw = readFileSync(resolve(__dirname, '../data/all_players.json'), 'utf-8');
  const players: PlayerJson[] = JSON.parse(raw);
  console.log(`Loaded ${players.length} players`);

  // Fetch age group IDs
  console.log('Fetching age groups...');
  const { data: ageGroups, error: agError } = await supabase
    .from('age_groups')
    .select('id, name, generation_year')
    .eq('season', SEASON);

  if (agError || !ageGroups) {
    console.error('Failed to fetch age groups:', agError);
    process.exit(1);
  }

  const ageGroupMap = new Map<number, number>();
  for (const ag of ageGroups) {
    ageGroupMap.set(ag.generation_year, ag.id);
  }
  // Sub-19 covers 2004-2007
  const sub19 = ageGroups.find((ag) => ag.name === 'Sub-19');
  if (sub19) {
    for (const year of [2004, 2005, 2006]) {
      ageGroupMap.set(year, sub19.id);
    }
  }

  console.log(`Age groups loaded: ${ageGroupMap.size} mappings`);

  // Insert in batches
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);

    const rows = batch.map((p) => {
      const year = parseInt(p.year, 10);
      const ageGroupId = ageGroupMap.get(year);

      // Build report labels and links
      const reportLabels: (string | null)[] = [null, null, null, null, null, null];
      const reportLinkUrls: (string | null)[] = [null, null, null, null, null, null];

      if (p.reportLinks) {
        for (const rl of p.reportLinks) {
          const idx = rl.num - 1;
          if (idx >= 0 && idx < 6) {
            reportLabels[idx] = rl.label || null;
            reportLinkUrls[idx] = rl.link || null;
          }
        }
      }

      return {
        age_group_id: ageGroupId ?? null,
        name: p.name,
        dob: parseDate(p.dob),
        club: p.club || null,
        position_original: p.pos || null,
        position_normalized: p.pn || null,
        foot: normalizeFoot(p.foot),
        shirt_number: p.num || null,
        contact: p.contact || null,
        department_opinion: p.op || null,
        observer: p.obs || null,
        observer_eval: p.eval || null,
        observer_decision: p.dec || null,
        referred_by: p.ref || null,
        notes: p.notes || null,
        report_label_1: reportLabels[0],
        report_label_2: reportLabels[1],
        report_label_3: reportLabels[2],
        report_label_4: reportLabels[3],
        report_label_5: reportLabels[4],
        report_label_6: reportLabels[5],
        report_link_1: reportLinkUrls[0],
        report_link_2: reportLinkUrls[1],
        report_link_3: reportLinkUrls[2],
        report_link_4: reportLinkUrls[3],
        report_link_5: reportLinkUrls[4],
        report_link_6: reportLinkUrls[5],
        fpf_link: p.fpf || null,
        fpf_player_id: p.fpf ? extractFpfId(p.fpf) : null,
        recruitment_status: mapStatus(p.status),
        is_real_squad: isRealSquad(p.club),
      };
    });

    const { error } = await supabase.from('players').insert(rows);

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      skipped += batch.length;
    } else {
      inserted += batch.length;
    }

    // Progress
    const pct = Math.round(((i + batch.length) / players.length) * 100);
    process.stdout.write(`\r  Progress: ${pct}% (${inserted} inserted, ${skipped} skipped)`);
  }

  console.log(`\n\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

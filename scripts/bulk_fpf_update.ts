// scripts/bulk_fpf_update.ts
// Bulk FPF scrape for all players with fpf_link in a given club
// Run with: CLUB_ID=<uuid> npx tsx scripts/bulk_fpf_update.ts
// RELEVANT FILES: src/actions/scraping.ts, scripts/import_initial_data.ts

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
config({ path: '.env.local' });

/* ───────────── Config ───────────── */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Club ID: pass as env var or use CLUB_NAME to look up
let CLUB_ID = process.env.CLUB_ID;
const CLUB_NAME = process.env.CLUB_NAME;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BATCH_SIZE = 50;
const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 4000;

/* ───────────── Anti-blocking ───────────── */

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const HEADERS = {
  'User-Agent': randomUA(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

function humanDelay(): Promise<void> {
  const ms = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
  return new Promise((r) => setTimeout(r, ms));
}

/* ───────────── Helpers ───────────── */

const COUNTRY_FIXES: Record<string, string> = {
  'guine bissau': 'Guiné-Bissau', 'guine-bissau': 'Guiné-Bissau', 'guiné bissau': 'Guiné-Bissau',
  'guine equatorial': 'Guiné Equatorial', 'guine': 'Guiné', 'guiné': 'Guiné',
  'cabo verde': 'Cabo Verde', 'sao tome e principe': 'São Tomé e Príncipe',
  'são tome e principe': 'São Tomé e Príncipe', 'mocambique': 'Moçambique', 'timor leste': 'Timor-Leste',
};

function normalizeCountry(name: string | null): string | null {
  if (!name) return null;
  return COUNTRY_FIXES[name.toLowerCase().trim()] || name;
}

function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/futebol\s*clube/gi, '')
    .replace(/f\.?\s*c\.?/gi, '')
    .replace(/s\.?\s*c\.?/gi, '')
    .replace(/c\.?\s*f\.?/gi, '')
    .replace(/[.\-,'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clubsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeClubName(a);
  const nb = normalizeClubName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/* ───────────── FPF Scraper ───────────── */

async function fetchFpfData(fpfLink: string) {
  try {
    const res = await fetch(fpfLink, { headers: { ...HEADERS, 'User-Agent': randomUA() } });
    if (!res.ok) return null;

    const html = await res.text();
    const modelMatch = html.match(/var\s+model\s*=\s*(\{[\s\S]*?\});/);
    if (!modelMatch) return null;

    const model = JSON.parse(modelMatch[1]);

    // Club logo
    const clubLogoUrl = (model.CurrentClubImage as string)
      || (Array.isArray(model.Clubs) && model.Clubs.length > 0 ? (model.Clubs[0].Image as string) : null)
      || null;

    // Photo — reject placeholders
    const rawPhoto = (model.Image as string) || null;
    const photoUrl = rawPhoto && rawPhoto.startsWith('http') && !rawPhoto.includes('placeholder') ? rawPhoto : null;

    const nationality = (model.Nationality || model.Nacionalidade) as string | null;
    const birthCountry = (model.BirthCountry || model.CountryOfBirth || model.PlaceOfBirth || model.PaisNascimento || model.BirthPlace || nationality) as string | null;

    return {
      currentClub: (model.CurrentClub as string) || null,
      photoUrl,
      fullName: (model.FullName as string) || null,
      birthCountry,
      nationality,
      clubLogoUrl,
    };
  } catch {
    return null;
  }
}

/* ───────────── Main ───────────── */

async function main() {
  // Resolve club ID from name if needed
  if (!CLUB_ID && CLUB_NAME) {
    const { data } = await supabase.from('clubs').select('id').ilike('name', `%${CLUB_NAME}%`).single();
    if (!data) { console.error(`Club "${CLUB_NAME}" not found`); process.exit(1); }
    CLUB_ID = data.id;
    console.log(`Found club: ${CLUB_NAME} → ${CLUB_ID}`);
  }
  if (!CLUB_ID) {
    console.error('Usage: CLUB_NAME=Boavista npx tsx scripts/bulk_fpf_update.ts');
    process.exit(1);
  }

  console.log(`\n🔄 Bulk FPF update for club ${CLUB_ID}\n`);

  // Count total players with FPF link
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', CLUB_ID)
    .not('fpf_link', 'is', null)
    .neq('fpf_link', '');

  console.log(`📊 Total jogadores com FPF link: ${count ?? 0}\n`);

  let offset = 0;
  let updated = 0;
  let errors = 0;
  let skipped = 0;

  while (true) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, fpf_link, club, photo_url, zz_photo_url, nationality, birth_country')
      .eq('club_id', CLUB_ID)
      .not('fpf_link', 'is', null)
      .neq('fpf_link', '')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (!players || players.length === 0) break;

    for (const player of players) {
      try {
        const data = await fetchFpfData(player.fpf_link!);
        if (!data) {
          errors++;
          console.log(`  ❌ ${player.name} — FPF fetch failed`);
          await humanDelay();
          continue;
        }

        // Build update object
        const updates: Record<string, unknown> = {
          fpf_current_club: data.currentClub,
          fpf_last_checked: new Date().toISOString(),
        };

        // Auto-apply club logo
        if (data.clubLogoUrl) {
          updates.club_logo_url = data.clubLogoUrl;
        }

        // Auto-apply photo if player has none
        if (data.photoUrl && !player.photo_url && !player.zz_photo_url) {
          updates.photo_url = data.photoUrl;
        }

        // Club if changed
        if (data.currentClub && !clubsMatch(data.currentClub, player.club ?? '')) {
          updates.club = data.currentClub;
        }

        // Nationality / birth country if empty
        if (data.nationality && !player.nationality) {
          updates.nationality = normalizeCountry(data.nationality);
        }
        if (data.birthCountry && !player.birth_country) {
          updates.birth_country = normalizeCountry(data.birthCountry);
        }

        await supabase.from('players').update(updates).eq('id', player.id).eq('club_id', CLUB_ID);
        updated++;

        const changes: string[] = [];
        if (updates.club) changes.push(`clube→${updates.club}`);
        if (updates.photo_url) changes.push('foto');
        if (updates.nationality) changes.push(`nac→${updates.nationality}`);
        if (updates.birth_country) changes.push(`país→${updates.birth_country}`);
        if (updates.club_logo_url) changes.push('logo');

        if (changes.length > 0) {
          console.log(`  ✅ ${player.name} — ${changes.join(', ')}`);
        } else {
          skipped++;
          // No changes needed, just FPF cache updated
        }

        await humanDelay();
      } catch (err) {
        errors++;
        console.log(`  ❌ ${player.name} — ${err instanceof Error ? err.message : 'unknown error'}`);
        await humanDelay();
      }
    }

    offset += players.length;
    console.log(`\n📦 Batch done — ${offset}/${count ?? '?'} processados (${updated} atualizados, ${skipped} sem alteração, ${errors} erros)\n`);
  }

  console.log(`\n✅ Concluído!`);
  console.log(`   Total: ${offset}`);
  console.log(`   Atualizados: ${updated}`);
  console.log(`   Sem alteração: ${skipped}`);
  console.log(`   Erros: ${errors}\n`);
}

main().catch(console.error);

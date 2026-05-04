// scripts/auto_create_from_matches.ts
// Auto-create Eskout players from unlinked fpf_match_players
// Flow: DuckDuckGo search → ZZ profile scrape → optional FPF search → create player → link
// Run: npx tsx --env-file=.env.local scripts/auto_create_from_matches.ts
// RELEVANT FILES: src/actions/scraping/zerozero.ts, src/actions/scraping/fpf.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;
const DELAY_BETWEEN_PLAYERS = 1000; // 1s between DuckDuckGo searches
const DELAY_BETWEEN_ZZ = 1000; // 1s base — randomized to 1-3s
let consecutiveZzFailures = 0;
const MAX_CONSECUTIVE_ZZ_FAILURES = 3; // Stop if ZZ blocks us

/* ───────────── Club Name Cleaning ───────────── */

/** Clean FPF team name for search: remove "Sad", quotes, team letter suffixes */
function cleanClubName(name: string): string {
  return name
    .replace(/,?\s*Sad\b/gi, '')        // Remove "Sad" or ", Sad"
    .replace(/["'"]/g, '')               // Remove quotes
    .replace(/\s*"[A-Z]"\s*$/i, '')      // Remove team letter like "B", "C"
    .replace(/\s*\([^)]*\)\s*$/g, '')    // Remove trailing parentheses
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim();
}

/* ───────────── DuckDuckGo Search ───────────── */

async function searchDuckDuckGo(query: string): Promise<string | null> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract ALL zerozero.pt/jogador links and clean them
    const allMatches = html.matchAll(/zerozero\.pt\/jogador\/([^"&\s]*)/g);
    const seen = new Set<string>();
    for (const m of allMatches) {
      const rawPath = m[1].split('?')[0];
      // Extract base profile path: name/id (strip trailing /epocas, /competicoes, /estatisticas, etc.)
      const baseMatch = rawPath.match(/^([a-z0-9-]+\/\d+)/);
      if (baseMatch && !seen.has(baseMatch[1])) {
        seen.add(baseMatch[1]);
        return `https://www.zerozero.pt/jogador/${baseMatch[1]}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ───────────── ZeroZero Profile Scraper (lightweight) ───────────── */

interface ZzProfile {
  fullName: string | null;
  dob: string | null;
  photoUrl: string | null;
  nationality: string | null;
  currentClub: string | null;
  position: string | null;
  foot: string | null;
  height: number | null;
  weight: number | null;
}

async function scrapeZzProfile(zzUrl: string): Promise<ZzProfile | null> {
  try {
    const res = await fetch(zzUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.zerozero.pt/',
      },
    });
    if (!res.ok || res.url.includes('captcha')) return null;

    const buf = await res.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buf);

    // Check for valid page
    if (!html.includes('card-data') && !html.includes('ld+json')) return null;

    const result: ZzProfile = {
      fullName: null,
      dob: null,
      photoUrl: null,
      nationality: null,
      currentClub: null,
      position: null,
      foot: null,
      height: null,
      weight: null,
    };

    // JSON-LD — most reliable source for name, DOB, nationality
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        // ZZ sometimes has name as direct field, sometimes only in description
        // ZZ name: direct field, or from description before "::" or "é um jogador"
        let rawName = ld.name ?? (ld.description ? ld.description.split('::')[0].trim() : null);
        if (rawName && rawName.match(/ é um (ex-)?jogador/)) {
          rawName = rawName.split(/ é um (ex-)?jogador/)[0].trim();
        }
        result.fullName = rawName;
        result.dob = ld.birthDate ?? null;
        // nationality can be string or object
        result.nationality = typeof ld.nationality === 'string'
          ? ld.nationality
          : ld.nationality?.name ?? null;
        // Current club from worksFor (may be JSON string or object)
        if (ld.worksFor) {
          const wf = typeof ld.worksFor === 'string' ? ld.worksFor : JSON.stringify(ld.worksFor);
          const clubMatch = wf.match(/name:([^,}\]]+)/);
          if (clubMatch) result.currentClub = clubMatch[1].trim();
        }
      } catch { /* bad JSON */ }
    }

    // Photo — from og:image or player photo element
    const ogImage = html.match(/<meta\s+property=['"]og:image['"]\s+content=['"]([^'"]+)['"]/);
    if (ogImage && !ogImage[1].includes('default') && !ogImage[1].includes('logo')) {
      result.photoUrl = ogImage[1];
    }

    // Position — from card-data section
    const posMatch = html.match(/Posi[çc][aã]o[^<]*<\/span>\s*<span[^>]*>([^<]+)/i);
    if (posMatch) result.position = posMatch[1].trim();

    // Foot — from card-data section
    const footMatch = html.match(/P[ée]\s*preferido[^<]*<\/span>\s*<span[^>]*>([^<]+)/i);
    if (footMatch) {
      const raw = footMatch[1].trim().toLowerCase();
      if (raw.includes('direito') || raw === 'right') result.foot = 'Dir';
      else if (raw.includes('esquerdo') || raw === 'left') result.foot = 'Esq';
      else if (raw.includes('ambidestro') || raw === 'both') result.foot = 'Amb';
    }

    // Height/Weight — from card-data section
    const heightMatch = html.match(/(\d{3})\s*cm/);
    if (heightMatch) result.height = parseInt(heightMatch[1]);
    const weightMatch = html.match(/(\d{2,3})\s*kg/);
    if (weightMatch) result.weight = parseInt(weightMatch[1]);

    return result;
  } catch {
    return null;
  }
}

/* ───────────── FPF Search by Name (via fpf.pt/jogadores Competições API) ───────────── */

interface FpfSearchResult {
  url: string;
  photoUrl: string | null;
  name: string;
  club: string;
}

/** Normalize string for comparison: lowercase, remove accents, trim */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Fuzzy club match — checks if the core club name is contained in the other */
function clubsMatchFuzzy(a: string, b: string): boolean {
  const na = norm(a).replace(/[^a-z ]/g, '').replace(/\b(fc|cf|sc|cd|ad|gd|ud|ac|sad|futebol|clube|sport|sporting|associacao|desportiva|recreativa)\b/g, '').replace(/\s+/g, ' ').trim();
  const nb = norm(b).replace(/[^a-z ]/g, '').replace(/\b(fc|cf|sc|cd|ad|gd|ud|ac|sad|futebol|clube|sport|sporting|associacao|desportiva|recreativa)\b/g, '').replace(/\s+/g, ' ').trim();
  if (!na || !nb) return false;
  // Check if one contains the main word(s) of the other
  const wordsA = na.split(' ').filter(w => w.length > 2);
  const wordsB = nb.split(' ').filter(w => w.length > 2);
  const matchAB = wordsA.some(w => nb.includes(w));
  const matchBA = wordsB.some(w => na.includes(w));
  return matchAB || matchBA;
}

async function searchFpfByName(fullName: string, teamName: string): Promise<FpfSearchResult | null> {
  try {
    const res = await fetch('https://www.fpf.pt/DesktopModules/MVC/SearchPlayers/Default/GetInternalPlayers', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'ModuleId': '503',
        'TabId': '150',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json;charset=UTF-8',
        'Referer': 'https://www.fpf.pt/jogadores',
      },
      body: JSON.stringify({ filter: { PlayerName: fullName, Page: 1, PageSize: 20 } }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.Result as { Id: number; ShortDescription: string; ClubName: string; PhotoUrl: string; Url: string; FootballType: string }[];
    if (!results?.length) return null;

    // Filter to football only (not futsal)
    const footballResults = results.filter(r => r.FootballType === 'Futebol');
    if (!footballResults.length) return null;

    // Strategy 1: exact name match + club match (highest confidence)
    const normalizedSearch = norm(fullName);
    const exactMatch = footballResults.find(r =>
      norm(r.ShortDescription) === normalizedSearch && clubsMatchFuzzy(r.ClubName, teamName)
    );
    if (exactMatch) {
      const photoUrl = exactMatch.PhotoUrl?.includes('placeholder') ? null : exactMatch.PhotoUrl;
      return { url: exactMatch.Url, photoUrl, name: exactMatch.ShortDescription, club: exactMatch.ClubName };
    }

    // Strategy 2: club match + last name match (player may have slightly different full name in FPF)
    const lastName = norm(fullName.split(' ').pop() ?? '');
    const clubAndLastName = footballResults.filter(r =>
      clubsMatchFuzzy(r.ClubName, teamName) && norm(r.ShortDescription).includes(lastName)
    );
    if (clubAndLastName.length === 1) {
      const m = clubAndLastName[0];
      const photoUrl = m.PhotoUrl?.includes('placeholder') ? null : m.PhotoUrl;
      return { url: m.Url, photoUrl, name: m.ShortDescription, club: m.ClubName };
    }

    // No confident match — skip FPF (require club match always)
    return null;
  } catch {
    return null;
  }
}

/* ───────────── Age Group Detection ───────────── */

function birthYearToAgeGroup(birthYear: number): string | null {
  const now = new Date();
  const seasonEndYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const age = seasonEndYear - birthYear;
  if (age >= 4 && age <= 19) return `Sub-${age}`;
  if (age >= 20) return 'Sénior';
  return null;
}

/* ───────────── Position Normalization ───────────── */

const POS_MAP: Record<string, string> = {
  'guarda redes': 'GR', 'guarda-redes': 'GR', 'goalkeeper': 'GR',
  'defesa direito': 'DD', 'lateral direito': 'DD', 'right back': 'DD',
  'defesa esquerdo': 'DE', 'lateral esquerdo': 'DE', 'left back': 'DE',
  'defesa central': 'DC', 'defesa': 'DC', 'central': 'DC', 'centre back': 'DC',
  'médio defensivo': 'MDC', 'medio defensivo': 'MDC', 'trinco': 'MDC',
  'médio': 'MC', 'medio': 'MC', 'médio centro': 'MC', 'midfielder': 'MC',
  'médio ofensivo': 'MOC', 'medio ofensivo': 'MOC', 'meia': 'MOC',
  'extremo direito': 'ED', 'ala direito': 'ED', 'right winger': 'ED',
  'extremo esquerdo': 'EE', 'ala esquerdo': 'EE', 'left winger': 'EE',
  'avançado': 'PL', 'avancado': 'PL', 'ponta de lança': 'PL', 'striker': 'PL', 'forward': 'PL',
};

function normalizePosition(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return POS_MAP[lower] ?? null;
}

/* ───────────── Main ───────────── */

async function main() {
  // 1. Get the club ID (first available — demo mode was removed)
  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name')
    .limit(1)
    .single();

  if (!clubs) { console.log('No club found'); return; }
  const clubId = clubs.id;
  const clubName = clubs.name;
  console.log(`Club: ${clubName} (${clubId})\n`);

  // 2. Build escalão map: match_id → competition escalão
  console.log('1. Building competition escalão map...');
  const matchEscalao = new Map<number, string>();
  let mOffset = 0;
  for (;;) {
    const { data } = await supabase
      .from('fpf_matches')
      .select('id, competition_id, fpf_competitions(escalao)')
      .range(mOffset, mOffset + PAGE - 1);
    if (!data?.length) break;
    for (const m of data) {
      const esc = (m.fpf_competitions as unknown as { escalao: string } | null)?.escalao;
      if (esc) matchEscalao.set(m.id, esc);
    }
    if (data.length < PAGE) break;
    mOffset += PAGE;
  }
  console.log(`   ${matchEscalao.size} matches with escalão mapped`);

  // 3. Get all unlinked fpf_match_players
  console.log('2. Fetching unlinked match players...');
  const allUnlinked: { id: number; match_id: number; fpf_player_id: number | null; player_name: string; team_name: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data } = await supabase
      .from('fpf_match_players')
      .select('id, match_id, fpf_player_id, player_name, team_name')
      .is('eskout_player_id', null)
      .range(offset, offset + PAGE - 1);
    if (!data?.length) break;
    allUnlinked.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Deduplicate by player_name + team_name (same player appears in multiple matches)
  // Keep the one with a match_id so we can resolve escalão
  const seen = new Map<string, typeof allUnlinked[0]>();
  for (const row of allUnlinked) {
    const key = `${row.player_name}::${row.team_name}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  const uniqueUnlinked = Array.from(seen.values());
  console.log(`   ${allUnlinked.length} total unlinked, ${uniqueUnlinked.length} unique player+team combos\n`);

  // 3. Filter to only Sub-15 competitions (or configurable)
  // For now, process all — but limit to a batch
  const BATCH_SIZE = parseInt(process.argv[2] ?? '20', 10);
  const batch = uniqueUnlinked.slice(0, BATCH_SIZE);
  console.log(`2. Processing batch of ${batch.length} players...\n`);

  let created = 0;
  let linked = 0;
  const skipped = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const player = batch[i];
    const prefix = `[${i + 1}/${batch.length}]`;

    // Step 1: Search DuckDuckGo (include escalão to filter by age group)
    const cleanClub = cleanClubName(player.team_name);
    const escalao = matchEscalao.get(player.match_id) ?? '';
    const query = `${player.player_name} ${cleanClub} ${escalao} zerozero.pt`;
    const zzUrl = await searchDuckDuckGo(query);

    if (!zzUrl) {
      console.log(`${prefix} ${player.player_name} (${player.team_name}) — no ZZ result`);
      failed++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    // Randomize delay (1-3s)
    await sleep(DELAY_BETWEEN_ZZ + Math.random() * 2000);

    // Step 2: Scrape ZZ profile
    const profile = await scrapeZzProfile(zzUrl);

    if (!profile || !profile.fullName || !profile.dob) {
      console.log(`${prefix} ${player.player_name} (${player.team_name}) — ZZ scrape failed or missing data (url: ${zzUrl})`);
      failed++;
      consecutiveZzFailures++;
      if (consecutiveZzFailures >= MAX_CONSECUTIVE_ZZ_FAILURES) {
        console.log(`\n⚠️  ${MAX_CONSECUTIVE_ZZ_FAILURES} consecutive ZZ failures — likely blocked. Stopping to avoid IP ban.`);
        break;
      }
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }
    consecutiveZzFailures = 0; // Reset on success

    // Step 2b: Search FPF by full name (via fpf.pt Competições API)
    await sleep(DELAY_BETWEEN_PLAYERS + Math.random() * 2000);
    const fpfResult = await searchFpfByName(profile.fullName, player.team_name);
    if (fpfResult) {
      console.log(`${prefix}   → FPF: ${fpfResult.name} (${fpfResult.club}) ${fpfResult.url}`);
    }

    // Step 2c: Validate age — reject if DOB is clearly wrong for youth football
    const dobYear = new Date(profile.dob).getFullYear();
    const now = new Date();
    const age = now.getFullYear() - dobYear;
    if (age < 8 || age > 22) {
      console.log(`${prefix} ${player.player_name} (${player.team_name}) — wrong ZZ player? Age ${age} (DOB ${profile.dob}), skipping`);
      failed++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    // Step 2d: Validate the ZZ name still contains the original last name (sanity check)
    const origLastName = norm(player.player_name.split(' ').pop() ?? '');
    const zzNormName = norm(profile.fullName);
    if (origLastName.length >= 3 && !zzNormName.includes(origLastName)) {
      console.log(`${prefix} ${player.player_name} (${player.team_name}) — ZZ name mismatch: "${profile.fullName}" doesn't contain "${origLastName}", skipping`);
      failed++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    // Step 2e: Check ZZ club vs match club — block if mismatch (wrong player from DuckDuckGo)
    if (profile.currentClub) {
      const zzClubMatch = clubsMatchFuzzy(profile.currentClub, player.team_name);
      if (!zzClubMatch) {
        // TODO: could check ZZ team history for past clubs, but for now skip
        console.log(`${prefix} ${player.player_name} (${player.team_name}) — ZZ club mismatch: "${profile.currentClub}", skipping`);
        failed++;
        await sleep(DELAY_BETWEEN_PLAYERS);
        continue;
      }
    }

    // Step 3: Check if player already exists in Eskout (by name + DOB)
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('club_id', clubId)
      .ilike('name', profile.fullName)
      .eq('dob', profile.dob)
      .maybeSingle();

    if (existing) {
      // Player exists — link the match players
      await supabase
        .from('fpf_match_players')
        .update({ eskout_player_id: existing.id })
        .eq('player_name', player.player_name)
        .eq('team_name', player.team_name)
        .is('eskout_player_id', null);

      // Check if FPF link is missing — if so, search and update
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('fpf_link')
        .eq('id', existing.id)
        .single();

      if (!existingPlayer?.fpf_link && profile.fullName) {
        await sleep(DELAY_BETWEEN_PLAYERS + Math.random() * 2000);
        const fpfResult = await searchFpfByName(profile.fullName, player.team_name);
        if (fpfResult) {
          await supabase
            .from('players')
            .update({
              fpf_link: fpfResult.url,
              fpf_last_checked: new Date().toISOString(),
              ...(fpfResult.photoUrl ? { photo_url: fpfResult.photoUrl } : {}),
            })
            .eq('id', existing.id);
          console.log(`${prefix} ${player.player_name} → exists (id ${existing.id}), linked + FPF added ✓FPF`);
        } else {
          console.log(`${prefix} ${player.player_name} → exists (id ${existing.id}), linked (no FPF found)`);
        }
      } else {
        console.log(`${prefix} ${player.player_name} → exists (id ${existing.id}), linked${existingPlayer?.fpf_link ? ' ✓FPF' : ''}`);
      }
      linked++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    // Step 4: Determine age group
    const birthYear = new Date(profile.dob).getFullYear();
    const ageGroupName = birthYearToAgeGroup(birthYear);
    if (!ageGroupName) {
      console.log(`${prefix} ${player.player_name} — invalid birth year ${birthYear}`);
      failed++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    // Find or create age group
    let { data: ageGroup } = await supabase
      .from('age_groups')
      .select('id')
      .eq('club_id', clubId)
      .eq('name', ageGroupName)
      .maybeSingle();

    if (!ageGroup) {
      const now = new Date();
      const season = now.getMonth() >= 6
        ? `${now.getFullYear()}/${now.getFullYear() + 1}`
        : `${now.getFullYear() - 1}/${now.getFullYear()}`;
      const { data: newAg } = await supabase
        .from('age_groups')
        .insert({ club_id: clubId, name: ageGroupName, generation_year: birthYear, season })
        .select('id')
        .single();
      ageGroup = newAg;
    }

    if (!ageGroup) {
      console.log(`${prefix} ${player.player_name} — failed to create age group`);
      failed++;
      continue;
    }

    // Step 5: Create player — use FPF photo if available (better quality)
    const pos = normalizePosition(profile.position);
    const fpfLink = fpfResult?.url ?? null;
    const fpfPhotoUrl = fpfResult?.photoUrl ?? null;
    const { data: newPlayer, error: insertError } = await supabase
      .from('players')
      .insert({
        club_id: clubId,
        age_group_id: ageGroup.id,
        name: profile.fullName,
        dob: profile.dob,
        club: player.team_name,
        position_normalized: pos,
        foot: profile.foot,
        height: profile.height,
        weight: profile.weight,
        nationality: profile.nationality,
        fpf_link: fpfLink,
        fpf_last_checked: fpfLink ? new Date().toISOString() : null,
        zerozero_link: zzUrl,
        zz_photo_url: profile.photoUrl,
        photo_url: fpfPhotoUrl ?? profile.photoUrl,
        zz_current_club: player.team_name,
        zz_last_checked: new Date().toISOString(),
        department_opinion: ['Por Observar'],
        recruitment_status: null,
        admin_reviewed: true,
        pending_approval: false,
      })
      .select('id')
      .single();

    if (insertError || !newPlayer) {
      console.log(`${prefix} ${player.player_name} — insert failed: ${insertError?.message}`);
      failed++;
      await sleep(DELAY_BETWEEN_PLAYERS);
      continue;
    }

    created++;

    // Step 6: Link ALL match player records with same name + team
    const { error: linkError } = await supabase
      .from('fpf_match_players')
      .update({ eskout_player_id: newPlayer.id })
      .eq('player_name', player.player_name)
      .eq('team_name', player.team_name)
      .is('eskout_player_id', null);

    if (!linkError) {
      linked++;
      const fpfTag = fpfLink ? ' ✓FPF' : '';
      console.log(`${prefix} ${player.player_name} (${player.team_name}) → CREATED id ${newPlayer.id} + linked | ${profile.fullName} | ${profile.dob} | ${pos ?? '?'}${fpfTag}`);
    } else {
      console.log(`${prefix} ${player.player_name} → created but link failed: ${linkError.message}`);
    }

    // Also try auto-link by fpf_player_id (photo Person ID)
    if (player.fpf_player_id) {
      await supabase
        .from('fpf_match_players')
        .update({ eskout_player_id: newPlayer.id })
        .eq('fpf_player_id', player.fpf_player_id)
        .is('eskout_player_id', null);
    }

    await sleep(DELAY_BETWEEN_PLAYERS);
  }

  console.log(`\n✅ Done. Created ${created}, linked ${linked}, skipped ${skipped}, failed ${failed}.`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(console.error);

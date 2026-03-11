// src/actions/scraping/zz-finder.ts
// ZeroZero link finder — multi-strategy autocomplete search to match players by name, age, club, DOB
// Uses progressively shorter name variants and DOB verification for accurate matching
// RELEVANT FILES: src/actions/scraping/helpers.ts, src/actions/scraping/zerozero.ts, src/actions/scraping/unified.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveClub } from '@/lib/supabase/club-context';
import { type ZzSearchCandidate } from '@/lib/zerozero/helpers';
import { browserHeaders, humanDelay, clubsMatch, calcAgeFromDob } from './helpers';
import { fetchZeroZeroData } from './zerozero';


/* ───────────── Name utilities ───────────── */

/** Remove diacritics from a string for fuzzy comparison */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Count how many name parts overlap between two names (case/diacritic insensitive) */
function countNameOverlap(a: string, b: string): number {
  const partsA = removeDiacritics(a).toLowerCase().split(/\s+/);
  const partsB = removeDiacritics(b).toLowerCase().split(/\s+/);
  return partsA.filter((p) => partsB.includes(p)).length;
}

/** Extract first + last name from a full name string */
function firstLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Extract first + second name + last name (e.g. "Afonso Maciel Monteiro" from "Afonso Maciel Valentin Monteiro") */
function firstSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`;
}

/** Extract first name + second-to-last name (e.g. "Afonso Valentin" from "Afonso Maciel Valentin Monteiro") */
function firstAndSecondLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 3) return null;
  return `${parts[0]} ${parts[parts.length - 2]}`;
}

/* ───────────── Autocomplete Search ───────────── */

/** Parse ZeroZero autocomplete search results HTML into structured candidates */
function parseZzAutocompleteResults(html: string): ZzSearchCandidate[] {
  const candidates: ZzSearchCandidate[] = [];

  // Each result: <a href="/jogador/slug/ID?search=1" ...>...<span>Jogadores | Posição | XX anos | Clube</span>...</a>
  const linkRegex = /href="(\/jogador\/[^"?]+)[^"]*"[\s\S]*?<span>([^<]*)<\/span>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const info = match[2];

    // Parse info: "Jogadores | Médio | 12 anos | Sporting [Jun.C S15 C]"
    const parts = info.split('|').map((p) => p.trim());
    // Skip non-player results
    if (!parts[0]?.includes('Jogador')) continue;

    const ageMatch = info.match(/(\d+)\s*anos/);
    const age = ageMatch ? parseInt(ageMatch[1], 10) : null;

    // Club is usually the last part, remove age group brackets
    const clubPart = parts.length >= 4 ? parts[3] : null;
    const club = clubPart ? clubPart.replace(/\s*\[.*\]/, '').trim() : null;

    const position = parts.length >= 2 ? parts[1] : null;

    // Name from the text div — search WITHIN the matched <a> block (after href, before </a>)
    const nameMatch = match[0].match(/class="text">([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : '';

    candidates.push({ url: `https://www.zerozero.pt${url}`, name, age, club, position });
  }

  return candidates;
}

/** Fetch ZeroZero autocomplete results */
async function searchZzAutocomplete(query: string): Promise<ZzSearchCandidate[]> {
  const res = await fetch(
    `https://www.zerozero.pt/jqc_search_search.php?queryString=${encodeURIComponent(query)}`,
    {
      headers: browserHeaders({
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.zerozero.pt/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      }),
      next: { revalidate: 0 },
    },
  );
  // Detect blocked: non-200, redirect to captcha, or empty response
  if (!res.ok || res.url.includes('recaptcha') || res.url.includes('captcha')) {
    console.warn(`[ZZ] Autocomplete bloqueado: status=${res.status} url=${res.url}`);
    throw new Error('ZZ_BLOCKED');
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) {
    console.warn('[ZZ] Autocomplete: resposta vazia');
    throw new Error('ZZ_BLOCKED');
  }
  // ZZ autocomplete responds in UTF-8 (unlike player pages which are ISO-8859-1)
  const html = new TextDecoder('utf-8').decode(buf);
  // Only treat as blocked if there are NO search results AND captcha is present
  // (ZZ may include recaptcha scripts on valid autocomplete responses)
  const hasResults = html.includes('/jogador/') || html.includes('searchresults');
  if (!hasResults && (html.includes('recaptcha') || html.includes('g-recaptcha'))) {
    console.warn(`[ZZ] Autocomplete captcha (sem resultados): size=${buf.byteLength}`);
    throw new Error('ZZ_BLOCKED');
  }
  return parseZzAutocompleteResults(html);
}

/* ───────────── Multi-Strategy Search ───────────── */

/**
 * Multi-strategy ZeroZero search using autocomplete with progressively shorter name variants.
 * The autocomplete endpoint works best with 1-3 word queries. Longer names often return empty.
 * Strategy: name+club variants first (most precise), then name-only variants as fallback.
 * Collects all candidates from all variants, then picks the best match by score.
 */
export async function searchZzMultiStrategy(
  fullName: string,
  club: string | null,
  expectedAge: number,
  dob: string,
): Promise<ZzSearchCandidate | null> {
  // Build list of unique name variants to try (most specific → least specific)
  // ZZ autocomplete works best with 2-3 word queries; 4+ words usually returns nothing
  const nameVariants: string[] = [];
  const seen = new Set<string>();
  const addVariant = (v: string | null) => { if (v && !seen.has(v)) { seen.add(v); nameVariants.push(v); } };

  const parts = fullName.trim().split(/\s+/);
  // 3-word names: try as-is first (ideal for autocomplete)
  if (parts.length <= 3) addVariant(fullName);
  // First + second name + last (e.g. "Afonso Maciel Monteiro" — most precise 3-word variant)
  addVariant(firstSecondLastName(fullName));
  // First + last (e.g. "Afonso Monteiro")
  const shortName = firstLastName(fullName);
  addVariant(shortName);
  // First + second-to-last (e.g. "Afonso Valentin")
  addVariant(firstAndSecondLastName(fullName));
  // Last name alone — catches players known by surname
  if (parts.length >= 3) addVariant(parts[parts.length - 1]);

  // ZZ autocomplete searches player names only — adding club to the query returns 0 results
  const variants = nameVariants;

  // Collect ALL candidates from ALL variants, then pick the best overall
  const allCandidates: ZzSearchCandidate[] = [];
  const seenUrls = new Set<string>();

  console.log(`[ZZ Search] "${fullName}" club="${club}" age=${expectedAge} dob=${dob} variants=${JSON.stringify(variants)}`);

  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await humanDelay(2000, 4000);

    const candidates = await searchZzAutocomplete(variants[i]);
    console.log(`[ZZ Search] variant "${variants[i]}" → ${candidates.length} results: ${candidates.map((c) => `${c.name}(${c.age},${c.club})`).join(', ')}`);
    for (const c of candidates) {
      if (!seenUrls.has(c.url)) {
        seenUrls.add(c.url);
        allCandidates.push(c);
      }
    }

    // Early exit: skip remaining variants if we have a high-confidence candidate
    // Club match OR exact age + strong name overlap (≥2 parts in common) — DOB verification is the real safety net
    const earlyMatch = shortlistCandidates(allCandidates, expectedAge, club, fullName);
    if (earlyMatch.length > 0) {
      const best = earlyMatch[0];
      const hasClubMatch = best.club && club && clubsMatch(best.club, club);
      const hasStrongName = countNameOverlap(best.name, fullName) >= 2 && best.age === expectedAge;
      if (hasClubMatch || hasStrongName) {
        console.log(`[ZZ Search] Early exit: found ${best.name} (age=${best.age}, club=${best.club}) clubMatch=${!!hasClubMatch} nameOverlap=${countNameOverlap(best.name, fullName)}`);
        break;
      }
    }
  }

  // Pre-filter: keep only candidates with matching age (exact or ±1 for birthday boundary)
  const shortlisted = shortlistCandidates(allCandidates, expectedAge, club, fullName);
  console.log(`[ZZ Search] ${allCandidates.length} total candidates → ${shortlisted.length} shortlisted`);
  if (shortlisted.length === 0) return null;

  // Verify the best candidate by scraping their ZZ profile page to check exact DOB
  // This eliminates false positives (same age but different person)
  let bestUnverified: ZzSearchCandidate | null = null;
  for (const candidate of shortlisted) {
    await humanDelay(1500, 3000);
    const zzData = await fetchZeroZeroData(candidate.url).catch(() => null);
    console.log(`[ZZ Search] DOB check: ${candidate.name} (${candidate.url}) → zz_dob=${zzData?.dob} expected=${dob} match=${zzData?.dob === dob}`);

    if (zzData?.dob) {
      // DOB must match exactly — this is the definitive check
      if (zzData.dob === dob) return candidate;
      // DOB exists but doesn't match — skip (wrong person)
      continue;
    }

    // Profile page blocked/empty — track best unverified candidate for fallback
    // Only accept if high confidence: exact age + club match + name overlap
    if (!bestUnverified && candidate.age === expectedAge && candidate.club && club && clubsMatch(candidate.club, club)) {
      bestUnverified = candidate;
    }
  }

  // Fallback: if all profile pages were blocked but we have a high-confidence candidate,
  // return it — the user still has to confirm in the RefreshPlayerButton dialog
  if (bestUnverified) {
    console.log(`[ZZ Search] DOB unverifiable (page blocked), accepting high-confidence match: ${bestUnverified.name} (${bestUnverified.club})`);
    return bestUnverified;
  }

  console.log(`[ZZ Search] No DOB match found for "${fullName}"`);
  return null;
}

/**
 * Pre-filter and rank autocomplete candidates before DOB verification.
 * Returns candidates sorted by likelihood (age match + name overlap + club match).
 * Only candidates with plausible age (exact or ±1) pass.
 */
function shortlistCandidates(
  candidates: ZzSearchCandidate[],
  expectedAge: number,
  expectedClub: string | null,
  fullName: string,
): ZzSearchCandidate[] {
  if (candidates.length === 0) return [];

  const normFull = removeDiacritics(fullName).toLowerCase();
  const fullParts = normFull.split(/\s+/);

  const scored = candidates
    .filter((c) => {
      // Must have age within ±1 year (birthday boundary tolerance)
      if (c.age === null) return false;
      return Math.abs(c.age - expectedAge) <= 1;
    })
    .map((c) => {
      let score = 0;

      // Exact age match is preferred over off-by-1
      if (c.age === expectedAge) score += 3;

      // Club match — strong signal
      if (c.club && expectedClub && clubsMatch(c.club, expectedClub)) score += 5;

      // Name similarity — count overlapping name parts
      const normCandidate = removeDiacritics(c.name).toLowerCase();
      const candidateParts = normCandidate.split(/\s+/);
      const commonParts = candidateParts.filter((p) => fullParts.includes(p));
      score += commonParts.length * 2;

      return { candidate: c, score };
    });

  // Sort by score descending — best candidates verified first
  scored.sort((a, b) => b.score - a.score);

  // Return top candidates (limit to 3 to avoid excessive scraping)
  return scored.slice(0, 3).map((s) => s.candidate);
}

/* ───────────── Server Actions ───────────── */

export interface ZzLinkFinderResult {
  success: boolean;
  found: number;
  skipped: number;
  errors: number;
  total: number;
}

/** Find ZeroZero links for players that have FPF data but no ZeroZero link */
export async function findZeroZeroLinks(ageGroupId?: number): Promise<ZzLinkFinderResult> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  // Get players with FPF data + name + DOB but no ZeroZero link
  let query = supabase
    .from('players')
    .select('id, name, dob, club, fpf_link, zerozero_link')
    .eq('club_id', clubId)
    .is('zerozero_link', null)
    .not('dob', 'is', null)
    .not('name', 'is', null)
    .order('id');

  if (ageGroupId) query = query.eq('age_group_id', ageGroupId);

  const { data: players, error } = await query;
  if (error || !players) return { success: false, found: 0, skipped: 0, errors: 0, total: 0 };

  // Also include players with empty string zerozero_link
  const filtered = players.filter((p) => !p.zerozero_link && p.dob && p.name);

  let found = 0;
  let skipped = 0;
  let errors = 0;

  for (const player of filtered) {
    // Rate limit — 2-4s between requests (multi-strategy has its own internal delays)
    if (found + skipped + errors > 0) {
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const expectedAge = calcAgeFromDob(player.dob!);
      const bestMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob!);

      if (bestMatch) {
        // Extract ZeroZero player ID from URL: /jogador/slug/ID
        const idMatch = bestMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
        const zzPlayerId = idMatch ? idMatch[1] : '';

        await supabase.from('players').update({
          zerozero_link: bestMatch.url,
          zerozero_player_id: zzPlayerId,
        }).eq('id', player.id).eq('club_id', clubId);

        found++;
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  return { success: true, found, skipped, errors, total: filtered.length };
}

/** Find ZeroZero link for a single player by ID */
export async function findZeroZeroLinkForPlayer(playerId: number): Promise<{ success: boolean; url: string | null; error?: string }> {
  const { clubId } = await getActiveClub();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, name, dob, club')
    .eq('id', playerId)
    .eq('club_id', clubId)
    .single();

  if (!player) return { success: false, url: null, error: 'Jogador não encontrado' };
  if (!player.dob) return { success: false, url: null, error: 'Data de nascimento necessária' };
  if (!player.name) return { success: false, url: null, error: 'Nome necessário' };

  try {
    const expectedAge = calcAgeFromDob(player.dob);
    const bestMatch = await searchZzMultiStrategy(player.name, player.club, expectedAge, player.dob);

    if (!bestMatch) return { success: true, url: null, error: 'Nenhum resultado corresponde' };

    // Save to DB
    const idMatch = bestMatch.url.match(/\/jogador\/[^/]+\/(\d+)/);
    const zzPlayerId = idMatch ? idMatch[1] : '';

    await supabase.from('players').update({
      zerozero_link: bestMatch.url,
      zerozero_player_id: zzPlayerId,
    }).eq('id', player.id).eq('club_id', clubId);

    revalidatePath(`/jogadores/${playerId}`);

    return { success: true, url: bestMatch.url };
  } catch {
    return { success: false, url: null, error: 'Erro ao pesquisar no ZeroZero' };
  }
}

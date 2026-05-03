// scripts/resolve_unlinked_dubias.ts
// Resolve unlinked fpf_match_players for ONE competition: DDG → ZZ → eskout DOB lookup → link/create
// Verbose 1-line-per-case output, resumable, JSONL audit log
// Run: npx tsx --env-file=.env.local scripts/resolve_unlinked_dubias.ts --competition-id=26 [--limit=100] [--dry-run]
// RELEVANT FILES: scripts/auto_create_from_matches.ts, src/actions/scraping/fpf-competitions/link-players.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/* ───────────── CLI args ───────────── */

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}
const COMPETITION_ID = parseInt(getArg('competition-id') ?? '0', 10);
const LIMIT = parseInt(getArg('limit') ?? '99999', 10);
const DRY_RUN = process.argv.includes('--dry-run');
if (!COMPETITION_ID) { console.error('Missing --competition-id=N'); process.exit(1); }

/* ───────────── Constants ───────────── */

const DDG_DELAY_MIN = 1500;
const DDG_DELAY_MAX = 3500;
const ZZ_DELAY_MIN = 1500;
const ZZ_DELAY_MAX = 3500;
const FPF_DELAY_MIN = 1000;
const FPF_DELAY_MAX = 2500;
const MAX_CONSECUTIVE_ZZ_FAILURES = 6;

const LOG_PATH = path.join(process.cwd(), `tmp_resolve_${COMPETITION_ID}.jsonl`);

/* ───────────── Helpers (lifted from auto_create_from_matches.ts) ───────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => sleep(min + Math.random() * (max - min));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function cleanClubName(name: string): string {
  return name
    .replace(/,?\s*Sad\b/gi, '')
    .replace(/["'"]/g, '')
    .replace(/\s*"[A-Z]"\s*$/i, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clubsMatchFuzzy(a: string, b: string): boolean {
  const stop = /\b(fc|cf|sc|cd|ad|gd|ud|ac|sad|futebol|clube|sport|sporting|associacao|desportiva|recreativa)\b/g;
  const na = norm(a).replace(/[^a-z ]/g, '').replace(stop, '').replace(/\s+/g, ' ').trim();
  const nb = norm(b).replace(/[^a-z ]/g, '').replace(stop, '').replace(/\s+/g, ' ').trim();
  if (!na || !nb) return false;
  const wA = na.split(' ').filter((w) => w.length > 2);
  const wB = nb.split(' ').filter((w) => w.length > 2);
  return wA.some((w) => nb.includes(w)) || wB.some((w) => na.includes(w));
}

function birthYearToAgeGroup(year: number): string | null {
  const now = new Date();
  const seasonEnd = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const age = seasonEnd - year;
  if (age >= 4 && age <= 19) return `Sub-${age}`;
  if (age >= 20) return 'Sénior';
  return null;
}

const POS_MAP: Record<string, string> = {
  'guarda redes': 'GR', 'guarda-redes': 'GR', 'goalkeeper': 'GR',
  'defesa direito': 'DD', 'lateral direito': 'DD',
  'defesa esquerdo': 'DE', 'lateral esquerdo': 'DE',
  'defesa central': 'DC', 'defesa': 'DC', 'central': 'DC',
  'médio defensivo': 'MDC', 'medio defensivo': 'MDC', 'trinco': 'MDC',
  'médio': 'MC', 'medio': 'MC', 'médio centro': 'MC',
  'médio ofensivo': 'MOC', 'medio ofensivo': 'MOC', 'meia': 'MOC',
  'extremo direito': 'ED', 'ala direito': 'ED',
  'extremo esquerdo': 'EE', 'ala esquerdo': 'EE',
  'avançado': 'PL', 'avancado': 'PL', 'ponta de lança': 'PL', 'striker': 'PL',
};
function normalizePosition(raw: string | null): string | null {
  if (!raw) return null;
  return POS_MAP[raw.toLowerCase().trim()] ?? null;
}

/* ───────────── DDG search (returns up to 3 ZZ candidates) ───────────── */

async function searchDdg(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const seen = new Set<string>();
    const out: string[] = [];
    // Both encoded (uddg redirect) and plain
    for (const m of html.matchAll(/zerozero\.pt(?:%2F|\/)jogador(?:%2F|\/)([^"&\s<]+)/g)) {
      let raw = m[1];
      // decode %2F → /
      raw = raw.replace(/%2F/g, '/').split('?')[0];
      const base = raw.match(/^([a-z0-9-]+\/\d+)/);
      if (base && !seen.has(base[1])) {
        seen.add(base[1]);
        out.push(`https://www.zerozero.pt/jogador/${base[1]}`);
        if (out.length >= 3) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function searchDdgWithFallback(name: string, club: string, escalao: string): Promise<string[]> {
  const cleanClub = cleanClubName(club);
  // 1. Full name + club + escalao
  let r = await searchDdg(`${name} ${cleanClub} ${escalao} zerozero.pt`);
  if (r.length) return r;
  await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
  // 2. Full name + club (no escalao)
  r = await searchDdg(`${name} ${cleanClub} zerozero.pt`);
  if (r.length) return r;
  // 3. First + last + club
  const parts = name.trim().split(/\s+/);
  if (parts.length > 2) {
    await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
    r = await searchDdg(`${parts[0]} ${parts[parts.length - 1]} ${cleanClub} zerozero.pt`);
    if (r.length) return r;
  }
  // 4. Full name only + zerozero.pt
  await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
  return searchDdg(`${name} zerozero.pt`);
}

/* ───────────── ZZ profile scraper (lightweight, no deps) ───────────── */

interface ZzProfile {
  fullName: string | null;
  dob: string | null;
  photoUrl: string | null;
  nationality: string | null;
  currentClub: string | null;
  /** All clubs found in the page (career + nav links to /equipa/) — used for history fuzzy-match */
  allClubs: string[];
  position: string | null;
  foot: string | null;
  height: number | null;
  weight: number | null;
  url: string;
}

async function scrapeZzProfile(url: string): Promise<ZzProfile | 'BLOCKED' | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.zerozero.pt/',
      },
    });
    if (!res.ok) return null;
    if (res.url.includes('captcha') || res.url.includes('recaptcha')) return 'BLOCKED';

    const buf = await res.arrayBuffer();
    if (buf.byteLength < 5000) return 'BLOCKED';
    const html = new TextDecoder('iso-8859-1').decode(buf);
    if (html.includes('g-recaptcha') && !html.includes('jogador-')) return 'BLOCKED';

    const result: ZzProfile = {
      fullName: null, dob: null, photoUrl: null, nationality: null,
      currentClub: null, allClubs: [], position: null, foot: null, height: null, weight: null, url,
    };

    // Extract all club names from /equipa/ links (career history + side nav)
    const seenClubs = new Set<string>();
    for (const m of html.matchAll(/\/equipa\/[^"]+">([^<]+)</g)) {
      const c = m[1].trim();
      if (c.length > 2 && c.length < 60) seenClubs.add(c);
    }
    result.allClubs = Array.from(seenClubs);

    // Primary: meta description "X é um jogador de Futebol de N anos nascido em YYYY-MM-DD..."
    const desc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/);
    if (desc) {
      const text = desc[1];
      const dobM = text.match(/nascido em (\d{4}-\d{2}-\d{2})/);
      if (dobM) result.dob = dobM[1];
      // Position from description ("Joga como Defesa em ...")
      const posM = text.match(/Joga como ([^,.]+?) em /i);
      if (posM) result.position = posM[1].trim();
    }

    // Title: "Martim Vieira :: 2025/2026 - Alpendorada - ..."
    const title = html.match(/<title>([^<]+)<\/title>/);
    if (title) {
      const m = title[1].match(/^([^:]+?)(?:\s*::|\s*-)/);
      if (m) result.fullName = m[1].trim();
      // Current club is between " - " markers in title
      const clubM = title[1].match(/\s-\s([^-]+?)\s-\s/);
      if (clubM) result.currentClub = clubM[1].trim();
    }

    // JSON-LD fallback
    if (!result.dob || !result.fullName) {
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (ld) {
        try {
          const obj = JSON.parse(ld[1]);
          if (!result.dob && obj.birthDate) result.dob = obj.birthDate;
          if (!result.fullName && obj.name) result.fullName = String(obj.name).split('::')[0].trim();
          if (!result.nationality && obj.nationality) {
            result.nationality = typeof obj.nationality === 'string' ? obj.nationality : (obj.nationality?.name ?? null);
          }
        } catch { /* ignore */ }
      }
    }

    // og:image (photo)
    const og = html.match(/<meta\s+property=['"]og:image['"]\s+content=['"]([^'"]+)['"]/);
    if (og && !og[1].includes('default') && !og[1].includes('logo')) result.photoUrl = og[1];

    // Position from card-data block (more accurate than description)
    const posCard = html.match(/Posi[çc][aã]o[^<]*<\/span>\s*<span[^>]*>([^<]+)/i);
    if (posCard) result.position = posCard[1].trim();

    const footM = html.match(/P[ée]\s*preferido[^<]*<\/span>\s*<span[^>]*>([^<]+)/i);
    if (footM) {
      const raw = footM[1].trim().toLowerCase();
      if (raw.includes('direito')) result.foot = 'Dir';
      else if (raw.includes('esquerdo')) result.foot = 'Esq';
      else if (raw.includes('ambidestro')) result.foot = 'Amb';
    }

    const hM = html.match(/(\d{3})\s*cm/);
    if (hM) result.height = parseInt(hM[1], 10);
    const wM = html.match(/(\d{2,3})\s*kg/);
    if (wM) result.weight = parseInt(wM[1], 10);

    return result;
  } catch {
    return null;
  }
}

/* ───────────── FPF search (bonus: photo + fpf_link for new players) ───────────── */

async function searchFpfByName(fullName: string, teamName: string): Promise<{ url: string; photoUrl: string | null; name: string; club: string } | null> {
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
    const list = (data.Result ?? []) as { Id: number; ShortDescription: string; ClubName: string; PhotoUrl: string; Url: string; FootballType: string }[];
    const fb = list.filter((r) => r.FootballType === 'Futebol');
    if (!fb.length) return null;

    const ns = norm(fullName);
    const exact = fb.find((r) => norm(r.ShortDescription) === ns && clubsMatchFuzzy(r.ClubName, teamName));
    if (exact) return { url: exact.Url, photoUrl: exact.PhotoUrl?.includes('placeholder') ? null : exact.PhotoUrl, name: exact.ShortDescription, club: exact.ClubName };

    const lastName = norm(fullName.split(' ').pop() ?? '');
    const cAndL = fb.filter((r) => clubsMatchFuzzy(r.ClubName, teamName) && norm(r.ShortDescription).includes(lastName));
    if (cAndL.length === 1) {
      const m = cAndL[0];
      return { url: m.Url, photoUrl: m.PhotoUrl?.includes('placeholder') ? null : m.PhotoUrl, name: m.ShortDescription, club: m.ClubName };
    }
    return null;
  } catch {
    return null;
  }
}

/* ───────────── Decision logic ───────────── */

interface MatchPlayerCombo {
  player_name: string;
  team_name: string;
  fpf_player_id: number | null;
  match_id: number;
}

interface EskoutCandidate {
  id: number;
  name: string;
  dob: string;
  club: string | null;
  fpf_player_id: number | null;
  fpf_link: string | null;
}

/** Score how well a candidate eskout name matches the FPF name. Higher = better. */
function nameMatchScore(fpfName: string, eskName: string): number {
  const a = norm(fpfName).split(/\s+/);
  const b = norm(eskName).split(/\s+/);
  const overlap = a.filter((p) => p.length >= 3 && b.includes(p)).length;
  return overlap;
}

type Decision =
  | { kind: 'link'; eskoutId: number; reason: string }
  | { kind: 'create'; reason: string }
  | { kind: 'review'; reason: string }
  | { kind: 'skip'; reason: string };

async function decide(combo: MatchPlayerCombo, zz: ZzProfile, clubId: string): Promise<Decision> {
  if (!zz.dob || !zz.fullName) return { kind: 'skip', reason: 'no-zz-dob' };

  // Sanity: birth year plausible for youth football (2003-2014 covers Sub-12 to Sub-22)
  const year = parseInt(zz.dob.slice(0, 4), 10);
  if (year < 2003 || year > 2014) return { kind: 'skip', reason: `dob-out-of-range(${year})` };

  // FPF name must overlap with ZZ name (sanity — DDG can return wrong person)
  if (nameMatchScore(combo.player_name, zz.fullName) === 0) {
    return { kind: 'skip', reason: 'name-no-overlap' };
  }

  // STRICT: ZZ club must fuzzy-match FPF team_name (current OR history).
  // This is the safety net against DDG returning a homonymous player from a different club.
  // Audit on the first 13 creates showed 15% wrong WITHOUT this check.
  const teamMatchesCurrent = zz.currentClub ? clubsMatchFuzzy(zz.currentClub, combo.team_name) : false;
  const teamInHistory = zz.allClubs.some((c) => clubsMatchFuzzy(c, combo.team_name));
  if (!teamMatchesCurrent && !teamInHistory) {
    return { kind: 'skip', reason: `zz-club-mismatch(current=${zz.currentClub ?? 'null'},history=${zz.allClubs.length})` };
  }

  // Lookup eskout by exact DOB
  const { data: candidates, error } = await supabase
    .from('players')
    .select('id, name, dob, club, fpf_player_id, fpf_link')
    .eq('club_id', clubId)
    .eq('dob', zz.dob);
  if (error) return { kind: 'skip', reason: `db-error:${error.message}` };

  const list = (candidates ?? []) as EskoutCandidate[];
  if (list.length === 0) return { kind: 'create', reason: 'no-eskout-with-this-dob' };

  // Score each candidate by name overlap (case+diacritic insensitive, words ≥3 chars)
  const scored = list.map((c) => ({ c, score: nameMatchScore(combo.player_name, c.name) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  // Strong match requires ≥2 word overlap (both first AND last name in common, or two
  // distinctive name parts). Single-word overlap is too weak — common given names collide.
  if (top.score < 2) {
    return { kind: 'create', reason: `weak-overlap(top=${top.score},pool=${list.length})` };
  }

  // ≥2 overlap. Unique top → confident link.
  const tied = scored.filter((s) => s.score === top.score);
  if (tied.length === 1) {
    return { kind: 'link', eskoutId: top.c.id, reason: `dob+name(${top.score}overlap)` };
  }

  // Multiple eskout candidates share both DOB AND ≥2 name parts — extremely rare. Try club tiebreaker.
  const withClub = tied.filter((s) => s.c.club && clubsMatchFuzzy(s.c.club, combo.team_name));
  if (withClub.length === 1) return { kind: 'link', eskoutId: withClub[0].c.id, reason: `dob+name+club-tiebreak` };

  return { kind: 'review', reason: `tie(${tied.length},score=${top.score})` };
}

/* ───────────── DB helpers ───────────── */

async function getAllMatchIds(competitionId: number): Promise<number[]> {
  const out: number[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase
      .from('fpf_matches')
      .select('id')
      .eq('competition_id', competitionId)
      .order('id')
      .range(off, off + 999);
    if (error) { console.error(error); break; }
    if (!data?.length) break;
    out.push(...data.map((m) => m.id));
    if (data.length < 1000) break;
  }
  return out;
}

async function fetchUnlinked(matchIds: number[]): Promise<MatchPlayerCombo[]> {
  const all: MatchPlayerCombo[] = [];
  for (let i = 0; i < matchIds.length; i += 300) {
    const chunk = matchIds.slice(i, i + 300);
    let off = 0;
    for (;;) {
      const { data } = await supabase
        .from('fpf_match_players')
        .select('player_name, team_name, fpf_player_id, match_id')
        .is('eskout_player_id', null)
        .in('match_id', chunk)
        .order('id')
        .range(off, off + 999);
      if (!data?.length) break;
      all.push(...(data as MatchPlayerCombo[]));
      if (data.length < 1000) break;
      off += 1000;
    }
  }
  // Dedup by (player_name, team_name) — keep first
  const seen = new Map<string, MatchPlayerCombo>();
  for (const r of all) {
    const k = `${r.player_name}::${r.team_name}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  return Array.from(seen.values());
}

async function linkAll(combo: MatchPlayerCombo, eskoutId: number): Promise<number> {
  if (DRY_RUN) return 0;
  const { count } = await supabase
    .from('fpf_match_players')
    .update({ eskout_player_id: eskoutId }, { count: 'exact' })
    .eq('player_name', combo.player_name)
    .eq('team_name', combo.team_name)
    .is('eskout_player_id', null);
  return count ?? 0;
}

async function ensureAgeGroup(clubId: string, name: string, year: number): Promise<number | null> {
  const { data: existing } = await supabase
    .from('age_groups')
    .select('id')
    .eq('club_id', clubId)
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id;
  if (DRY_RUN) return -1;
  const now = new Date();
  const season = now.getMonth() >= 6
    ? `${now.getFullYear()}/${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}/${now.getFullYear()}`;
  const { data } = await supabase
    .from('age_groups')
    .insert({ club_id: clubId, name, generation_year: year, season })
    .select('id').single();
  return data?.id ?? null;
}

async function createPlayer(combo: MatchPlayerCombo, zz: ZzProfile, fpf: Awaited<ReturnType<typeof searchFpfByName>>, clubId: string): Promise<{ id: number; created: boolean } | null> {
  // Idempotent guard: if a previous run created this player but crashed before linking,
  // the same (zz.fullName, zz.dob) tuple resurfaces here. Reuse it instead of duplicating.
  if (zz.fullName && zz.dob) {
    const { data: existing } = await supabase
      .from('players').select('id').eq('club_id', clubId).eq('dob', zz.dob).ilike('name', zz.fullName).maybeSingle();
    if (existing) return { id: existing.id, created: false };
  }
  if (DRY_RUN) return { id: -1, created: true };
  const year = parseInt(zz.dob!.slice(0, 4), 10);
  const ageName = birthYearToAgeGroup(year);
  if (!ageName) return null;
  const ageId = await ensureAgeGroup(clubId, ageName, year);
  if (!ageId || ageId === -1) return null;

  const pos = normalizePosition(zz.position);
  const fpfPhoto = fpf?.photoUrl ?? null;
  const { data: newP, error } = await supabase
    .from('players')
    .insert({
      club_id: clubId,
      age_group_id: ageId,
      name: zz.fullName,
      dob: zz.dob,
      club: combo.team_name,
      position_normalized: pos,
      foot: zz.foot,
      height: zz.height,
      weight: zz.weight,
      nationality: zz.nationality,
      fpf_link: fpf?.url ?? null,
      fpf_last_checked: fpf?.url ? new Date().toISOString() : null,
      zerozero_link: zz.url,
      zz_photo_url: zz.photoUrl,
      photo_url: fpfPhoto ?? zz.photoUrl,
      zz_current_club: combo.team_name,
      zz_last_checked: new Date().toISOString(),
      department_opinion: ['Por Observar'],
      recruitment_status: null,
      admin_reviewed: true,
      pending_approval: false,
    })
    .select('id').single();
  if (error) { console.error('insert error:', error.message); return null; }
  return newP ? { id: newP.id, created: true } : null;
}

/* ───────────── Main ───────────── */

interface LogEntry {
  ts: string;
  combo: MatchPlayerCombo;
  decision: 'link' | 'create' | 'review' | 'skip';
  reason: string;
  zzUrl?: string | null;
  zzDob?: string | null;
  zzName?: string | null;
  eskoutId?: number | null;
  linkedRows?: number;
}

function appendLog(e: LogEntry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify(e) + '\n');
}

async function main() {
  const { data: clubs } = await supabase.from('clubs').select('id, name').eq('is_demo', false).limit(1).single();
  if (!clubs) { console.error('No club'); return; }
  const clubId = clubs.id as string;

  const { data: comp } = await supabase
    .from('fpf_competitions').select('id, name, escalao').eq('id', COMPETITION_ID).single();
  if (!comp) { console.error('No competition'); return; }
  console.log(`Club: ${clubs.name} | Comp: ${comp.name} (${comp.escalao})`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}\nLog: ${LOG_PATH}\n`);

  const matchIds = await getAllMatchIds(COMPETITION_ID);
  console.log(`Matches: ${matchIds.length}`);

  const combos = await fetchUnlinked(matchIds);
  console.log(`Unique unlinked combos: ${combos.length}\n`);

  const batch = combos.slice(0, LIMIT);
  console.log(`Processing first ${batch.length}...\n`);

  // ZZ profile cache (URL → result) — same player appears under many combos? unlikely after dedup but cheap
  const zzCache = new Map<string, ZzProfile | 'BLOCKED' | null>();

  let linked = 0, created = 0, review = 0, skipped = 0;
  let consecutiveZzFailures = 0;

  for (let i = 0; i < batch.length; i++) {
    const combo = batch[i];
    const prefix = `[${i + 1}/${batch.length}]`;
    const log: LogEntry = { ts: new Date().toISOString(), combo, decision: 'skip', reason: '', zzUrl: null, zzDob: null, zzName: null };

    // 1. DDG search (try with + without escalao)
    const urls = await searchDdgWithFallback(combo.player_name, combo.team_name, comp.escalao);
    if (urls.length === 0) {
      log.decision = 'skip'; log.reason = 'ddg-no-result';
      console.log(`${prefix} ✗ skip ddg-no-result | ${combo.player_name} | ${combo.team_name}`);
      skipped++; appendLog(log);
      await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
      continue;
    }

    // 2. Try each URL until one resolves to a usable profile + sensible decision
    let resolved = false;
    for (const url of urls) {
      await randomDelay(ZZ_DELAY_MIN, ZZ_DELAY_MAX);
      let zz = zzCache.get(url);
      if (zz === undefined) {
        zz = await scrapeZzProfile(url);
        zzCache.set(url, zz);
      }
      if (zz === 'BLOCKED') {
        consecutiveZzFailures++;
        log.decision = 'skip'; log.reason = 'zz-blocked'; log.zzUrl = url;
        console.log(`${prefix} ✗ skip zz-blocked | ${combo.player_name} | ${url}`);
        skipped++; appendLog(log);
        if (consecutiveZzFailures >= MAX_CONSECUTIVE_ZZ_FAILURES) {
          console.log(`\n⚠️  ${MAX_CONSECUTIVE_ZZ_FAILURES} consecutive ZZ failures — stopping to avoid IP ban.`);
          return;
        }
        resolved = true; break;
      }
      if (!zz) continue; // try next URL
      consecutiveZzFailures = 0;

      const decision = await decide(combo, zz, clubId);
      log.zzUrl = url; log.zzDob = zz.dob; log.zzName = zz.fullName;
      log.decision = decision.kind; log.reason = decision.reason;

      if (decision.kind === 'skip') {
        // Try next URL — maybe DDG returned wrong player first
        continue;
      }

      if (decision.kind === 'link') {
        const linkedRows = await linkAll(combo, decision.eskoutId);
        log.eskoutId = decision.eskoutId; log.linkedRows = linkedRows;
        console.log(`${prefix} ✓ link  → eskout #${decision.eskoutId} (${linkedRows} rows) | ${combo.player_name} → ${zz.fullName} ${zz.dob} | ${decision.reason}`);
        linked++;
      } else if (decision.kind === 'create') {
        await randomDelay(FPF_DELAY_MIN, FPF_DELAY_MAX);
        const fpf = await searchFpfByName(zz.fullName!, combo.team_name);
        const result = await createPlayer(combo, zz, fpf, clubId);
        if (result) {
          const linkedRows = await linkAll(combo, result.id);
          log.eskoutId = result.id; log.linkedRows = linkedRows;
          if (result.created) {
            console.log(`${prefix} + create → eskout #${result.id} (${linkedRows} linked) | ${zz.fullName} ${zz.dob} | ${combo.team_name}${fpf ? ' ✓FPF' : ''}`);
            created++;
          } else {
            // Already existed (idempotent re-link from a previous crashed run, or weak-overlap miss)
            log.decision = 'link'; log.reason = `idempotent-by-zz-name+dob`;
            console.log(`${prefix} ✓ link  → eskout #${result.id} (${linkedRows} rows) | idempotent ${zz.fullName} ${zz.dob}`);
            linked++;
          }
        } else {
          log.decision = 'skip'; log.reason = 'create-failed';
          console.log(`${prefix} ✗ skip create-failed | ${combo.player_name}`);
          skipped++;
        }
      } else if (decision.kind === 'review') {
        console.log(`${prefix} ? review ${decision.reason} | ${combo.player_name} → ${zz.fullName} ${zz.dob}`);
        review++;
      }
      appendLog(log);
      resolved = true;
      break;
    }

    if (!resolved) {
      log.decision = 'skip'; log.reason = 'all-urls-rejected';
      console.log(`${prefix} ✗ skip all-urls-rejected | ${combo.player_name}`);
      skipped++; appendLog(log);
    }

    await randomDelay(DDG_DELAY_MIN, DDG_DELAY_MAX);
  }

  console.log(`\n──────────── Summary ────────────`);
  console.log(`✓ linked:  ${linked}`);
  console.log(`+ created: ${created}`);
  console.log(`? review:  ${review}`);
  console.log(`✗ skipped: ${skipped}`);
  console.log(`Log: ${LOG_PATH}`);
}

main().catch(console.error);

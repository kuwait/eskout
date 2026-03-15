// src/actions/scraping/fpf-competitions/scrape-match.ts
// Parse a single FPF match sheet HTML into structured data (lineups, events, player appearances)
// Extracts: starting XI, subs, substitutions with minute, goals, cards, player IDs
// RELEVANT FILES: src/actions/scraping/fpf-competitions/browse.ts, src/actions/scraping/helpers.ts

import { browserHeaders, decodeHtmlEntities } from '../helpers';
import { FPF_RESULTS_BASE } from '@/lib/constants';
import type { FpfMatchEventType } from '@/lib/types';

/* ───────────── Retry Helper ───────────── */

async function withRetry<T>(
  fn: () => Promise<T | null>,
  retries = 3,
  baseDelay = 3000,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await fn();
    if (result !== null) return result;
    if (attempt < retries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

/* ───────────── Parsed Types ───────────── */

export interface ParsedPlayer {
  fpfPlayerId: number | null;
  playerName: string;
  shirtNumber: number | null;
  teamName: string;
  isStarter: boolean;
  isSubstitute: boolean;
}

export interface ParsedEvent {
  eventType: FpfMatchEventType;
  minute: number | null;
  playerName: string;
  fpfPlayerId: number | null;
  teamName: string;
  relatedPlayerName: string | null;
  relatedFpfPlayerId: number | null;
  notes: string | null;
}

export interface ParsedMatch {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  referee: string | null;
  isForfeit: boolean;
  hasLineupData: boolean;
  players: ParsedPlayer[];
  events: ParsedEvent[];
}

/* ───────────── HTML Fetcher ───────────── */

async function fetchMatchHtml(matchId: number): Promise<string | null> {
  const url = `${FPF_RESULTS_BASE}/Match/GetMatchInformation?matchId=${matchId}`;
  try {
    const res = await fetch(url, {
      headers: browserHeaders(),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/* ───────────── Parser ───────────── */

/** Scrape and parse a single match sheet from resultados.fpf.pt */
export async function scrapeMatch(matchId: number): Promise<ParsedMatch | null> {
  const html = await withRetry(() => fetchMatchHtml(matchId));
  if (!html) return null;

  return parseMatchHtml(html);
}

/** Parse match HTML into structured data. Exported for testing. */
export function parseMatchHtml(html: string): ParsedMatch {
  const result: ParsedMatch = {
    homeTeam: '',
    awayTeam: '',
    homeScore: null,
    awayScore: null,
    date: null,
    time: null,
    venue: null,
    referee: null,
    isForfeit: false,
    hasLineupData: false,
    players: [],
    events: [],
  };

  // ── Team names + score ──
  // Score pattern: "X - Y" between team names
  const scoreMatch = html.match(/(\d+)\s*-\s*(\d+)/);
  if (scoreMatch) {
    result.homeScore = parseInt(scoreMatch[1], 10);
    result.awayScore = parseInt(scoreMatch[2], 10);
  }

  // Team names — extract from team header elements, decode HTML entities
  const teamNames = extractTeamNames(html);
  result.homeTeam = decodeHtmlEntities(teamNames[0] ?? '');
  result.awayTeam = decodeHtmlEntities(teamNames[1] ?? '');

  // ── Metadata ──
  // FPF format: "Data: 14-09-2025 Hora: 11:00" or just "14-09-2025 11:00"
  const dateMatch = html.match(/(\d{2}-\d{2}-\d{4})\s+(?:Hora:\s*)?(\d{2}:\d{2})/);
  if (dateMatch) {
    // Convert dd-MM-yyyy to yyyy-MM-dd
    const parts = dateMatch[1].split('-');
    result.date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    result.time = dateMatch[2];
  }

  // Venue — look for stadium/field name
  const venueMatch = html.match(/(?:Estádio|Campo|Complexo|Pavilhão|Recinto)[^<]*/i);
  if (venueMatch) result.venue = decodeHtmlEntities(venueMatch[0].trim());

  // Referee
  const refMatch = html.match(/(?:Árbitro|Arbitro)[^:]*:\s*([^<]+)/i);
  if (refMatch) result.referee = decodeHtmlEntities(refMatch[1].trim());

  // Forfeit detection
  if (html.includes('W.O.') || html.includes('Walkover') || html.includes('forfeit')) {
    result.isForfeit = true;
  }

  // ── Lineups ──
  const { starters, substitutes } = extractLineups(html, result.homeTeam, result.awayTeam);
  result.players = [...starters, ...substitutes];
  result.hasLineupData = starters.length > 0;

  // ── Events (goals, cards, substitutions) ──
  result.events = extractEvents(html, result.homeTeam, result.awayTeam);

  return result;
}

/* ───────────── Team Name Extraction ───────────── */

function extractTeamNames(html: string): [string, string] {
  // Team names appear in the game-resume header section of FPF match sheets.
  // Multiple patterns tried from most reliable to least:

  // Pattern 0 (primary): game-resume section — <strong>Home</strong> <strong>Score</strong> <strong>Away</strong>
  const gameResume = html.match(/game-resume[\s\S]{0,1500}/i);
  if (gameResume) {
    const strongs = gameResume[0].match(/<strong>\s*([^<]+?)\s*<\/strong>/g);
    if (strongs && strongs.length >= 3) {
      const texts = strongs.map((s) => s.replace(/<\/?strong>/g, '').trim());
      // Filter out the score (e.g. "5 - 0") — keep only team names
      const nonScore = texts.filter((t) => !/^\d+\s*-\s*\d+$/.test(t) && t.length > 1);
      if (nonScore.length >= 2) return [nonScore[0], nonScore[1]];
    }
  }

  // Pattern 1: OG meta title — "Home vs Away — date | Resultados FPF"
  const ogTitle = html.match(/<meta\s+property=['"]og:title['"]\s+content=['"]([^'"]+)['"]/i);
  if (ogTitle) {
    const vsMatch = ogTitle[1].match(/^(.+?)\s+vs\s+(.+?)\s+[—–-]/);
    if (vsMatch) return [vsMatch[1].trim(), vsMatch[2].trim()];
  }

  // Pattern 2: Club logo alt attributes — <img src='/Club/Logo/XXX' alt="Team Name" />
  const logoAlts = html.match(/<img\s+src=['"][/]Club[/]Logo[/]\d+['"]\s+alt=["']([^"']+)["']/gi);
  if (logoAlts && logoAlts.length >= 2) {
    const names = logoAlts.map((m) => {
      const alt = m.match(/alt=["']([^"']+)["']/i);
      return alt ? alt[1].trim() : '';
    }).filter((n) => n.length > 1);
    if (names.length >= 2) return [names[0], names[1]];
  }

  // Pattern 3: team name divs with distinct CSS classes
  const teamDivs = html.match(/class="[^"]*team-name[^"]*"[^>]*>([^<]+)/gi);
  if (teamDivs && teamDivs.length >= 2) {
    const names = teamDivs.map((d) => d.replace(/.*>/, '').trim());
    return [names[0], names[1]];
  }

  return ['', ''];
}

/* ───────────── Staff Filter ───────────── */

/** FPF match sheets include staff (coaches, physios, nurses, etc.) alongside players.
 *  They have Player/Logo IDs but are NOT actual players. Filter by role name. */
const STAFF_ROLES = new Set([
  'treinador principal', 'treinador adjunto', 'treinador',
  'fisioterapeuta', 'enfermeiro', 'massagista',
  'delegado', 'diretor', 'médico', 'medico',
  'outra', 'outro', 'preparador físico', 'preparador fisico',
  'treinador de guarda-redes', 'treinador de gr',
  'coordenador', 'analista',
]);

function isStaffName(name: string): boolean {
  return STAFF_ROLES.has(name.toLowerCase().trim());
}

/* ───────────── Lineup Extraction ───────────── */

interface LineupResult {
  starters: ParsedPlayer[];
  substitutes: ParsedPlayer[];
}

function extractLineups(html: string, homeTeam: string, awayTeam: string): LineupResult {
  const starters: ParsedPlayer[] = [];
  const substitutes: ParsedPlayer[] = [];

  // The FPF HTML has clear sections with title-bar headers and lineup-team divs:
  //   title-bar "Equipas Iniciais" → lineup-team home-team → lineup-team away-team
  //   title-bar "Suplentes"        → lineup-team home-team → lineup-team away-team
  //   title-bar "Treinadores"      → staff (skip)
  //   title-bar "Dirigentes"       → staff (skip)
  // We split by title-bar sections and parse only "Equipas Iniciais" and "Suplentes".

  const sections = splitByTitleBar(html);

  for (const section of sections) {
    const lowerName = section.name.toLowerCase();

    // Skip staff sections
    if (!lowerName.includes('equipa') && !lowerName.includes('inicial') && !lowerName.includes('suplente')) {
      continue;
    }

    const isStarter = lowerName.includes('inicial') || lowerName.includes('equipa');
    const isSub = lowerName.includes('suplente');
    if (!isStarter && !isSub) continue;

    // Extract home and away team blocks from this section
    const homeBlock = extractTeamBlock(section.content, 'home-team');
    const awayBlock = extractTeamBlock(section.content, 'away-team');

    // Parse players from each team block
    for (const entry of extractPlayerEntries(homeBlock)) {
      if (isStaffName(entry.name)) continue;
      const player: ParsedPlayer = {
        fpfPlayerId: entry.fpfPlayerId,
        playerName: entry.name,
        shirtNumber: entry.shirtNumber,
        teamName: homeTeam,
        isStarter: isStarter,
        isSubstitute: isSub,
      };
      if (isSub) substitutes.push(player);
      else starters.push(player);
    }

    for (const entry of extractPlayerEntries(awayBlock)) {
      if (isStaffName(entry.name)) continue;
      const player: ParsedPlayer = {
        fpfPlayerId: entry.fpfPlayerId,
        playerName: entry.name,
        shirtNumber: entry.shirtNumber,
        teamName: awayTeam,
        isStarter: isStarter,
        isSubstitute: isSub,
      };
      if (isSub) substitutes.push(player);
      else starters.push(player);
    }
  }

  return { starters, substitutes };
}

/** Split HTML into named sections by title-bar headers */
function splitByTitleBar(html: string): { name: string; content: string }[] {
  const sections: { name: string; content: string }[] = [];
  const titleBarRegex = /<div class="title-bar">\s*<div[^>]*>\s*([^<]+)/g;
  const positions: { name: string; start: number }[] = [];

  let match;
  while ((match = titleBarRegex.exec(html)) !== null) {
    positions.push({ name: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : html.length;
    sections.push({ name: positions[i].name, content: html.slice(start, end) });
  }

  return sections;
}

/** Extract the HTML content of a specific team block (home-team or away-team) */
function extractTeamBlock(sectionHtml: string, teamClass: string): string {
  // Find the lineup-team div with the given class
  const regex = new RegExp(`lineup-team\\s+${teamClass}[^>]*>([\\s\\S]*?)(?=<div class="lineup-team|$)`, 'i');
  const match = regex.exec(sectionHtml);
  return match ? match[0] : '';
}

interface RawPlayerEntry {
  fpfPlayerId: number | null;
  name: string;
  shirtNumber: number | null;
}

function extractPlayerEntries(html: string): RawPlayerEntry[] {
  const entries: RawPlayerEntry[] = [];

  // FPF match sheets use <div class="player"> for each player entry.
  // Each contains: optional /Player/Logo/XXXXX (or default-avatar.png), <strong>number</strong> Name
  // We match by the player div pattern, NOT by /Player/Logo/ — some players have no FPF photo.
  const playerDivRegex = /class="player\s[^"]*"[\s\S]*?<\/div>\s*<strong>(\d{1,3})<\/strong>\s*([^<]+)/g;
  let match;

  while ((match = playerDivRegex.exec(html)) !== null) {
    const shirtNumber = parseInt(match[1], 10);
    // Strip position suffix like "(GR)" from name — it's not part of the player's name
    const name = decodeHtmlEntities(match[2].trim()).replace(/\s*\(GR\)\s*$/i, '').trim();
    if (!name) continue;

    // Extract FPF player ID from /Player/Logo/XXXXX if present in this player div
    const divContent = match[0];
    const logoMatch = divContent.match(/\/Player\/Logo\/(\d+)/);
    const fpfPlayerId = logoMatch ? parseInt(logoMatch[1], 10) : null;

    entries.push({
      fpfPlayerId,
      name,
      shirtNumber: shirtNumber <= 99 ? shirtNumber : null,
    });
  }

  return entries;
}

/* ───────────── Event Extraction ───────────── */

function extractEvents(html: string, homeTeam: string, awayTeam: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  // FPF match sheets have two data sources for events:
  // 1. "info-goals" section: simple list of goals per team (home=text-right, away=text-left)
  // 2. Timeline: <div class="timeline-item"> with icon images and minute/player data
  // 3. Lineup section: cards appear as icon-yellowcard/icon-redcard spans on player photos

  extractGoals(html, homeTeam, awayTeam, events);
  extractSubstitutions(html, events);
  extractCards(html, homeTeam, awayTeam, events);

  // Sort by minute
  events.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  return events;
}

function extractGoals(html: string, homeTeam: string, awayTeam: string, events: ParsedEvent[]) {
  // Goals from the "info-goals" section — most reliable source.
  // Structure: <div class="row info-goals">
  //   <div class="col-... text-right"> ← HOME goals: <span>36' Pedro Portilha </span>
  //   <div class="col-... text-left">  ← AWAY goals: <span>12' Bruno Silva </span>
  const infoGoals = html.match(/class="row info-goals">([\s\S]*?)(?=<div class="row info-goals"|<section|<div class="title-bar")/i);
  if (!infoGoals) return;

  const goalBlock = infoGoals[1];

  // Split into home (text-right) and away (text-left) columns
  const homeCol = goalBlock.match(/text-right">([\s\S]*?)(?=<\/div>)/i);
  const awayCol = goalBlock.match(/text-left">([\s\S]*?)(?=<\/div>)/i);

  // Parse goals from each column: <span>36' Pedro Portilha </span>
  const goalSpanRegex = /<span>(\d+)&#39;\s*([^<]+)<\/span>/g;

  if (homeCol) {
    let match;
    while ((match = goalSpanRegex.exec(homeCol[1])) !== null) {
      const minute = parseInt(match[1], 10);
      const playerName = decodeHtmlEntities(match[2].trim());
      events.push({
        eventType: 'goal',
        minute,
        playerName,
        fpfPlayerId: null,
        teamName: homeTeam,
        relatedPlayerName: null,
        relatedFpfPlayerId: null,
        notes: null,
      });
    }
  }

  if (awayCol) {
    let match;
    while ((match = goalSpanRegex.exec(awayCol[1])) !== null) {
      const minute = parseInt(match[1], 10);
      const playerName = decodeHtmlEntities(match[2].trim());
      events.push({
        eventType: 'goal',
        minute,
        playerName,
        fpfPlayerId: null,
        teamName: awayTeam,
        relatedPlayerName: null,
        relatedFpfPlayerId: null,
        notes: null,
      });
    }
  }
}

function extractSubstitutions(html: string, events: ParsedEvent[]) {
  // Substitutions from timeline: each timeline-item with icon-substitution.png contains:
  //   <span class="tag top-tag ...">MINUTE' </span>
  //   <img src="/Images/icon-substitution.png" />
  //   <span class="... substitution-tag ..."><span class="in">PLAYER IN</span><span class="out">PLAYER OUT</span></span>
  const timelineRegex = /timeline-item[\s\S]*?(\d+)&#39;\s*[\s\S]*?icon-substitution[\s\S]*?class="in">([^<]+)<\/span>\s*<span class="out">([^<]+)<\/span>/g;
  let match;

  while ((match = timelineRegex.exec(html)) !== null) {
    const minute = parseInt(match[1], 10);
    const playerIn = decodeHtmlEntities(match[2].trim());
    const playerOut = decodeHtmlEntities(match[3].trim());

    events.push({
      eventType: 'substitution_in',
      minute,
      playerName: playerIn,
      fpfPlayerId: null,
      teamName: '', // Will be determined by which team the player belongs to
      relatedPlayerName: playerOut,
      relatedFpfPlayerId: null,
      notes: null,
    });

    events.push({
      eventType: 'substitution_out',
      minute,
      playerName: playerOut,
      fpfPlayerId: null,
      teamName: '',
      relatedPlayerName: playerIn,
      relatedFpfPlayerId: null,
      notes: null,
    });
  }
}

function extractCards(html: string, homeTeam: string, awayTeam: string, events: ParsedEvent[]) {
  // Cards appear in the lineup section as CSS classes on player photos:
  //   <span class="icon icon-yellowcard"></span> or icon-redcard
  // They follow the player photo and are near the <strong>NUMBER</strong> PLAYER NAME pattern.
  // No minute is available from this source — we set minute to null.

  // Find all card icons in context: look backwards for the player name
  const cardRegex = /icon-(yellowcard|redcard)[\s\S]*?<\/span>[\s\S]*?<strong>\d{1,3}<\/strong>\s*([^<]+)/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardType = match[1] === 'yellowcard' ? 'yellow_card' : 'red_card';
    const playerName = decodeHtmlEntities(match[2].trim()).replace(/\s*\(GR\)\s*$/i, '').trim();
    if (!playerName) continue;

    // Determine team by looking backwards for lineup-team class
    const before = html.slice(Math.max(0, match.index - 3000), match.index);
    const lastHome = before.lastIndexOf('lineup-team home-team');
    const lastAway = before.lastIndexOf('lineup-team away-team');
    const team = lastHome > lastAway ? homeTeam : awayTeam;

    events.push({
      eventType: cardType as FpfMatchEventType,
      minute: null,
      playerName,
      fpfPlayerId: null,
      teamName: team,
      relatedPlayerName: null,
      relatedFpfPlayerId: null,
      notes: null,
    });
  }
}

/* ───────────── Minutes Calculation ───────────── */

/** Calculate minutes played for each player based on lineup, events, and match duration.
 *  Returns a map of playerName → minutes. */
export function calculateMinutes(
  players: ParsedPlayer[],
  events: ParsedEvent[],
  matchDuration: number,
): Map<string, number> {
  const minutes = new Map<string, number>();

  // Build substitution maps
  const subbedOutAt = new Map<string, number>(); // player → minute they left
  const subbedInAt = new Map<string, number>();  // player → minute they entered
  const redCardAt = new Map<string, number>();   // player → minute of red card

  for (const event of events) {
    if (event.eventType === 'substitution_out' && event.minute != null) {
      subbedOutAt.set(event.playerName, event.minute);
    }
    if (event.eventType === 'substitution_in' && event.minute != null) {
      subbedInAt.set(event.playerName, event.minute);
    }
    if (event.eventType === 'red_card' && event.minute != null) {
      redCardAt.set(event.playerName, event.minute);
    }
  }

  for (const player of players) {
    let mins = 0;

    if (player.isStarter) {
      // Starter: plays from 0 until subbed out, red card, or match end
      const exitMinute = subbedOutAt.get(player.playerName)
        ?? redCardAt.get(player.playerName)
        ?? matchDuration;
      mins = Math.min(exitMinute, matchDuration);
    } else if (subbedInAt.has(player.playerName)) {
      // Sub who entered: plays from entry until subbed out, red card, or match end
      const entryMinute = subbedInAt.get(player.playerName)!;
      const exitMinute = subbedOutAt.get(player.playerName)
        ?? redCardAt.get(player.playerName)
        ?? matchDuration;
      mins = Math.max(0, Math.min(exitMinute, matchDuration) - entryMinute);
    }
    // Subs who never entered get 0 minutes (not added)

    if (mins > 0 || player.isStarter) {
      minutes.set(player.playerName, mins);
    }
  }

  return minutes;
}

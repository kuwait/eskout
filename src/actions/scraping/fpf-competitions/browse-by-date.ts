// src/actions/scraping/fpf-competitions/browse-by-date.ts
// Live browse of FPF matches by date — fetches directly from resultados.fpf.pt
// Used by the scouting map browse page to discover games for a specific day
// RELEVANT FILES: src/actions/scraping/helpers.ts, src/lib/constants.ts, fpf-data.ts

'use server';

import { decodeHtmlEntities } from '../helpers';
import { fpfFetch, FpfRateLimitError } from '../fpf-fetch';
import { FPF_RESULTS_BASE, FPF_CURRENT_SEASON_ID } from '@/lib/constants';
import type { ActionResponse } from '@/lib/types';
import { getAuthContext } from '@/lib/supabase/club-context';
import type { FpfBrowseMatch, FpfBrowseCompetition } from './fpf-data';

/* ───────────── Retry Helper ───────────── */

/** Retry with exponential backoff. Aborts on rate limit (429). */
async function withRetry<T>(
  fn: () => Promise<T | null>,
  retries = 3,
  baseDelay = 3000,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (result !== null) return result;
    } catch (e) {
      if (e instanceof FpfRateLimitError) {
        console.warn(`[FPF Browse Date] 429 rate-limited — abortar.`);
        return null;
      }
      throw e;
    }
    if (attempt < retries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 2000;
      console.log(`[FPF Browse Date] Attempt ${attempt + 1} failed, waiting ${Math.round(delay / 1000)}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

/* ───────────── Fetch HTML ───────────── */

async function fetchHtml(url: string): Promise<string | null> {
  const res = await fpfFetch(url);
  if (!res) return null;
  if (!res.ok) {
    console.warn(`[FPF Browse Date] ${res.status} for ${url}`);
    return null;
  }
  return await res.text();
}

/* ───────────── Parse Escalão from Competition Name ───────────── */

/** Extract escalão from competition name, e.g. "C.D. SUB-15 / I DIVISAO" → "Sub-15" */
function extractEscalao(competitionName: string): string | null {
  // Match "SUB-NN" pattern (case insensitive)
  const subMatch = competitionName.match(/sub[- ]?(\d+)/i);
  if (subMatch) return `Sub-${subMatch[1]}`;

  // Check for senior/masters keywords
  if (/s[eé]nior|masters|honra|elite/i.test(competitionName)) return 'Sénior';

  return null;
}

/* ───────────── Parse Time from game-schedule ───────────── */

/** Parse "29 mar<br />17:00" → "17:00" */
function parseMatchTime(scheduleHtml: string): string | null {
  // Time pattern: HH:MM after <br /> or on its own line
  const timeMatch = scheduleHtml.match(/(\d{1,2}:\d{2})/);
  return timeMatch ? timeMatch[1] : null;
}

/* ───────────── Build Composite Key ───────────── */

function buildKey(homeTeam: string, awayTeam: string, matchDate: string, matchTime: string | null): string {
  return `${homeTeam.toLowerCase().trim()}|${awayTeam.toLowerCase().trim()}|${matchDate}|${matchTime ?? ''}`;
}

/* ───────────── HTML Parser ───────────── */

/**
 * Parse the FPF SearchCompetitionsByPage HTML response into structured data.
 * Each "game-results" div is a competition block with series and matches.
 */
function parseFpfDailyHtml(html: string, targetDate: string): FpfBrowseCompetition[] {
  const competitions: FpfBrowseCompetition[] = [];

  // Split into competition blocks by "game-results" divs
  // Use a lookahead to capture everything between blocks
  const blockPattern = /<div\s+class="game-results[^"]*"[^>]*>([\s\S]*?)(?=<div\s+class="game-results|<div\s+class="col-md-12\s+text-center|$)/gi;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(html)) !== null) {
    try {
      const block = blockMatch[1];

      // Extract competition name from <strong>...</strong> inside info-text
      const nameMatch = block.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
      const rawName = nameMatch ? decodeHtmlEntities(nameMatch[1].replace(/<[^>]*>/g, '').trim()) : 'Competição desconhecida';

      // Extract competitionId from href
      const compIdMatch = block.match(/competitionId=(\d+)/i);
      const competitionId = compIdMatch ? parseInt(compIdMatch[1], 10) : null;

      // Extract jornada from text near the info block — "Jornada NN" or "NN.ª Jornada"
      const jornadaMatch = block.match(/(?:Jornada\s+(\d+)|(\d+)\.?\s*[ªa]\s*Jornada)/i);
      const jornada = jornadaMatch
        ? `Jornada ${jornadaMatch[1] || jornadaMatch[2]}`
        : null;

      // Derive escalão from competition name
      const escalao = extractEscalao(rawName);

      // Parse series and matches
      // Strategy: walk through the block sequentially, tracking current series
      const series: { name: string | null; matches: FpfBrowseMatch[] }[] = [];
      let currentSeriesName: string | null = null;
      let currentMatches: FpfBrowseMatch[] = [];

      // Split block into relevant chunks: game-separator, game divs, stadium divs
      // Process line by line to maintain order
      const separatorPattern = /<span\s+class="game-separator[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
      const gameLinkPattern = /<a\s+class="game-link"[^>]*href="[^"]*matchId=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

      // Collect all separators with their positions
      const separators: { index: number; name: string }[] = [];
      let sepMatch;
      while ((sepMatch = separatorPattern.exec(block)) !== null) {
        separators.push({
          index: sepMatch.index,
          name: decodeHtmlEntities(sepMatch[1].replace(/<[^>]*>/g, '').trim()),
        });
      }

      // Collect all matches (both scheduled and played) with positions
      // Played matches are wrapped in <a class="game-link">
      // Scheduled matches are bare <div class="game">
      interface RawMatch {
        index: number;
        html: string;
        fpfMatchId: number | null;
      }
      const rawMatches: RawMatch[] = [];

      // First pass: find played matches (wrapped in <a class="game-link">)
      let linkMatch;
      while ((linkMatch = gameLinkPattern.exec(block)) !== null) {
        rawMatches.push({
          index: linkMatch.index,
          html: linkMatch[2],
          fpfMatchId: parseInt(linkMatch[1], 10),
        });
      }

      // Second pass: find all game divs (both scheduled and played)
      // We need to find game divs NOT inside game-link anchors
      // Use a simpler pattern: match <div class="game" that contains home-team and away-team
      const simpleGamePattern = /<div\s+class="game"[^>]*>[\s\S]*?<div\s+class="home-team[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<span\s+class="game-schedule"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<div\s+class="away-team[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

      // Also match played games (with score instead of schedule)
      const scoredGamePattern = /<div\s+class="game"[^>]*>[\s\S]*?<div\s+class="home-team[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div\s+class="score[^"]*"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div\s+class="away-team[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

      // Find stadiums: <div class="game-list-stadium"...><small...>NAME</small></div>
      const stadiumPattern = /<div\s+class="game-list-stadium[^"]*"[^>]*>[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/gi;
      const stadiums: { index: number; name: string }[] = [];
      let stadMatch;
      while ((stadMatch = stadiumPattern.exec(block)) !== null) {
        stadiums.push({
          index: stadMatch.index,
          name: decodeHtmlEntities(stadMatch[1].replace(/<[^>]*>/g, '').trim()),
        });
      }

      // Collect scheduled games
      interface ParsedGame {
        index: number;
        homeTeam: string;
        awayTeam: string;
        matchTime: string | null;
        fpfMatchId: number | null;
      }
      const parsedGames: ParsedGame[] = [];

      let sgMatch;
      while ((sgMatch = simpleGamePattern.exec(block)) !== null) {
        const homeTeam = decodeHtmlEntities(sgMatch[1].replace(/<[^>]*>/g, '').trim());
        const scheduleHtml = sgMatch[2];
        const awayTeam = decodeHtmlEntities(sgMatch[3].replace(/<[^>]*>/g, '').trim());
        const matchTime = parseMatchTime(scheduleHtml);

        // Check if this game position is inside a game-link (played match)
        const playedMatch = rawMatches.find(
          (rm) => rm.index < sgMatch!.index && sgMatch!.index < rm.index + rm.html.length + 200,
        );

        parsedGames.push({
          index: sgMatch.index,
          homeTeam,
          awayTeam,
          matchTime,
          fpfMatchId: playedMatch?.fpfMatchId ?? null,
        });
      }

      // Also find scored/played games that don't have game-schedule
      let scMatch;
      while ((scMatch = scoredGamePattern.exec(block)) !== null) {
        const homeTeam = decodeHtmlEntities(scMatch[1].replace(/<[^>]*>/g, '').trim());
        const awayTeam = decodeHtmlEntities(scMatch[3].replace(/<[^>]*>/g, '').trim());

        // Check if already found by simpleGamePattern
        const alreadyFound = parsedGames.some(
          (pg) => Math.abs(pg.index - scMatch!.index) < 50,
        );
        if (alreadyFound) continue;

        // Find matchId from game-link wrapper
        const playedMatch = rawMatches.find(
          (rm) => rm.index < scMatch!.index && scMatch!.index < rm.index + rm.html.length + 200,
        );

        parsedGames.push({
          index: scMatch.index,
          homeTeam,
          awayTeam,
          matchTime: null,
          fpfMatchId: playedMatch?.fpfMatchId ?? null,
        });
      }

      // Sort everything by position in the HTML
      parsedGames.sort((a, b) => a.index - b.index);

      // Assign stadiums to games (stadium div follows its game div)
      const gameStadiums: Map<number, string> = new Map();
      for (const game of parsedGames) {
        // Find the first stadium that appears after this game
        const stadium = stadiums.find((s) => s.index > game.index);
        if (stadium) {
          gameStadiums.set(game.index, stadium.name);
          // Remove used stadium so it doesn't match again
          const idx = stadiums.indexOf(stadium);
          if (idx !== -1) stadiums.splice(idx, 1);
        }
      }

      // Group games by series using separator positions
      let currentSepIdx = 0;
      for (const game of parsedGames) {
        // Check if we've passed a new separator
        while (currentSepIdx < separators.length && separators[currentSepIdx].index < game.index) {
          // Save current series if it has matches
          if (currentMatches.length > 0) {
            series.push({ name: currentSeriesName, matches: currentMatches });
            currentMatches = [];
          }
          currentSeriesName = separators[currentSepIdx].name;
          currentSepIdx++;
        }

        const venue = gameStadiums.get(game.index) ?? null;
        const key = buildKey(game.homeTeam, game.awayTeam, targetDate, game.matchTime);

        currentMatches.push({
          key,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          matchDate: targetDate,
          matchTime: game.matchTime,
          venue,
          competitionName: rawName,
          seriesName: currentSeriesName,
          escalao,
          fpfMatchId: game.fpfMatchId,
          jornada,
        });
      }

      // Push last series
      if (currentMatches.length > 0) {
        series.push({ name: currentSeriesName, matches: currentMatches });
        currentMatches = [];
      }

      // Only add competition if it has matches
      if (series.length > 0) {
        competitions.push({ name: rawName, competitionId, jornada, series });
      }
    } catch (err) {
      // One malformed block should not break the entire response
      console.warn('[FPF Browse Date] Failed to parse competition block:', err);
    }
  }

  return competitions;
}

/* ───────────── Main Server Action ───────────── */

/**
 * Browse FPF matches for a specific date — fetches LIVE from resultados.fpf.pt.
 * Returns competitions grouped with series and matches.
 */
export async function browseFpfByDate(params: {
  date: string;                              // YYYY-MM-DD
  organizationType: 'FPF' | 'Association';
  associationId?: number;                    // Required when organizationType === 'Association'
  footballClassId?: number;                  // 2-5, omit for "Todos"
}): Promise<ActionResponse<FpfBrowseCompetition[]>> {
  // Auth check — only coordinators (admin/editor)
  const { role } = await getAuthContext();
  if (role !== 'admin' && role !== 'editor') {
    return { success: false, error: 'Sem permissão' };
  }

  // Parse date components
  const [yearStr, monthStr, dayStr] = params.date.split('-');
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);

  if (!day || !month || !yearStr) {
    return { success: false, error: 'Data inválida' };
  }

  // Build URL
  const urlParams = new URLSearchParams({
    'Request.SeasonItemId': String(FPF_CURRENT_SEASON_ID),
    'Request.CalendarDay': String(day),
    'Request.CalendarMonth': String(month),
    'Request.GenderId': 'Masculino',
    'Request.OrganizationTypeId': params.organizationType,
    'Request.FootballTypeId': 'Football',
    'Request.RenderCalendarWithSliderAnimation': 'False',
    'PageNumber': '1',
    'PageSize': '100',
  });

  if (params.organizationType === 'Association' && params.associationId) {
    urlParams.set('Request.AssociationId', String(params.associationId));
  }

  if (params.footballClassId) {
    urlParams.set('Request.FootballClassId', String(params.footballClassId));
  }

  const url = `${FPF_RESULTS_BASE}/Home/SearchCompetitionsByPage?${urlParams.toString()}`;

  // Fetch with retry
  const html = await withRetry(() => fetchHtml(url));

  if (!html) {
    return { success: false, error: 'Não foi possível carregar jogos da FPF. Tente novamente.' };
  }

  // Parse HTML
  const competitions = parseFpfDailyHtml(html, params.date);

  return { success: true, data: competitions };
}

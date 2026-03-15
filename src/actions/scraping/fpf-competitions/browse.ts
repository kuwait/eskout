// src/actions/scraping/fpf-competitions/browse.ts
// Discover FPF competitions, associations, and fixtures from resultados.fpf.pt
// Read-only scraping — no DB writes. Used by the competition browser UI.
// RELEVANT FILES: src/actions/scraping/helpers.ts, src/lib/constants.ts, src/actions/scraping/fpf-competitions/fpf-data.ts

'use server';

import { browserHeaders, decodeHtmlEntities } from '../helpers';
import { FPF_RESULTS_BASE } from '@/lib/constants';
import type { ActionResponse } from '@/lib/types';
import type { FpfCompetitionBrowse, FpfFixtureInfo, FpfFixtureMatch } from './fpf-data';

/* ───────────── Retry Helper ───────────── */

/** Retry with exponential backoff. Returns null after all retries fail. */
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
      console.log(`[FPF Comp Retry] Attempt ${attempt + 1} failed, waiting ${Math.round(delay / 1000)}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

/* ───────────── Fetch HTML Helper ───────────── */

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: browserHeaders(),
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn(`[FPF Browse] ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[FPF Browse] Fetch error:`, e);
    return null;
  }
}

/* ───────────── Get Association Competitions ───────────── */

/** Fetch available competitions for an association from resultados.fpf.pt */
export async function getAssociationCompetitions(
  associationId: number,
  seasonId: number,
): Promise<ActionResponse<FpfCompetitionBrowse[]>> {
  const url = `${FPF_RESULTS_BASE}/Competition/GetCompetitionsByAssociation?associationId=${associationId}&seasonId=${seasonId}`;

  const html = await withRetry(() => fetchHtml(url));
  if (!html) return { success: false, error: 'Não foi possível obter competições da FPF' };

  const competitions: FpfCompetitionBrowse[] = [];
  // Parse competition links: <a href="/Competition/Details?competitionId=XXX&amp;seasonId=YYY">Name</a>
  // HTML-encodes & as &amp; — match both forms
  const linkRegex = /href="\/Competition\/Details\?competitionId=(\d+)(?:&amp;|&)seasonId=(\d+)"[^>]*>([^<]+)/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    competitions.push({
      id: parseInt(match[1], 10),
      name: decodeHtmlEntities(match[3].trim()),
      url: `/Competition/Details?competitionId=${match[1]}&seasonId=${match[2]}`,
    });
  }

  return { success: true, data: competitions };
}

/* ───────────── Get Competition Fixtures ───────────── */

/** Discover all phases, series, and fixtures for a competition.
 *  Returns fixtureIds needed to scrape individual jornadas. */
export async function getCompetitionFixtures(
  competitionId: number,
  seasonId: number,
): Promise<ActionResponse<FpfFixtureInfo[]>> {
  const url = `${FPF_RESULTS_BASE}/Competition/Details?competitionId=${competitionId}&seasonId=${seasonId}`;

  const rawHtml = await withRetry(() => fetchHtml(url));
  if (!rawHtml) return { success: false, error: 'Não foi possível obter detalhes da competição' };

  // Decode HTML entities in the full HTML so regexes can match literal characters (É, ã, etc.)
  const html = decodeHtmlEntities(rawHtml);

  const fixtures: FpfFixtureInfo[] = [];

  // Strategy: position-based scanning of full HTML (not line-by-line, since FPF HTML may be minified).
  // Build ordered list of "markers" (phase, series, fixture) by position, then assign context.
  type Marker =
    | { type: 'phase'; pos: number; name: string }
    | { type: 'series'; pos: number; name: string }
    | { type: 'fixture'; pos: number; fixtureId: number; jornadaNum: string };

  const markers: Marker[] = [];

  // 1. Phase headers: <h2/h3> containing "N.ª Fase" — may also contain inline series
  const phaseRegex = /<h[23][^>]*>([^<]*\d+\.ª\s*Fase[^<]*)<\/h[23]>/gi;
  let m;
  while ((m = phaseRegex.exec(html)) !== null) {
    const fullHeader = decodeHtmlEntities(m[1].trim());
    const inlineSeries = fullHeader.match(/(S[ÉéEe]rie\s+\w+)/i);
    if (inlineSeries) {
      const phase = fullHeader.replace(/\s*-\s*S[ÉéEe]rie\s+\w+/i, '').trim();
      markers.push({ type: 'phase', pos: m.index, name: phase });
      markers.push({ type: 'series', pos: m.index + 1, name: inlineSeries[1] });
    } else {
      markers.push({ type: 'phase', pos: m.index, name: fullHeader });
    }
  }

  // 2. Section headers — fully dynamic: find ALL short text between > and < in the HTML.
  //    Then filter to only those that appear in "gaps" between fixture link clusters.
  //    This handles any FPF naming: SÉRIE 01, GRUPO A, APURAMENTO CAMPEÃO, etc.
  const textRegex = />([^<]{2,60})</g;
  const candidateHeaders: { pos: number; name: string }[] = [];
  while ((m = textRegex.exec(html)) !== null) {
    // Normalize whitespace: trim regular + non-breaking spaces (U+00A0)
    const text = m[1].replace(/[\s\u00A0]+/g, ' ').trim();
    if (!text || text.length < 2) continue;
    // Skip purely numeric or whitespace
    if (/^\d+$/.test(text)) continue;
    candidateHeaders.push({ pos: m.index, name: text });
  }

  // 3. Fixture links: fixtureId=XXX">N</a>
  const fixtureRegex = /GetClassificationAndMatchesByFixture\?fixtureId=(\d+)[^>]*>(\d+)</g;
  const seenFixtureIds = new Set<number>();
  while ((m = fixtureRegex.exec(html)) !== null) {
    const fixtureId = parseInt(m[1], 10);
    if (!seenFixtureIds.has(fixtureId)) {
      seenFixtureIds.add(fixtureId);
      markers.push({ type: 'fixture', pos: m.index, fixtureId, jornadaNum: m[2] });
    }
  }

  // Sort phase + fixture markers by position
  markers.sort((a, b) => a.pos - b.pos);

  // Detect fixture clusters: groups of fixture links separated by large gaps (>500 chars).
  // In the gap before each cluster, find the most likely section header from candidateHeaders.
  const fixtureMarkers = markers.filter((mk): mk is Extract<Marker, { type: 'fixture' }> => mk.type === 'fixture');
  const phaseMarkers = markers.filter((mk): mk is Extract<Marker, { type: 'phase' }> => mk.type === 'phase');

  // Build clusters of consecutive fixture links (gap > 500 chars = new cluster)
  const GAP_THRESHOLD = 500;
  const clusters: { startPos: number; fixtures: typeof fixtureMarkers }[] = [];
  for (const fx of fixtureMarkers) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || fx.pos - lastCluster.fixtures[lastCluster.fixtures.length - 1].pos > GAP_THRESHOLD) {
      clusters.push({ startPos: fx.pos, fixtures: [fx] });
    } else {
      lastCluster.fixtures.push(fx);
    }
  }

  // For each cluster, find the section header in the gap before it.
  // Look backwards from the cluster start for the nearest "important" text:
  // - Must be between the previous cluster's last fixture (or page start) and this cluster's first fixture
  // - Pick the text closest to the cluster that looks like a heading (short, uppercase-ish, not boilerplate)
  const BOILERPLATE = /^(Futebol|Masculino|Feminino|Classifica[çc][ãa]o|Jogos|Jornadas|clearfix|\d+|J|V|E|D|GM|GS|DG|Pts|Pos|Equipa|#)\s*$/i;

  let currentPhase = '';
  const clusterSeries = new Map<number, string>();

  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const prevEnd = ci > 0 ? clusters[ci - 1].fixtures[clusters[ci - 1].fixtures.length - 1].pos : 0;
    const gapStart = prevEnd;
    const gapEnd = cluster.startPos;

    // Find phase markers in this gap
    for (const pm of phaseMarkers) {
      if (pm.pos > gapStart && pm.pos < gapEnd) {
        currentPhase = pm.name;
      }
    }

    // Find the best section header in the gap before this cluster
    const gapHeaders = candidateHeaders.filter(
      (h) => h.pos > gapStart && h.pos < gapEnd && !BOILERPLATE.test(h.name),
    );

    // Pick the last non-boilerplate header closest to the fixtures — that's most likely the section name
    // Filter out very long strings (likely content, not headers) and phase names we already captured
    const sectionHeader = gapHeaders
      .filter((h) => h.name.length <= 40)
      .filter((h) => !(/\d+\.ª\s*Fase/i.test(h.name)))
      .pop();

    const seriesName = sectionHeader?.name ?? '';
    clusterSeries.set(ci, seriesName);

    // Assign context to all fixtures in this cluster
    for (const fx of cluster.fixtures) {
      fixtures.push({
        fixtureId: fx.fixtureId,
        name: `Jornada ${fx.jornadaNum}`,
        phaseName: currentPhase,
        seriesName,
      });
    }
  }

  return { success: true, data: fixtures };
}

/* ───────────── Get Fixture Matches ───────────── */

/** Fetch all matches for a specific fixture/jornada. Returns matchIds + basic info. */
export async function getFixtureMatches(
  fixtureId: number,
): Promise<ActionResponse<FpfFixtureMatch[]>> {
  const url = `${FPF_RESULTS_BASE}/Competition/GetClassificationAndMatchesByFixture?fixtureId=${fixtureId}`;

  const html = await withRetry(() => fetchHtml(url));
  if (!html) return { success: false, error: `Não foi possível obter jornada ${fixtureId}` };

  const matches: FpfFixtureMatch[] = [];

  // FPF HTML structure: <div id="matches"> contains <a class="game-link" href="...matchId=XXX">
  // Each match block: <div class="home-team ...">Team</div> <div class="score ...">X - Y</div> <div class="away-team ...">Team</div>
  // Parse each game-link block individually to avoid context window overlap issues.
  const gameLinkRegex = /<a\s+class="game-link"\s+href="[^"]*matchId=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let blockMatch;

  while ((blockMatch = gameLinkRegex.exec(html)) !== null) {
    const matchId = parseInt(blockMatch[1], 10);
    const block = blockMatch[2];

    // Extract team names from home-team/away-team divs within this block
    const homeMatch = block.match(/class="[^"]*home-team[^"]*"[^>]*>([^<]+)/i);
    const awayMatch = block.match(/class="[^"]*away-team[^"]*"[^>]*>([^<]+)/i);
    const homeTeam = homeMatch ? decodeHtmlEntities(homeMatch[1].trim()) : 'Equipa A';
    const awayTeam = awayMatch ? decodeHtmlEntities(awayMatch[1].trim()) : 'Equipa B';

    // Extract score from score div
    const scoreMatch = block.match(/class="[^"]*score[^"]*"[\s\S]*?(\d+)\s*-\s*(\d+)/i);
    const homeScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const awayScore = scoreMatch ? parseInt(scoreMatch[2], 10) : null;
    const isPlayed = homeScore !== null && awayScore !== null;

    // Extract date — "14 set", "2 nov", etc.
    const dateMatch = block.match(/(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(\d{1,2}:\d{2}))?/i);
    const date = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : null;
    const time = dateMatch?.[3] ?? null;

    matches.push({ matchId, homeTeam, awayTeam, homeScore, awayScore, date, time, isPlayed });
  }

  // Fallback: if structured parsing found nothing, use generic matchId extraction
  // (handles edge cases where FPF changes the HTML structure)
  if (matches.length === 0) {
    const matchRegex = /GetMatchInformation\?matchId=(\d+)/g;
    let matchResult;
    const matchIds = new Set<number>();
    while ((matchResult = matchRegex.exec(html)) !== null) {
      matchIds.add(parseInt(matchResult[1], 10));
    }
    for (const matchId of matchIds) {
      matches.push({
        matchId,
        homeTeam: 'Equipa A',
        awayTeam: 'Equipa B',
        homeScore: null,
        awayScore: null,
        date: null,
        time: null,
        isPlayed: false,
      });
    }
  }

  return { success: true, data: matches };
}

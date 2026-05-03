// src/actions/scraping/fpf-competitions/__tests__/parse-match.test.ts
// Tests for parseMatchHtml against real FPF match sheet HTML
// Validates team names, lineups, goals, substitutions, and cards extraction
// RELEVANT FILES: src/actions/scraping/fpf-competitions/scrape-match.ts

import * as fs from 'fs';
import * as path from 'path';
import { parseMatchHtml } from '../scrape-match';

/* ───────────── Load real HTML fixture ───────────── */

const htmlPath = path.join(__dirname, 'fixtures', 'match-2364272.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// AVS - Sad 5-0 F.C. Tirsense, 14/09/2025
const result = parseMatchHtml(html);

/* ───────────── Team Names ───────────── */

describe('parseMatchHtml — AVS 5-0 Tirsense', () => {
  it('extracts correct team names', () => {
    expect(result.homeTeam).toBe('Avs - Sad');
    expect(result.awayTeam).toBe('F.C. Tirsense');
  });

  it('extracts correct score', () => {
    expect(result.homeScore).toBe(5);
    expect(result.awayScore).toBe(0);
  });

  it('extracts match date', () => {
    expect(result.date).toBe('2025-09-14');
  });

  it('has lineup data', () => {
    expect(result.hasLineupData).toBe(true);
  });

  /* ───────────── Lineups ───────────── */

  it('extracts 11 home starters (AVS)', () => {
    const homeStarters = result.players.filter((p) => p.teamName === 'Avs - Sad' && p.isStarter);
    expect(homeStarters.length).toBe(11);
  });

  it('extracts 11 away starters (Tirsense)', () => {
    const awayStarters = result.players.filter((p) => p.teamName === 'F.C. Tirsense' && p.isStarter);
    expect(awayStarters.length).toBeGreaterThanOrEqual(11);
  });

  it('assigns correct team to players', () => {
    // Pedro Portilha plays for AVS (home)
    const portilha = result.players.find((p) => p.playerName.includes('Pedro Portilha'));
    expect(portilha?.teamName).toBe('Avs - Sad');

    // João Santos plays for Tirsense (away)
    const santos = result.players.find((p) => p.playerName.includes('Santos') && p.playerName.includes('Jo'));
    expect(santos?.teamName).toBe('F.C. Tirsense');
  });

  /* ───────────── Goals ───────────── */

  it('extracts 5 goals total', () => {
    const goals = result.events.filter((e) => e.eventType === 'goal' || e.eventType === 'penalty_goal');
    expect(goals.length).toBe(5);
  });

  it('all goals belong to AVS (home team)', () => {
    const goals = result.events.filter((e) => e.eventType === 'goal' || e.eventType === 'penalty_goal');
    for (const g of goals) {
      expect(g.teamName).toBe('Avs - Sad');
    }
  });

  it('Pedro Portilha scored 3 goals (36\', 40\', 45\')', () => {
    const portilhaGoals = result.events.filter(
      (e) => (e.eventType === 'goal' || e.eventType === 'penalty_goal') && e.playerName.includes('Pedro Portilha'),
    );
    expect(portilhaGoals.length).toBe(3);
    expect(portilhaGoals.map((g) => g.minute).sort()).toEqual([36, 40, 45]);
  });

  it('Frederico Pacheco scored at 60\'', () => {
    const fpGoals = result.events.filter(
      (e) => (e.eventType === 'goal') && e.playerName.includes('Frederico Pacheco'),
    );
    expect(fpGoals.length).toBe(1);
    expect(fpGoals[0].minute).toBe(60);
  });

  it('Bruno Martins scored at 71\'', () => {
    const bmGoals = result.events.filter(
      (e) => (e.eventType === 'goal') && e.playerName.includes('Bruno Martins'),
    );
    expect(bmGoals.length).toBe(1);
    expect(bmGoals[0].minute).toBe(71);
  });

  /* ───────────── Substitutions ───────────── */

  it('extracts substitutions', () => {
    const subsIn = result.events.filter((e) => e.eventType === 'substitution_in');
    // 10 subs total (some may be home, some away)
    expect(subsIn.length).toBeGreaterThanOrEqual(5);
  });

  it('Frederico Pacheco came in for Antonio Aguiar', () => {
    const subIn = result.events.find(
      (e) => e.eventType === 'substitution_in' && e.playerName.includes('Frederico Pacheco'),
    );
    expect(subIn).toBeDefined();
    expect(subIn?.relatedPlayerName).toContain('Antonio Aguiar');
  });

  /* ───────────── Yellow Cards ───────────── */

  it('extracts yellow cards', () => {
    const yellows = result.events.filter((e) => e.eventType === 'yellow_card');
    // At least the ones visible in lineup (Rodrigo Ferreira, Miguel Chanoca, João Santos)
    expect(yellows.length).toBeGreaterThanOrEqual(2);
  });
});

/* ───────────── Apostrophe variant regression ───────────── */

// FPF historically rendered minute markers as `45&#39;` (HTML-encoded apostrophe) but
// some pages (e.g. AF Porto Sub-17 II Divisão matches scraped April 2026) serve a literal
// `'` instead. The regex used to be hard-coded to `&#39;` only and silently dropped goals,
// substitutions, and cards from any match using literal apostrophes — which in turn caused
// substituted-in players to never appear in fpf_match_players (filter at insert time
// requires the player to be a starter OR have minutes/sub-in event). This regression test
// rewrites the existing fixture's apostrophes to the literal form and asserts the parser
// still extracts the same events.
describe('parseMatchHtml — apostrophe variant tolerance', () => {
  const literalApostropheHtml = html.replace(/&#39;/g, "'");
  const literalResult = parseMatchHtml(literalApostropheHtml);

  it('extracts the same number of goals regardless of apostrophe encoding', () => {
    const encodedGoals = result.events.filter(
      (e) => e.eventType === 'goal' || e.eventType === 'penalty_goal',
    ).length;
    const literalGoals = literalResult.events.filter(
      (e) => e.eventType === 'goal' || e.eventType === 'penalty_goal',
    ).length;
    expect(literalGoals).toBe(encodedGoals);
    expect(literalGoals).toBeGreaterThan(0);
  });

  it('extracts substitutions when minutes use literal apostrophes', () => {
    const subsIn = literalResult.events.filter((e) => e.eventType === 'substitution_in');
    expect(subsIn.length).toBeGreaterThanOrEqual(1);
    // Each sub-in must have a minute (the apostrophe regex feeds this)
    for (const sub of subsIn) {
      expect(sub.minute).not.toBeNull();
      expect(sub.playerName.length).toBeGreaterThan(0);
      expect(sub.relatedPlayerName?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('produces matching event timelines (encoded vs literal apostrophe)', () => {
    // Same set of events should come out, just rendered differently in HTML.
    const encodedEvents = result.events.map((e) => `${e.eventType}@${e.minute}:${e.playerName}`).sort();
    const literalEvents = literalResult.events.map((e) => `${e.eventType}@${e.minute}:${e.playerName}`).sort();
    expect(literalEvents).toEqual(encodedEvents);
  });
});

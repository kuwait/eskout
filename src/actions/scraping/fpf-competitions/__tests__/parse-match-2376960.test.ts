// src/actions/scraping/fpf-competitions/__tests__/parse-match-2376960.test.ts
// Live-fetched FPF match: Panther Force 0-15 SC Arcozelo, Sub-17 II Divisão jornada 6
// This match's HTML uses LITERAL apostrophes (`45'`) for minute markers — not the
// HTML-encoded `&#39;` form. The original regex only matched the encoded form, so
// every event (goal, substitution, card timeline) was silently dropped, and any
// suplente who came on was filtered out of the fpf_match_players insert.
// RELEVANT FILES: src/actions/scraping/fpf-competitions/scrape-match.ts

import * as fs from 'fs';
import * as path from 'path';
import { parseMatchHtml } from '../scrape-match';

const htmlPath = path.join(__dirname, 'fixtures', 'match-2376960.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const result = parseMatchHtml(html);

describe('parseMatchHtml — match 2376960 (Panther Force 0-15 SC Arcozelo)', () => {
  /* ───────────── Apostrophe form sanity ───────────── */

  it('fixture uses literal apostrophes (no &#39;) — guards regex against regression', () => {
    expect(html.match(/&#39;/g)).toBeNull();
    expect(html.match(/\d+'/g)?.length ?? 0).toBeGreaterThan(20);
  });

  /* ───────────── Match metadata ───────────── */

  it('extracts team names', () => {
    expect(result.homeTeam).toContain('Panther Force');
    expect(result.awayTeam.toLowerCase()).toContain('arcozelo');
  });

  it('extracts score 0-15', () => {
    expect(result.homeScore).toBe(0);
    expect(result.awayScore).toBe(15);
  });

  it('has lineup data', () => {
    expect(result.hasLineupData).toBe(true);
  });

  /* ───────────── Lineups ───────────── */

  it('extracts 11 starters per team', () => {
    const homeStarters = result.players.filter((p) => p.teamName === result.homeTeam && p.isStarter);
    const awayStarters = result.players.filter((p) => p.teamName === result.awayTeam && p.isStarter);
    expect(homeStarters.length).toBe(11);
    expect(awayStarters.length).toBe(11);
  });

  it('extracts the 8 home suplentes (Panther Force)', () => {
    const homeSubs = result.players.filter((p) => p.teamName === result.homeTeam && p.isSubstitute);
    // Panther Force suplentes per the match sheet:
    //   Rodrigo Santos, Salvador Coelho, Pedro Silva, Rafael Rodrigues,
    //   Andre Martins, Martim Lacerda, Afonso Pereira, Rodrigo Guardao
    const names = homeSubs.map((p) => p.playerName);
    expect(names).toEqual(expect.arrayContaining([
      expect.stringContaining('Rodrigo Santos'),
      expect.stringContaining('Salvador Coelho'),
      expect.stringContaining('Pedro Silva'),
      expect.stringContaining('Rafael Rodrigues'),
      expect.stringContaining('Andre Martins'),
      expect.stringContaining('Martim Lacerda'),
      expect.stringContaining('Afonso Pereira'),
      expect.stringContaining('Rodrigo Guardao'),
    ]));
    expect(homeSubs.length).toBe(8);
  });

  it('extracts the 8 away suplentes (SC Arcozelo)', () => {
    const awaySubs = result.players.filter((p) => p.teamName === result.awayTeam && p.isSubstitute);
    expect(awaySubs.length).toBe(8);
  });

  it('Salvador Coelho appears in the players list with FPF ID 4106527', () => {
    const salvador = result.players.find(
      (p) => p.playerName.toLowerCase().includes('salvador')
        && p.playerName.toLowerCase().includes('coelho'),
    );
    expect(salvador).toBeDefined();
    expect(salvador?.isSubstitute).toBe(true);
    expect(salvador?.fpfPlayerId).toBe(4106527);
    expect(salvador?.teamName).toContain('Panther Force');
  });

  /* ───────────── Events (apostrophe-sensitive parser) ───────────── */

  it('extracts all 15 goals (failed under the &#39;-only regex)', () => {
    const goals = result.events.filter(
      (e) => e.eventType === 'goal' || e.eventType === 'penalty_goal',
    );
    expect(goals.length).toBe(15);
  });

  it('extracts substitutions from the timeline', () => {
    const subsIn = result.events.filter((e) => e.eventType === 'substitution_in');
    // The match had 6 home subs + ~7 away subs at half-time and through 2nd half
    expect(subsIn.length).toBeGreaterThanOrEqual(10);
  });

  it('Salvador Coelho subbed in at 45\' for Bernardo Rodrigues', () => {
    const salvadorIn = result.events.find(
      (e) => e.eventType === 'substitution_in'
        && e.playerName.toLowerCase().includes('salvador'),
    );
    expect(salvadorIn).toBeDefined();
    expect(salvadorIn?.minute).toBe(45);
    expect(salvadorIn?.relatedPlayerName?.toLowerCase()).toContain('bernardo rodrigues');
  });

  it('Afonso Pereira subbed in at 45\' for Daniel Pereira', () => {
    const afonsoIn = result.events.find(
      (e) => e.eventType === 'substitution_in'
        && e.playerName.toLowerCase().includes('afonso pereira'),
    );
    expect(afonsoIn).toBeDefined();
    expect(afonsoIn?.minute).toBe(45);
    expect(afonsoIn?.relatedPlayerName?.toLowerCase()).toContain('daniel pereira');
  });

  it('Rodrigo Carvalho scored from the bench (sub at 54\', goals at 63\' and 78\')', () => {
    // Validates that a player who came on the bench AND scored is captured correctly.
    const carvalhoSubIn = result.events.find(
      (e) => e.eventType === 'substitution_in'
        && e.playerName.toLowerCase().includes('rodrigo carvalho'),
    );
    expect(carvalhoSubIn).toBeDefined();
    expect(carvalhoSubIn?.minute).toBe(54);

    const carvalhoGoals = result.events.filter(
      (e) => (e.eventType === 'goal' || e.eventType === 'penalty_goal')
        && e.playerName.toLowerCase().includes('rodrigo carvalho'),
    );
    expect(carvalhoGoals.length).toBe(2);
    expect(carvalhoGoals.map((g) => g.minute).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([63, 78]);
  });
});

// src/lib/utils/__tests__/playing-up.test.ts
// Tests for playing-up detection — ZZ team escalão parsing + age comparison
// Verifies correct identification of players competing above their natural age group
// RELEVANT FILES: src/lib/utils/playing-up.ts, src/lib/constants.ts

import { parseZzTeamSubLevel, detectPlayingUp } from '@/lib/utils/playing-up';

/** Mirror the season end year logic from the utility */
function getSeasonEndYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/* ───────────── parseZzTeamSubLevel ───────────── */

describe('parseZzTeamSubLevel', () => {
  it('parses "Jun.C S15 C" → 15', () => {
    expect(parseZzTeamSubLevel('Jun.C S15 C')).toBe(15);
  });

  it('parses "Jun.B S17" → 17', () => {
    expect(parseZzTeamSubLevel('Jun.B S17')).toBe(17);
  });

  it('parses "Jun.F S9" → 9', () => {
    expect(parseZzTeamSubLevel('Jun.F S9')).toBe(9);
  });

  it('parses "Fut.7 Jun.A S19" → 19', () => {
    expect(parseZzTeamSubLevel('Fut.7 Jun.A S19')).toBe(19);
  });

  it('parses "Sub-13" fallback → 13', () => {
    expect(parseZzTeamSubLevel('Sub-13')).toBe(13);
  });

  it('parses "Sub-14 B" fallback → 14', () => {
    expect(parseZzTeamSubLevel('Sub-14 B')).toBe(14);
  });

  it('returns null for null/undefined', () => {
    expect(parseZzTeamSubLevel(null)).toBeNull();
    expect(parseZzTeamSubLevel(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseZzTeamSubLevel('')).toBeNull();
  });

  it('returns null for senior teams', () => {
    expect(parseZzTeamSubLevel('Senior A')).toBeNull();
    expect(parseZzTeamSubLevel('Equipa Principal')).toBeNull();
  });
});

/* ───────────── detectPlayingUp ───────────── */

describe('detectPlayingUp', () => {
  const endYear = getSeasonEndYear();

  function makePlayer(birthYear: number, teamStr: string | undefined) {
    return {
      dob: `${birthYear}-06-15`,
      zzTeamHistory: teamStr
        ? [{ club: 'FC Teste', team: teamStr, season: '2025/26', games: 10, goals: 3 }]
        : [{ club: 'FC Teste', season: '2025/26', games: 10, goals: 3 }],
    };
  }

  it('detects playing up: Sub-14 natural in S15 team (+1 year)', () => {
    // Born in endYear-14 → natural Sub-14, team is Sub-15 (older generation) → 1 year above
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.C S15'));
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.naturalAge).toBe(14);
      expect(result.teamAge).toBe(15);
      expect(result.yearsAbove).toBe(1);
    }
  });

  it('detects playing up: Sub-14 natural in S17 team (+3 years)', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.A S17'));
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.yearsAbove).toBe(3);
    }
  });

  it('returns false for natural age group (Sub-14 in S14)', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.C S14'));
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false for playing down (Sub-14 in S13)', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.D S13'));
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false when no DOB', () => {
    const result = detectPlayingUp({ dob: null, zzTeamHistory: [{ team: 'Jun.C S13', season: '2025/26' }] });
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false when no team history', () => {
    const result = detectPlayingUp({ dob: '2012-01-01', zzTeamHistory: null });
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false when team history has no team field', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, undefined));
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false when team string has no escalão', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [{ team: 'Senior A', season: '2025/26' }],
    });
    expect(result.isPlayingUp).toBe(false);
  });

  it('handles Sub- format in team string', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Sub-15'));
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.yearsAbove).toBe(1);
    }
  });

  it('skips entries without team and uses first with team', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { season: '2025/26' },
        { team: 'Jun.C S15', season: '2025/26' },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.yearsAbove).toBe(1);
    }
  });
});

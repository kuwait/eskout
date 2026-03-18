// src/lib/utils/__tests__/playing-up.test.ts
// Tests for playing-up detection — ZZ team escalão parsing + age comparison
// Verifies correct identification of players competing above their natural age group
// RELEVANT FILES: src/lib/utils/playing-up.ts, src/lib/constants.ts

import { parseZzTeamSubLevel, isMainTeam, detectPlayingUp } from '@/lib/utils/playing-up';

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

/* ───────────── isMainTeam ───────────── */

describe('isMainTeam', () => {
  it('"Jun.C S15" → true (no suffix = main team)', () => {
    expect(isMainTeam('Jun.C S15')).toBe(true);
  });

  it('"Jun.B S17" → true (no suffix)', () => {
    expect(isMainTeam('Jun.B S17')).toBe(true);
  });

  it('"Jun.C S15 A" → true (explicit A)', () => {
    expect(isMainTeam('Jun.C S15 A')).toBe(true);
  });

  it('"Jun.C S15 B" → false (B team)', () => {
    expect(isMainTeam('Jun.C S15 B')).toBe(false);
  });

  it('"Jun.C S15 C" → false (C team)', () => {
    expect(isMainTeam('Jun.C S15 C')).toBe(false);
  });

  it('"Sub-13 B" → false (B team)', () => {
    expect(isMainTeam('Sub-13 B')).toBe(false);
  });

  it('"Sub-13" → true (no suffix)', () => {
    expect(isMainTeam('Sub-13')).toBe(true);
  });

  it('null → false', () => {
    expect(isMainTeam(null)).toBe(false);
  });

  it('"Fut.7 Jun.E S11" → true (no division suffix after S11)', () => {
    expect(isMainTeam('Fut.7 Jun.E S11')).toBe(true);
  });

  it('"Jun.D S13 D" → false (D team)', () => {
    expect(isMainTeam('Jun.D S13 D')).toBe(false);
  });

  it('empty string → false', () => {
    expect(isMainTeam('')).toBe(false);
  });
});

/* ───────────── detectPlayingUp — regularity ───────────── */

describe('detectPlayingUp — regularity thresholds', () => {
  const endYear = getSeasonEndYear();

  it('30% threshold: 3 of 10 = 30% → regular', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 3 },
        { team: 'Jun.C S15 B', season: '2025/26', games: 7 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) expect(result.regular).toBe(true);
  });

  it('29% threshold: 2 of 7 = 28.6% → pontual', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 2 },
        { team: 'Jun.C S15 B', season: '2025/26', games: 5 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) expect(result.regular).toBe(false);
  });

  it('100% in main team → regular', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 20 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) expect(result.regular).toBe(true);
  });

  it('0 games in all entries → regular (no games to compare)', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 0 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) expect(result.regular).toBe(true);
  });

  it('ignores previous season entries for regularity', () => {
    // Current season: only B team. Previous season: main team above.
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15 B', season: '2025/26', games: 15 },
        { team: 'Jun.C S15', season: '2024/25', games: 20 },
      ],
    });
    expect(result.isPlayingUp).toBe(false);
  });

  it('multiple escalões above in same season: uses highest', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 13}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.B S15', season: '2025/26', games: 5 },
        { team: 'Jun.C S14', season: '2025/26', games: 10 },
      ],
    });
    // Both are above Sub-13. S15 is main (no suffix), so detects +2
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.yearsAbove).toBe(2);
    }
  });
});

/* ───────────── detectPlayingUp — basic ───────────── */

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

  it('returns false for B team (Sub-14 in S15 B — secondary team)', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.C S15 B'));
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns false for C team (Sub-14 in S15 C — secondary team)', () => {
    const result = detectPlayingUp(makePlayer(endYear - 14, 'Jun.C S15 C'));
    expect(result.isPlayingUp).toBe(false);
  });

  it('skips B/C entries and finds main team entry', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15 B', season: '2025/26' },
        { team: 'Jun.C S15', season: '2025/26' },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.yearsAbove).toBe(1);
    }
  });

  it('returns false when only B/C teams exist', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15 B', season: '2025/26', games: 10 },
        { team: 'Jun.C S15 C', season: '2025/26', games: 5 },
      ],
    });
    expect(result.isPlayingUp).toBe(false);
  });

  it('returns "já jogou acima" when main team games are minority (2 of 17 — pontual)', () => {
    // Like Guilherme: 2 games in S15 A, 15 games in S15 B → not regular
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 2 },
        { team: 'Jun.C S15 B', season: '2025/26', games: 15 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.regular).toBe(false);
    }
  });

  it('detects regular playing up when ≥30% games in main team above', () => {
    // 6 of 16 = 37.5% → regular
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 6 },
        { team: 'Jun.C S15 B', season: '2025/26', games: 10 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.regular).toBe(true);
    }
  });

  it('detects regular when only main team entry exists', () => {
    const result = detectPlayingUp({
      dob: `${endYear - 14}-06-15`,
      zzTeamHistory: [
        { team: 'Jun.C S15', season: '2025/26', games: 10 },
      ],
    });
    expect(result.isPlayingUp).toBe(true);
    if (result.isPlayingUp) {
      expect(result.regular).toBe(true);
    }
  });

  it('skips entries without team and uses first main team', () => {
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

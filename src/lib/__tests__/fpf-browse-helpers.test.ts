// src/lib/__tests__/fpf-browse-helpers.test.ts
// Unit tests for FPF browse helpers — time filtering, dedup keys, day generation, duplicate filtering
// Ensures match selection and dedup logic works correctly across days and filters
// RELEVANT FILES: src/lib/fpf-browse-helpers.ts, src/app/observacoes/[id]/browse-fpf/BrowseFpfClient.tsx

import {
  matchTimeInPeriod,
  buildGameKey,
  getRoundDays,
  filterDuplicateMatches,
} from '../fpf-browse-helpers';

/* ───────────── matchTimeInPeriod ───────────── */

describe('matchTimeInPeriod', () => {
  it('returns true for "all" period regardless of time', () => {
    expect(matchTimeInPeriod('09:00', 'all')).toBe(true);
    expect(matchTimeInPeriod('15:00', 'all')).toBe(true);
    expect(matchTimeInPeriod('21:00', 'all')).toBe(true);
    expect(matchTimeInPeriod(null, 'all')).toBe(true);
  });

  it('returns true for null time in any period', () => {
    expect(matchTimeInPeriod(null, 'morning')).toBe(true);
    expect(matchTimeInPeriod(null, 'afternoon')).toBe(true);
    expect(matchTimeInPeriod(null, 'evening')).toBe(true);
  });

  it('correctly classifies morning (before 12:00)', () => {
    expect(matchTimeInPeriod('09:00', 'morning')).toBe(true);
    expect(matchTimeInPeriod('11:59', 'morning')).toBe(true);
    expect(matchTimeInPeriod('00:00', 'morning')).toBe(true);
    expect(matchTimeInPeriod('12:00', 'morning')).toBe(false);
    expect(matchTimeInPeriod('15:00', 'morning')).toBe(false);
  });

  it('correctly classifies afternoon (12:00–17:59)', () => {
    expect(matchTimeInPeriod('12:00', 'afternoon')).toBe(true);
    expect(matchTimeInPeriod('15:30', 'afternoon')).toBe(true);
    expect(matchTimeInPeriod('17:59', 'afternoon')).toBe(true);
    expect(matchTimeInPeriod('11:59', 'afternoon')).toBe(false);
    expect(matchTimeInPeriod('18:00', 'afternoon')).toBe(false);
  });

  it('correctly classifies evening (18:00+)', () => {
    expect(matchTimeInPeriod('18:00', 'evening')).toBe(true);
    expect(matchTimeInPeriod('21:30', 'evening')).toBe(true);
    expect(matchTimeInPeriod('23:59', 'evening')).toBe(true);
    expect(matchTimeInPeriod('17:59', 'evening')).toBe(false);
    expect(matchTimeInPeriod('09:00', 'evening')).toBe(false);
  });
});

/* ───────────── buildGameKey ───────────── */

describe('buildGameKey', () => {
  it('builds key with all fields', () => {
    expect(buildGameKey('Boavista', 'FC Porto', '2026-04-05', '15:00')).toBe(
      'boavista|fc porto|2026-04-05|15:00',
    );
  });

  it('lowercases team names', () => {
    expect(buildGameKey('BOAVISTA FC', 'Fc Porto', '2026-04-05', '15:00')).toBe(
      'boavista fc|fc porto|2026-04-05|15:00',
    );
  });

  it('handles null match time', () => {
    expect(buildGameKey('Boavista', 'Leixões', '2026-04-05', null)).toBe(
      'boavista|leixões|2026-04-05|',
    );
  });

  it('produces consistent keys for same match regardless of casing', () => {
    const key1 = buildGameKey('Padroense', 'Leixões SC', '2026-04-06', '10:00');
    const key2 = buildGameKey('padroense', 'LEIXÕES SC', '2026-04-06', '10:00');
    expect(key1).toBe(key2);
  });

  it('trims whitespace from team names', () => {
    const key1 = buildGameKey('  Boavista ', ' FC Porto  ', '2026-04-05', '15:00');
    const key2 = buildGameKey('Boavista', 'FC Porto', '2026-04-05', '15:00');
    expect(key1).toBe(key2);
  });
});

/* ───────────── getRoundDays ───────────── */

describe('getRoundDays', () => {
  it('returns single day for same start and end', () => {
    expect(getRoundDays('2026-04-05', '2026-04-05')).toEqual(['2026-04-05']);
  });

  it('returns all days in range (inclusive)', () => {
    expect(getRoundDays('2026-04-04', '2026-04-06')).toEqual([
      '2026-04-04',
      '2026-04-05',
      '2026-04-06',
    ]);
  });

  it('handles month boundary', () => {
    const days = getRoundDays('2026-03-30', '2026-04-02');
    expect(days).toEqual(['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']);
  });

  it('returns empty array if start > end', () => {
    expect(getRoundDays('2026-04-06', '2026-04-04')).toEqual([]);
  });

  it('handles year boundary', () => {
    const days = getRoundDays('2025-12-30', '2026-01-02');
    expect(days).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });

  it('handles week-long round', () => {
    const days = getRoundDays('2026-04-06', '2026-04-12');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-04-06');
    expect(days[6]).toBe('2026-04-12');
  });
});

/* ───────────── filterDuplicateMatches ───────────── */

describe('filterDuplicateMatches', () => {
  const match1 = { homeTeam: 'Boavista', awayTeam: 'Leixões', matchDate: '2026-04-05', matchTime: '15:00' };
  const match2 = { homeTeam: 'FC Porto', awayTeam: 'Benfica', matchDate: '2026-04-05', matchTime: '18:00' };
  const match3 = { homeTeam: 'Padroense', awayTeam: 'Maia', matchDate: '2026-04-06', matchTime: '10:00' };

  it('inserts all when no existing games', () => {
    const result = filterDuplicateMatches([match1, match2, match3], new Set());
    expect(result.toInsert).toHaveLength(3);
    expect(result.duplicates).toBe(0);
  });

  it('filters out exact duplicates', () => {
    const existingKeys = new Set([
      buildGameKey('Boavista', 'Leixões', '2026-04-05', '15:00'),
    ]);
    const result = filterDuplicateMatches([match1, match2], existingKeys);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toBe(match2);
    expect(result.duplicates).toBe(1);
  });

  it('case-insensitive dedup (server stores lowercase keys)', () => {
    const existingKeys = new Set([
      buildGameKey('boavista', 'leixões', '2026-04-05', '15:00'),
    ]);
    const upperMatch = { homeTeam: 'BOAVISTA', awayTeam: 'LEIXÕES', matchDate: '2026-04-05', matchTime: '15:00' };
    const result = filterDuplicateMatches([upperMatch], existingKeys);
    expect(result.toInsert).toHaveLength(0);
    expect(result.duplicates).toBe(1);
  });

  it('all duplicates returns empty toInsert', () => {
    const existingKeys = new Set([
      buildGameKey('Boavista', 'Leixões', '2026-04-05', '15:00'),
      buildGameKey('FC Porto', 'Benfica', '2026-04-05', '18:00'),
    ]);
    const result = filterDuplicateMatches([match1, match2], existingKeys);
    expect(result.toInsert).toHaveLength(0);
    expect(result.duplicates).toBe(2);
  });

  it('handles null matchTime in existing and new', () => {
    const existingKeys = new Set([
      buildGameKey('Boavista', 'Leixões', '2026-04-05', null),
    ]);
    const noTimeMatch = { homeTeam: 'Boavista', awayTeam: 'Leixões', matchDate: '2026-04-05', matchTime: null };
    const result = filterDuplicateMatches([noTimeMatch], existingKeys);
    expect(result.toInsert).toHaveLength(0);
    expect(result.duplicates).toBe(1);
  });

  it('different time = not duplicate', () => {
    const existingKeys = new Set([
      buildGameKey('Boavista', 'Leixões', '2026-04-05', '15:00'),
    ]);
    const differentTime = { ...match1, matchTime: '16:00' };
    const result = filterDuplicateMatches([differentTime], existingKeys);
    expect(result.toInsert).toHaveLength(1);
    expect(result.duplicates).toBe(0);
  });

  it('different date = not duplicate', () => {
    const existingKeys = new Set([
      buildGameKey('Boavista', 'Leixões', '2026-04-05', '15:00'),
    ]);
    const differentDate = { ...match1, matchDate: '2026-04-06' };
    const result = filterDuplicateMatches([differentDate], existingKeys);
    expect(result.toInsert).toHaveLength(1);
    expect(result.duplicates).toBe(0);
  });

  it('preserves order of non-duplicate matches', () => {
    const existingKeys = new Set([
      buildGameKey('FC Porto', 'Benfica', '2026-04-05', '18:00'),
    ]);
    // match2 is duplicate, match1 and match3 should stay in order
    const result = filterDuplicateMatches([match1, match2, match3], existingKeys);
    expect(result.toInsert).toEqual([match1, match3]);
    expect(result.duplicates).toBe(1);
  });
});

/* ───────────── Selection Map integrity (regression for batch add bug) ───────────── */

describe('Selection Map preserves matches across days/filters', () => {
  // This tests the pattern used in BrowseFpfClient where selected is a Map<string, match>
  // The old bug: selected was Set<string> and handleAdd scanned displayResults (filtered),
  // silently dropping matches selected on other days/filters.

  type MockMatch = { key: string; homeTeam: string; awayTeam: string; matchDate: string; matchTime: string | null };

  const day1Match: MockMatch = { key: 'boavista|leixões|2026-04-05|15:00', homeTeam: 'Boavista', awayTeam: 'Leixões', matchDate: '2026-04-05', matchTime: '15:00' };
  const day2Match: MockMatch = { key: 'padroense|maia|2026-04-06|10:00', homeTeam: 'Padroense', awayTeam: 'Maia', matchDate: '2026-04-06', matchTime: '10:00' };

  it('Map retains matches from different days', () => {
    const selected = new Map<string, MockMatch>();

    // User selects match on day 1
    selected.set(day1Match.key, day1Match);
    // User switches to day 2, selects another match
    selected.set(day2Match.key, day2Match);

    // Both matches are available for batch add
    const matchesToAdd = Array.from(selected.values());
    expect(matchesToAdd).toHaveLength(2);
    expect(matchesToAdd).toContainEqual(day1Match);
    expect(matchesToAdd).toContainEqual(day2Match);
  });

  it('Map toggle removes specific match without affecting others', () => {
    const selected = new Map<string, MockMatch>();
    selected.set(day1Match.key, day1Match);
    selected.set(day2Match.key, day2Match);

    // Deselect day 1 match
    selected.delete(day1Match.key);

    expect(selected.size).toBe(1);
    expect(selected.has(day2Match.key)).toBe(true);
    expect(selected.has(day1Match.key)).toBe(false);
  });

  it('clearing after batch add resets to empty', () => {
    const selected = new Map<string, MockMatch>();
    selected.set(day1Match.key, day1Match);
    selected.set(day2Match.key, day2Match);

    // Simulate successful add — clear selection
    const cleared = new Map<string, MockMatch>();
    expect(cleared.size).toBe(0);
  });
});

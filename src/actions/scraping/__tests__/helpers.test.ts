// src/actions/scraping/__tests__/helpers.test.ts
// Unit tests for scraping helper functions — FPF season ID, country normalization, club matching
// Ensures season computation, country fixes, and fuzzy club matching work correctly
// RELEVANT FILES: src/actions/scraping/helpers.ts, src/actions/scraping/fpf-club-import.ts

import { getFpfSeasonId, normalizeCountry, clubsMatch, normalizeClubName, calcAgeFromDob } from '../helpers';

/* ───────────── getFpfSeasonId ───────────── */

describe('getFpfSeasonId', () => {
  it('returns 105 for Oct 2025 (2025/26 season)', () => {
    expect(getFpfSeasonId(new Date(2025, 9, 15))).toBe(105);
  });

  it('returns 105 for Jan 2026 (still 2025/26 season)', () => {
    expect(getFpfSeasonId(new Date(2026, 0, 10))).toBe(105);
  });

  it('returns 105 for Jun 2026 (still 2025/26 — season ends June 30)', () => {
    expect(getFpfSeasonId(new Date(2026, 5, 30))).toBe(105);
  });

  it('returns 106 for Jul 2026 (2026/27 season starts)', () => {
    expect(getFpfSeasonId(new Date(2026, 6, 1))).toBe(106);
  });

  it('returns 95 for Jul 2015 (baseline — 2015/16 season)', () => {
    expect(getFpfSeasonId(new Date(2015, 6, 1))).toBe(95);
  });

  it('returns 100 for Dec 2020 (2020/21 season)', () => {
    expect(getFpfSeasonId(new Date(2020, 11, 25))).toBe(100);
  });
});

/* ───────────── normalizeCountry ───────────── */

describe('normalizeCountry', () => {
  it('returns null for null input', () => {
    expect(normalizeCountry(null)).toBeNull();
  });

  it('fixes "Guine Bissau" → "Guiné-Bissau"', () => {
    expect(normalizeCountry('Guine Bissau')).toBe('Guiné-Bissau');
  });

  it('fixes "guine-bissau" (case-insensitive)', () => {
    expect(normalizeCountry('guine-bissau')).toBe('Guiné-Bissau');
  });

  it('fixes "Mocambique" → "Moçambique"', () => {
    expect(normalizeCountry('Mocambique')).toBe('Moçambique');
  });

  it('passes through correct names unchanged', () => {
    expect(normalizeCountry('Portugal')).toBe('Portugal');
  });

  it('handles whitespace', () => {
    expect(normalizeCountry('  Cabo Verde  ')).toBe('Cabo Verde');
  });
});

/* ───────────── clubsMatch ───────────── */

describe('clubsMatch', () => {
  it('exact match', () => {
    expect(clubsMatch('Boavista FC', 'Boavista FC')).toBe(true);
  });

  it('matches after removing "FC"', () => {
    expect(clubsMatch('Boavista FC', 'Boavista')).toBe(true);
  });

  it('matches after removing "Futebol Clube"', () => {
    expect(clubsMatch('Futebol Clube do Porto', 'Porto')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(clubsMatch('', 'Porto')).toBe(false);
    expect(clubsMatch('Boavista', '')).toBe(false);
  });

  it('returns false for clearly different clubs', () => {
    expect(clubsMatch('Boavista', 'Benfica')).toBe(false);
  });

  it('prevents false positives on short substrings', () => {
    // "foz" is too short relative to "paraíso foz"
    expect(clubsMatch('Foz', 'Paraíso Foz')).toBe(false);
  });
});

/* ───────────── normalizeClubName ───────────── */

describe('normalizeClubName', () => {
  it('removes "FC" and normalizes whitespace', () => {
    expect(normalizeClubName('Boavista FC')).toBe('boavista');
  });

  it('removes "F.C." with dots', () => {
    expect(normalizeClubName('F.C. Porto')).toBe('porto');
  });

  it('removes punctuation', () => {
    expect(normalizeClubName("Sporting (B) - Lisbon")).toBe('sporting b lisbon');
  });
});

/* ───────────── calcAgeFromDob ───────────── */

describe('calcAgeFromDob', () => {
  it('calculates correct age', () => {
    // Use a fixed reference: if today is 2026-03-12, someone born 2011-01-15 is 15
    const age = calcAgeFromDob('2011-01-15');
    const now = new Date();
    const expected = now.getFullYear() - 2011 - (now < new Date(now.getFullYear(), 0, 15) ? 1 : 0);
    expect(age).toBe(expected);
  });

  it('subtracts 1 if birthday has not occurred yet this year', () => {
    const futureMonth = new Date();
    futureMonth.setMonth(futureMonth.getMonth() + 2);
    const futureDob = `2010-${String(futureMonth.getMonth() + 1).padStart(2, '0')}-28`;
    const age = calcAgeFromDob(futureDob);
    expect(age).toBe(new Date().getFullYear() - 2010 - 1);
  });
});

// src/lib/__tests__/utils.test.ts
// Tests for general utility functions (fuzzyMatch, cn)
// Pure functions with no dependencies on DB or browser APIs
// RELEVANT FILES: src/lib/utils.ts

import { fuzzyMatch } from '@/lib/utils';

/* ───────────── fuzzyMatch ───────────── */

describe('fuzzyMatch', () => {
  it('matches single term anywhere in target', () => {
    expect(fuzzyMatch('Afonso Filipe Oliveira Rodrigues', 'afonso')).toBe(true);
    expect(fuzzyMatch('Afonso Filipe Oliveira Rodrigues', 'rodrigues')).toBe(true);
  });

  it('matches multiple terms (all must appear)', () => {
    expect(fuzzyMatch('Afonso Filipe Oliveira Rodrigues', 'Afo Rodr')).toBe(true);
    expect(fuzzyMatch('Afonso Filipe Oliveira Rodrigues', 'filipe oliveira')).toBe(true);
  });

  it('fails when any term is missing', () => {
    expect(fuzzyMatch('Afonso Filipe Oliveira Rodrigues', 'Afo Silva')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('Boavista FC', 'BOAVISTA')).toBe(true);
    expect(fuzzyMatch('Boavista FC', 'boavista fc')).toBe(true);
  });

  it('matches empty query to anything', () => {
    expect(fuzzyMatch('Anything', '')).toBe(true);
    expect(fuzzyMatch('Anything', '   ')).toBe(true);
  });

  it('handles empty target', () => {
    expect(fuzzyMatch('', 'search')).toBe(false);
  });
});

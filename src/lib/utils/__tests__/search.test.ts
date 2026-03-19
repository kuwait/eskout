// src/lib/utils/__tests__/search.test.ts
// Tests for multi-word picker search — cross-field matching (name + club)
// Validates word extraction and matching logic for player search dialogs
// RELEVANT FILES: src/lib/utils/search.ts, src/actions/player-lists.ts

import { extractSearchWords, matchesPickerSearch, stripAccents } from '@/lib/utils/search';

/* ───────────── extractSearchWords ───────────── */

describe('extractSearchWords', () => {
  it('returns empty array for empty/whitespace input', () => {
    expect(extractSearchWords('')).toEqual([]);
    expect(extractSearchWords('   ')).toEqual([]);
  });

  it('filters out single-char words', () => {
    expect(extractSearchWords('a carlos b')).toEqual(['carlos']);
  });

  it('returns up to 3 words unchanged', () => {
    expect(extractSearchWords('carlos soares')).toEqual(['carlos', 'soares']);
    expect(extractSearchWords('carlos soares hernani')).toEqual(['carlos', 'soares', 'hernani']);
  });

  it('picks first, second-to-last, and last for 4+ words', () => {
    expect(extractSearchWords('carlos miguel soares hernani')).toEqual(['carlos', 'soares', 'hernani']);
    expect(extractSearchWords('joão pedro da silva santos')).toEqual(['joão', 'silva', 'santos']);
  });
});

/* ───────────── stripAccents ───────────── */

describe('stripAccents', () => {
  it('removes Portuguese diacritics', () => {
    expect(stripAccents('Hernâni')).toBe('Hernani');
    expect(stripAccents('João')).toBe('Joao');
    expect(stripAccents('André')).toBe('Andre');
    expect(stripAccents('Gonçalves')).toBe('Goncalves');
    expect(stripAccents('José María')).toBe('Jose Maria');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(stripAccents('Carlos Soares')).toBe('Carlos Soares');
  });
});

/* ───────────── matchesPickerSearch ───────────── */

describe('matchesPickerSearch', () => {
  it('matches all words in name', () => {
    const player = { name: 'Carlos Miguel Soares', club: 'Boavista FC' };
    expect(matchesPickerSearch(player, ['carlos', 'soares'])).toBe(true);
  });

  it('matches all words in club', () => {
    const player = { name: 'João Silva', club: 'Sporting Clube de Braga' };
    expect(matchesPickerSearch(player, ['sporting', 'braga'])).toBe(true);
  });

  it('matches words across name AND club (cross-field)', () => {
    const player = { name: 'Carlos Soares', club: 'Hernani' };
    expect(matchesPickerSearch(player, ['carlos', 'soares', 'hernani'])).toBe(true);
  });

  it('matches real DB case: "carlos soares hernani" vs accented club name', () => {
    // Real player: name="Carlos Filipe Da Silva Moreira Soares", club="A.J.E.F. Hernâni Gonçalves"
    const player = { name: 'Carlos Filipe Da Silva Moreira Soares', club: 'A.J.E.F. Hernâni Gonçalves' };
    expect(matchesPickerSearch(player, ['carlos', 'soares', 'hernani'])).toBe(true);
  });

  it('matches first word in club, rest in name', () => {
    const player = { name: 'Miguel Santos', club: 'Hernani' };
    expect(matchesPickerSearch(player, ['hernani', 'miguel'])).toBe(true);
  });

  it('is case-insensitive', () => {
    const player = { name: 'Carlos Soares', club: 'Hernani' };
    expect(matchesPickerSearch(player, ['CARLOS', 'Hernani'])).toBe(true);
  });

  it('is accent-insensitive', () => {
    const player = { name: 'João André', club: 'Hernâni FC' };
    expect(matchesPickerSearch(player, ['joao', 'hernani'])).toBe(true);
    expect(matchesPickerSearch(player, ['andré', 'hernâni'])).toBe(true);
  });

  it('rejects when a word is missing from both fields', () => {
    const player = { name: 'Carlos Soares', club: 'Boavista FC' };
    expect(matchesPickerSearch(player, ['carlos', 'hernani'])).toBe(false);
  });

  it('returns true for empty search words', () => {
    const player = { name: 'Carlos Soares', club: 'Boavista FC' };
    expect(matchesPickerSearch(player, [])).toBe(true);
  });

  it('handles null/undefined club', () => {
    const player = { name: 'Carlos Soares', club: null };
    expect(matchesPickerSearch(player, ['carlos'])).toBe(true);
    expect(matchesPickerSearch(player, ['hernani'])).toBe(false);
  });

  it('handles partial word matches', () => {
    const player = { name: 'Carlos Soares', club: 'FC Hernani' };
    expect(matchesPickerSearch(player, ['carl', 'hern'])).toBe(true);
  });
});

// src/lib/utils/__tests__/player-name.test.ts
// Tests for compactName — the abbreviation rule used by narrow squad cards
// Wrong abbreviation here would make name display inconsistent across views
// RELEVANT FILES: src/lib/utils/player-name.ts, src/components/squad/FormationSlot.tsx

import { compactName } from '../player-name';

describe('compactName', () => {
  it('returns single-word names unchanged', () => {
    expect(compactName('Pelé')).toBe('Pelé');
    expect(compactName('Ronaldinho')).toBe('Ronaldinho');
  });

  it('returns "F. Last" for two-word names', () => {
    expect(compactName('Cristiano Ronaldo')).toBe('C. Ronaldo');
    expect(compactName('Salvador Pereira')).toBe('S. Pereira');
  });

  it('drops middle names — initial of first + last only', () => {
    expect(compactName('Cristiano Ronaldo dos Santos Aveiro')).toBe('C. Aveiro');
    expect(compactName('Luís Filipe Madeira Caeiro Figo')).toBe('L. Figo');
  });

  it('handles extra whitespace', () => {
    expect(compactName('  Cristiano   Ronaldo  ')).toBe('C. Ronaldo');
    expect(compactName('Cristiano\tRonaldo')).toBe('C. Ronaldo');
  });

  it('returns empty input as-is', () => {
    expect(compactName('')).toBe('');
    expect(compactName('   ')).toBe('   ');
  });

  it('keeps accented characters in the last name', () => {
    expect(compactName('Bruno Saraiva da Silva')).toBe('B. Silva');
    expect(compactName('Diogo Jota')).toBe('D. Jota');
  });

  it('uses the first character (including accents) for the initial', () => {
    expect(compactName('Álvaro Pereira')).toBe('Á. Pereira');
    expect(compactName('Émile Smith')).toBe('É. Smith');
  });
});

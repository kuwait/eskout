// src/lib/utils/__tests__/author-name.test.ts
// Unit tests for author name normalization (dedup + display consistency)
// Cobre strip de prefixos honoríficos e canonical key para dropdown dedup
// RELEVANT FILES: src/lib/utils/author-name.ts

import { stripCoachPrefix, canonicalAuthorKey } from '../author-name';

/* ───────────── stripCoachPrefix ───────────── */

describe('stripCoachPrefix', () => {
  it('strips "Mister" prefix', () => {
    expect(stripCoachPrefix('Mister João')).toBe('João');
  });

  it('strips "Mr." prefix', () => {
    expect(stripCoachPrefix('Mr. João')).toBe('João');
  });

  it('strips "Mr" without dot', () => {
    expect(stripCoachPrefix('Mr João')).toBe('João');
  });

  it('strips "Sr." prefix', () => {
    expect(stripCoachPrefix('Sr. João')).toBe('João');
  });

  it('strips "Prof." prefix', () => {
    expect(stripCoachPrefix('Prof. João')).toBe('João');
  });

  it('strips "Professor" prefix', () => {
    expect(stripCoachPrefix('Professor João')).toBe('João');
  });

  it('strips "Treinador" prefix', () => {
    expect(stripCoachPrefix('Treinador João')).toBe('João');
  });

  it('strips prefixes case-insensitively', () => {
    expect(stripCoachPrefix('MISTER João')).toBe('João');
    expect(stripCoachPrefix('mister João')).toBe('João');
  });

  it('strips stacked prefixes', () => {
    expect(stripCoachPrefix('Mister Mister João')).toBe('João');
    expect(stripCoachPrefix('Mister Mr. João')).toBe('João');
  });

  it('collapses internal whitespace', () => {
    expect(stripCoachPrefix('João   Sousa')).toBe('João Sousa');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripCoachPrefix('  João Sousa  ')).toBe('João Sousa');
  });

  it('leaves clean names untouched', () => {
    expect(stripCoachPrefix('João Sousa')).toBe('João Sousa');
  });

  it('does not strip prefix-like words in the middle', () => {
    // "Mr." só é stripado no início
    expect(stripCoachPrefix('João Mr. Sousa')).toBe('João Mr. Sousa');
  });

  it('does not strip the word "Mister" when attached (no space)', () => {
    expect(stripCoachPrefix('MisterJoão')).toBe('MisterJoão');
  });

  it('handles empty string', () => {
    expect(stripCoachPrefix('')).toBe('');
  });
});

/* ───────────── canonicalAuthorKey ───────────── */

describe('canonicalAuthorKey', () => {
  it('groups "João Sousa" and "Mister João Sousa" under same key', () => {
    expect(canonicalAuthorKey('João Sousa')).toBe(canonicalAuthorKey('Mister João Sousa'));
  });

  it('groups accented and unaccented variants', () => {
    expect(canonicalAuthorKey('João')).toBe(canonicalAuthorKey('Joao'));
  });

  it('groups different casings', () => {
    expect(canonicalAuthorKey('JOÃO SOUSA')).toBe(canonicalAuthorKey('joão sousa'));
  });

  it('separates distinct names', () => {
    expect(canonicalAuthorKey('João')).not.toBe(canonicalAuthorKey('Diogo'));
  });

  it('separates names with same first name but different surnames', () => {
    expect(canonicalAuthorKey('João Sousa')).not.toBe(canonicalAuthorKey('João Silva'));
  });

  it('groups "Mr. Diogo" with "Diogo"', () => {
    expect(canonicalAuthorKey('Mr. Diogo')).toBe(canonicalAuthorKey('Diogo'));
  });

  it('returns lowercase result', () => {
    expect(canonicalAuthorKey('João')).toBe('joao');
  });
});

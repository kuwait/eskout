// src/lib/utils/__tests__/positions.test.ts
// Tests for position normalization — maps free-text Portuguese strings to codes
// Covers all 15 position codes, ambiguous cases, and edge cases
// RELEVANT FILES: src/lib/utils/positions.ts, src/lib/constants.ts

import { normalizePosition } from '@/lib/utils/positions';

/* ───────────── Direct matches ───────────── */

describe('normalizePosition — direct matches', () => {
  it('maps GR variants', () => {
    expect(normalizePosition('GR')).toBe('GR');
    expect(normalizePosition('guarda-redes')).toBe('GR');
    expect(normalizePosition('Guarda Redes')).toBe('GR');
    expect(normalizePosition('goalkeeper')).toBe('GR');
  });

  it('maps DD variants', () => {
    expect(normalizePosition('DD')).toBe('DD');
    expect(normalizePosition('Lateral Direito')).toBe('DD');
    expect(normalizePosition('defesa direito')).toBe('DD');
  });

  it('maps DE variants', () => {
    expect(normalizePosition('DE')).toBe('DE');
    expect(normalizePosition('Lateral Esquerdo')).toBe('DE');
    expect(normalizePosition('defesa esquerdo')).toBe('DE');
    expect(normalizePosition('DE/DD')).toBe('DE');
  });

  it('maps DC variants', () => {
    expect(normalizePosition('DC')).toBe('DC');
    expect(normalizePosition('Defesa Central')).toBe('DC');
    expect(normalizePosition('defesa-central')).toBe('DC');
    expect(normalizePosition('DC/MDC')).toBe('DC');
    expect(normalizePosition('defesa')).toBe('DC');
  });

  it('maps MDC variants', () => {
    expect(normalizePosition('MDC')).toBe('MDC');
    expect(normalizePosition('Pivô')).toBe('MDC');
    expect(normalizePosition('pivo')).toBe('MDC');
    expect(normalizePosition('médio defensivo')).toBe('MDC');
    expect(normalizePosition('medio defensivo')).toBe('MDC');
  });

  it('maps MC variants', () => {
    expect(normalizePosition('MC')).toBe('MC');
    expect(normalizePosition('Médio Centro')).toBe('MC');
    expect(normalizePosition('medio centro')).toBe('MC');
    expect(normalizePosition('médio')).toBe('MC');
  });

  it('maps MOC variants', () => {
    expect(normalizePosition('MOC')).toBe('MOC');
    expect(normalizePosition('MCO')).toBe('MOC');
    expect(normalizePosition('Médio Ofensivo')).toBe('MOC');
    expect(normalizePosition('MC/MCO')).toBe('MOC');
    expect(normalizePosition('MC / MCO')).toBe('MOC');
  });

  it('maps ED variants', () => {
    expect(normalizePosition('ED')).toBe('ED');
    expect(normalizePosition('Extremo Direito')).toBe('ED');
    expect(normalizePosition('ED/PL')).toBe('ED');
  });

  it('maps EE variants', () => {
    expect(normalizePosition('EE')).toBe('EE');
    expect(normalizePosition('Extremo Esquerdo')).toBe('EE');
    expect(normalizePosition('EE/PL')).toBe('EE');
  });

  it('maps PL variants', () => {
    expect(normalizePosition('PL')).toBe('PL');
    expect(normalizePosition('Ponta de Lança')).toBe('PL');
    expect(normalizePosition('ponta de lanca')).toBe('PL');
    expect(normalizePosition('avançado')).toBe('PL');
    expect(normalizePosition('avancado')).toBe('PL');
  });

  it('maps MD, ME, AD, AE, SA variants', () => {
    expect(normalizePosition('MD')).toBe('MD');
    expect(normalizePosition('Médio Direito')).toBe('MD');
    expect(normalizePosition('ME')).toBe('ME');
    expect(normalizePosition('Médio Esquerdo')).toBe('ME');
    expect(normalizePosition('AD')).toBe('AD');
    expect(normalizePosition('Ala Direito')).toBe('AD');
    expect(normalizePosition('AE')).toBe('AE');
    expect(normalizePosition('Ala Esquerdo')).toBe('AE');
    expect(normalizePosition('SA')).toBe('SA');
    expect(normalizePosition('Segundo Avançado')).toBe('SA');
    expect(normalizePosition('2º Avançado')).toBe('SA');
  });
});

/* ───────────── Ambiguous cases ───────────── */

describe('normalizePosition — ambiguous', () => {
  it('returns empty for "Extremo" without side', () => {
    expect(normalizePosition('extremo')).toBe('');
    expect(normalizePosition('ext')).toBe('');
  });

  it('returns empty for "Ala" without side', () => {
    expect(normalizePosition('ala')).toBe('');
  });
});

/* ───────────── Edge cases ───────────── */

describe('normalizePosition — edge cases', () => {
  it('handles null and undefined', () => {
    expect(normalizePosition(null)).toBe('');
    expect(normalizePosition(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(normalizePosition('')).toBe('');
    expect(normalizePosition('  ')).toBe('');
  });

  it('is case-insensitive', () => {
    expect(normalizePosition('DEFESA CENTRAL')).toBe('DC');
    expect(normalizePosition('pOnTa De LaNçA')).toBe('PL');
  });

  it('returns empty for unknown positions', () => {
    expect(normalizePosition('Jogador Livre')).toBe('');
    expect(normalizePosition('xyz')).toBe('');
  });
});

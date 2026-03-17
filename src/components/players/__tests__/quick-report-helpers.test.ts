// src/components/players/__tests__/quick-report-helpers.test.ts
// Tests for pure helper functions used in Quick Report components
// Covers color scale, tag sentiment detection, display formatting
// RELEVANT FILES: src/components/players/QuickReportForm.tsx, src/components/players/QuickReportCard.tsx

import { getStarColor } from '@/components/players/QuickReportForm';
import { getTagSentiment, displayTag } from '@/components/players/QuickReportCard';

/* ───────────── getStarColor ───────────── */

describe('getStarColor', () => {
  it('returns red for value 1', () => {
    expect(getStarColor(1)).toBe('text-red-500');
  });

  it('returns orange for value 2', () => {
    expect(getStarColor(2)).toBe('text-orange-400');
  });

  it('returns sky for value 3', () => {
    expect(getStarColor(3)).toBe('text-sky-500');
  });

  it('returns teal for value 4', () => {
    expect(getStarColor(4)).toBe('text-teal-500');
  });

  it('returns green for value 5', () => {
    expect(getStarColor(5)).toBe('text-green-500');
  });

  it('uses Math.ceil for half-values', () => {
    expect(getStarColor(0.5)).toBe('text-red-500');     // ceil(0.5) = 1
    expect(getStarColor(1.5)).toBe('text-orange-400');   // ceil(1.5) = 2
    expect(getStarColor(2.5)).toBe('text-sky-500');      // ceil(2.5) = 3
    expect(getStarColor(3.5)).toBe('text-teal-500');     // ceil(3.5) = 4
    expect(getStarColor(4.5)).toBe('text-green-500');    // ceil(4.5) = 5
  });

  it('falls back to red for 0', () => {
    expect(getStarColor(0)).toBe('text-red-500');
  });
});

/* ───────────── getTagSentiment ───────────── */

describe('getTagSentiment', () => {
  it('returns negative for tag starting with ⊖', () => {
    expect(getTagSentiment('⊖ Mau passe', 'tecnica')).toBe('negative');
  });

  it('returns positive for tag starting with ⊕', () => {
    expect(getTagSentiment('⊕ Bom cabeceamento', 'tecnica')).toBe('positive');
  });

  it('returns positive for a known positive outfield tag', () => {
    expect(getTagSentiment('Passe', 'tecnica')).toBe('positive');
  });

  it('returns negative for a known negative outfield tag', () => {
    expect(getTagSentiment('Lento', 'fisico')).toBe('negative');
  });

  it('returns positive for a known positive GR tag', () => {
    expect(getTagSentiment('Reflexos', 'tecnica')).toBe('positive');
  });

  it('returns negative for a known negative GR tag', () => {
    expect(getTagSentiment('Hesitante nas saídas', 'tecnica')).toBe('negative');
  });

  it('returns positive (default) for an unknown tag', () => {
    expect(getTagSentiment('Tag desconhecido xyz', 'tecnica')).toBe('positive');
  });

  it('handles fisico dimension correctly', () => {
    expect(getTagSentiment('Rápido', 'fisico')).toBe('positive');
    expect(getTagSentiment('Franzino', 'fisico')).toBe('negative');
  });
});

/* ───────────── displayTag ───────────── */

describe('displayTag', () => {
  it('strips ⊕ prefix from custom positive tag', () => {
    expect(displayTag('⊕ Bom cabeceamento')).toBe('Bom cabeceamento');
  });

  it('strips ⊖ prefix from custom negative tag', () => {
    expect(displayTag('⊖ Mau passe')).toBe('Mau passe');
  });

  it('returns label unchanged for predefined tag', () => {
    expect(displayTag('Controlo de bola')).toBe('Controlo de bola');
  });

  it('handles empty string', () => {
    expect(displayTag('')).toBe('');
  });
});

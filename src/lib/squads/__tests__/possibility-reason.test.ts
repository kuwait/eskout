// src/lib/squads/__tests__/possibility-reason.test.ts
// Unit tests for normalizePossibilityReason — the pure helper used by both
// setSquadPlayerPossibilityReason (server action) and handleSetPossibilityReason (client).
// RELEVANT FILES: src/lib/squads/possibility-reason.ts, src/actions/squads.ts, src/components/squad/SquadPanelView.tsx

import { normalizePossibilityReason } from '../possibility-reason';

describe('normalizePossibilityReason', () => {
  /* ───────────── Empty / clearing ───────────── */

  it('null text → clears both text and color', () => {
    expect(normalizePossibilityReason(null, 'blue')).toEqual({ text: null, color: null });
  });

  it('undefined text → clears both', () => {
    expect(normalizePossibilityReason(undefined, 'red')).toEqual({ text: null, color: null });
  });

  it('empty string → clears both', () => {
    expect(normalizePossibilityReason('', 'green')).toEqual({ text: null, color: null });
  });

  it('whitespace-only text → clears both (color discarded)', () => {
    expect(normalizePossibilityReason('   ', 'purple')).toEqual({ text: null, color: null });
    expect(normalizePossibilityReason('\t\n', 'amber')).toEqual({ text: null, color: null });
  });

  /* ───────────── Valid text ───────────── */

  it('trims surrounding whitespace', () => {
    expect(normalizePossibilityReason('  Suplente  ', 'blue')).toEqual({ text: 'Suplente', color: 'blue' });
  });

  it('keeps inner whitespace intact', () => {
    expect(normalizePossibilityReason('A avaliar  em  2027', 'teal')).toEqual({
      text: 'A avaliar  em  2027',
      color: 'teal',
    });
  });

  it('passes through plain text + color', () => {
    expect(normalizePossibilityReason('Radar', 'rose')).toEqual({ text: 'Radar', color: 'rose' });
  });

  /* ───────────── Color without text ───────────── */

  it('color without text → both null (color only makes sense with a motivo)', () => {
    expect(normalizePossibilityReason('', 'pink')).toEqual({ text: null, color: null });
  });

  it('text without color → text kept, color null', () => {
    expect(normalizePossibilityReason('Futuro', null)).toEqual({ text: 'Futuro', color: null });
    expect(normalizePossibilityReason('Futuro', undefined)).toEqual({ text: 'Futuro', color: null });
  });

  /* ───────────── Edge cases ───────────── */

  it('single-char text is preserved', () => {
    expect(normalizePossibilityReason('X', 'slate')).toEqual({ text: 'X', color: 'slate' });
  });

  it('does not normalize the color itself — trusts the caller', () => {
    // The DB check constraint catches invalid colors; this helper is purely about text/color coupling.
    expect(normalizePossibilityReason('Potencial', 'not-a-valid-color' as unknown as string)).toEqual({
      text: 'Potencial',
      color: 'not-a-valid-color',
    });
  });
});

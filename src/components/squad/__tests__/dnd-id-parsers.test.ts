// src/components/squad/__tests__/dnd-id-parsers.test.ts
// Tests for parsePlayerDragId / parseDroppableId — the building blocks for cross-squad drag
// Wrong parsing here would break drag-and-drop in unpredictable ways
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/MultiShadowSquadView.tsx

import { parsePlayerDragId, parseDroppableId } from '../FormationView';

describe('parsePlayerDragId', () => {
  it('parses unscoped player IDs', () => {
    expect(parsePlayerDragId('player-42')).toEqual({ scope: null, playerId: 42 });
  });

  it('parses scoped player IDs (squadId-playerId)', () => {
    expect(parsePlayerDragId('player-7-42')).toEqual({ scope: 7, playerId: 42 });
  });

  it('returns null for non-player IDs', () => {
    expect(parsePlayerDragId('droppable-DC_E')).toBeNull();
    expect(parsePlayerDragId('foo-1')).toBeNull();
  });

  it('returns null for malformed numeric segments', () => {
    expect(parsePlayerDragId('player-abc')).toBeNull();
    expect(parsePlayerDragId('player-')).toBeNull();
  });

  it('treats partial-numeric scope strings as unscoped (e.g. trailing chars)', () => {
    // "player-7a-42" should NOT be parsed as scoped because "7a" is not a clean integer
    // Falls back to trying as unscoped; "7a-42" is not a valid integer either → null
    expect(parsePlayerDragId('player-7a-42')).toBeNull();
  });

  it('handles large IDs', () => {
    expect(parsePlayerDragId('player-99999')).toEqual({ scope: null, playerId: 99999 });
    expect(parsePlayerDragId('player-12345-99999')).toEqual({ scope: 12345, playerId: 99999 });
  });
});

describe('parseDroppableId', () => {
  it('parses unscoped slot IDs', () => {
    expect(parseDroppableId('droppable-DC_E')).toEqual({ scope: null, slot: 'DC_E' });
    expect(parseDroppableId('droppable-GR')).toEqual({ scope: null, slot: 'GR' });
  });

  it('parses scoped slot IDs', () => {
    expect(parseDroppableId('droppable-3-DC_E')).toEqual({ scope: 3, slot: 'DC_E' });
    expect(parseDroppableId('droppable-3-GR')).toEqual({ scope: 3, slot: 'GR' });
  });

  it('parses scoped special section IDs (DUVIDA / POSSIBILIDADE)', () => {
    expect(parseDroppableId('droppable-5-DUVIDA')).toEqual({ scope: 5, slot: 'DUVIDA' });
    expect(parseDroppableId('droppable-5-POSSIBILIDADE')).toEqual({ scope: 5, slot: 'POSSIBILIDADE' });
  });

  it('returns null for non-droppable IDs', () => {
    expect(parseDroppableId('player-42')).toBeNull();
    expect(parseDroppableId('foo-DC')).toBeNull();
  });

  it('keeps slot intact when slot starts with a digit-like segment but is not numeric', () => {
    // Hypothetical: slot like "DC2" — the dash split would give scope="DC2"? No — DC2 isn't a clean integer
    // so it falls back to unscoped with slot="DC2"
    expect(parseDroppableId('droppable-DC2')).toEqual({ scope: null, slot: 'DC2' });
  });
});

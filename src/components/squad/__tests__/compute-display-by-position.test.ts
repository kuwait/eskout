// src/components/squad/__tests__/compute-display-by-position.test.ts
// Tests for computeDisplayByPosition — the virtual cross-position drag preview helper
// Critical for preventing the duplicate-sortable-id crash when dragging out of a special section
// RELEVANT FILES: src/components/squad/FormationView.tsx, src/components/squad/SquadSpecialSection.tsx

import type { Player } from '@/lib/types';
import { computeDisplayByPosition, type DragVirtual } from '../FormationView';

/* ───────────── Fixtures ───────────── */

const makePlayer = (id: number, name = `P${id}`): Player => ({
  id,
  name,
  positionNormalized: 'DC',
} as Player);

const ana = makePlayer(1, 'Ana');
const bruno = makePlayer(2, 'Bruno');
const carlos = makePlayer(3, 'Carlos');

/* ───────────── No drag in progress ───────────── */

describe('computeDisplayByPosition — no drag', () => {
  it('returns the input byPosition unchanged when dragVirtual is null', () => {
    const byPos = { GR: [ana], DC_E: [bruno] };
    expect(computeDisplayByPosition(byPos, undefined, null, null)).toBe(byPos);
  });

  it('returns the input byPosition unchanged when activePlayer is null', () => {
    const byPos = { GR: [ana] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'DC_E', toIndex: 0 };
    expect(computeDisplayByPosition(byPos, undefined, dv, null)).toBe(byPos);
  });
});

/* ───────────── Pitch → pitch (the original happy path) ───────────── */

describe('computeDisplayByPosition — pitch slot to pitch slot', () => {
  it('moves the player out of the source slot and into the target slot at the given index', () => {
    const byPos = { GR: [ana], DC_E: [bruno, carlos] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'DC_E', toIndex: 1 };
    const result = computeDisplayByPosition(byPos, undefined, dv, ana);

    expect(result.GR).toEqual([]); // Ana removed from GR
    expect(result.DC_E.map((p) => p.id)).toEqual([2, 1, 3]); // Ana inserted at index 1
  });

  it('returns a fresh object — does not mutate the input', () => {
    const byPos = { GR: [ana], DC_E: [bruno] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'DC_E', toIndex: 0 };
    const result = computeDisplayByPosition(byPos, undefined, dv, ana);

    expect(result).not.toBe(byPos);
    expect(byPos.GR).toEqual([ana]); // Original untouched
    expect(byPos.DC_E).toEqual([bruno]);
  });

  it('creates the target slot when it does not exist in byPosition', () => {
    const byPos: Record<string, Player[]> = { GR: [ana] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'PL', toIndex: 0 };
    const result = computeDisplayByPosition(byPos, undefined, dv, ana);
    expect(result.PL).toEqual([ana]);
  });

  it('caps insertion index at end of target list (splice clamps automatically)', () => {
    const byPos = { GR: [ana], DC_E: [bruno] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'DC_E', toIndex: 99 };
    const result = computeDisplayByPosition(byPos, undefined, dv, ana);
    expect(result.DC_E.map((p) => p.id)).toEqual([2, 1]);
  });
});

/* ───────────── Special-section source: the crash regression guard ───────────── */

// Background: the special sections (POSSIBILIDADE, DUVIDA) are rendered by SquadSpecialSection,
// which is passed in as `children` to FormationView. FormationView only controls the pitch
// render via displayByPosition. If we virtually move a player from a special section into a
// pitch slot, the same `useSortable` id (`player-${id}`) ends up under TWO SortableContexts
// inside the same DndContext — the special section card stays mounted (we don't control it
// from here) AND the pitch slot now has a preview of the same player. dnd-kit treats this as
// a duplicate id and the whole drag crashes with an error.
//
// Fix: when the source is a special section, skip the destination preview entirely. The
// DragOverlay still floats the picked-up card so the user keeps visual feedback.

describe('computeDisplayByPosition — special-section source (POSSIBILIDADE / DUVIDA)', () => {
  it('does NOT insert the player into the target pitch slot when source is POSSIBILIDADE', () => {
    const byPos = { GR: [], DC_E: [bruno] };
    const sections = { POSSIBILIDADE: [ana], DUVIDA: [] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'POSSIBILIDADE', toSlot: 'DC_E', toIndex: 0 };

    const result = computeDisplayByPosition(byPos, sections, dv, ana);

    // The pitch slot must NOT receive Ana — otherwise her id would clash with the
    // SquadSpecialSection card that is still rendering her from `sections`.
    expect(result.DC_E.map((p) => p.id)).toEqual([2]);
    expect(result.DC_E).not.toContain(ana);
  });

  it('does NOT insert the player into the target pitch slot when source is DUVIDA', () => {
    const byPos = { GR: [], MC: [bruno] };
    const sections = { POSSIBILIDADE: [], DUVIDA: [ana] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'DUVIDA', toSlot: 'MC', toIndex: 1 };

    const result = computeDisplayByPosition(byPos, sections, dv, ana);

    expect(result.MC.map((p) => p.id)).toEqual([2]);
  });

  it('returns the byPosition reference unchanged for special-section sources (cheap memo)', () => {
    const byPos = { GR: [], DC_E: [bruno] };
    const sections = { POSSIBILIDADE: [ana], DUVIDA: [] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'POSSIBILIDADE', toSlot: 'DC_E', toIndex: 0 };

    expect(computeDisplayByPosition(byPos, sections, dv, ana)).toBe(byPos);
  });

  it('still previews pitch→pitch drag even when specialSections is provided', () => {
    // Sanity: the special-section guard must NOT short-circuit pitch sources just because
    // specialSections happens to be defined.
    const byPos = { GR: [ana], DC_E: [bruno] };
    const sections = { POSSIBILIDADE: [carlos], DUVIDA: [] };
    const dv: DragVirtual = { playerId: 1, fromSlot: 'GR', toSlot: 'DC_E', toIndex: 0 };

    const result = computeDisplayByPosition(byPos, sections, dv, ana);

    expect(result.GR).toEqual([]);
    expect(result.DC_E.map((p) => p.id)).toEqual([1, 2]);
  });
});

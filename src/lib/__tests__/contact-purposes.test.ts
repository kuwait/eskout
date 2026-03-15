// src/lib/__tests__/contact-purposes.test.ts
// Tests for contact purpose types, factories, and status history integration
// Validates ContactPurpose shape and StatusHistoryEntry contact purpose fields
// RELEVANT FILES: src/lib/types/index.ts, src/lib/__tests__/factories.ts, src/components/players/StatusHistory.tsx

import { makeContactPurpose, makeStatusHistoryEntry } from './factories';

/* ───────────── ContactPurpose Factory ───────────── */

describe('makeContactPurpose', () => {
  it('returns default contact purpose', () => {
    const cp = makeContactPurpose();
    expect(cp.id).toBe('cp-uuid-001');
    expect(cp.clubId).toBe('club-abc');
    expect(cp.label).toBe('Vir Treinar');
    expect(cp.sortOrder).toBe(1);
    expect(cp.isArchived).toBe(false);
  });

  it('accepts overrides', () => {
    const cp = makeContactPurpose({ label: 'Follow-up', sortOrder: 5, isArchived: true });
    expect(cp.label).toBe('Follow-up');
    expect(cp.sortOrder).toBe(5);
    expect(cp.isArchived).toBe(true);
  });
});

/* ───────────── StatusHistoryEntry with Contact Purpose ───────────── */

describe('makeStatusHistoryEntry', () => {
  it('returns entry with null contact purpose fields by default', () => {
    const entry = makeStatusHistoryEntry();
    expect(entry.contactPurposeId).toBeNull();
    expect(entry.contactPurposeCustom).toBeNull();
    expect(entry.contactPurposeLabel).toBeUndefined();
  });

  it('accepts structured contact purpose', () => {
    const entry = makeStatusHistoryEntry({
      contactPurposeId: 'cp-uuid-001',
      contactPurposeLabel: 'Vir Treinar',
    });
    expect(entry.contactPurposeId).toBe('cp-uuid-001');
    expect(entry.contactPurposeLabel).toBe('Vir Treinar');
    expect(entry.contactPurposeCustom).toBeNull();
  });

  it('accepts custom contact purpose (Outro)', () => {
    const entry = makeStatusHistoryEntry({
      contactPurposeId: null,
      contactPurposeCustom: 'Confirmar presença no torneio',
    });
    expect(entry.contactPurposeId).toBeNull();
    expect(entry.contactPurposeCustom).toBe('Confirmar presença no torneio');
  });
});

/* ───────────── Contact Purpose Label Resolution ───────────── */

describe('contact purpose label resolution', () => {
  /** Same logic used in StatusHistory.tsx and PipelineView.tsx */
  function resolvePurposeLabel(entry: ReturnType<typeof makeStatusHistoryEntry>): string | null {
    return entry.contactPurposeLabel ?? entry.contactPurposeCustom ?? null;
  }

  it('resolves structured purpose label', () => {
    const entry = makeStatusHistoryEntry({
      contactPurposeId: 'cp-uuid-001',
      contactPurposeLabel: 'Nova reunião',
    });
    expect(resolvePurposeLabel(entry)).toBe('Nova reunião');
  });

  it('resolves custom purpose text when no structured label', () => {
    const entry = makeStatusHistoryEntry({
      contactPurposeCustom: 'Razão especial do contacto',
    });
    expect(resolvePurposeLabel(entry)).toBe('Razão especial do contacto');
  });

  it('returns null when no purpose set', () => {
    const entry = makeStatusHistoryEntry();
    expect(resolvePurposeLabel(entry)).toBeNull();
  });

  it('prefers structured label over custom text', () => {
    // Shouldn't happen in practice, but structured label wins
    const entry = makeStatusHistoryEntry({
      contactPurposeId: 'cp-uuid-001',
      contactPurposeLabel: 'Vir Treinar',
      contactPurposeCustom: 'Texto custom',
    });
    expect(resolvePurposeLabel(entry)).toBe('Vir Treinar');
  });
});

/* ───────────── Contact Purpose Sorting ───────────── */

describe('contact purposes sort order', () => {
  it('sorts by sortOrder ascending', () => {
    const purposes = [
      makeContactPurpose({ id: 'c', label: 'Follow-up', sortOrder: 3 }),
      makeContactPurpose({ id: 'a', label: 'Vir Treinar', sortOrder: 1 }),
      makeContactPurpose({ id: 'b', label: 'Nova reunião', sortOrder: 2 }),
    ];
    const sorted = [...purposes].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((p) => p.label)).toEqual(['Vir Treinar', 'Nova reunião', 'Follow-up']);
  });

  it('filters out archived purposes', () => {
    const purposes = [
      makeContactPurpose({ label: 'Ativo', isArchived: false }),
      makeContactPurpose({ label: 'Arquivado', isArchived: true }),
      makeContactPurpose({ label: 'Outro ativo', isArchived: false }),
    ];
    const active = purposes.filter((p) => !p.isArchived);
    expect(active).toHaveLength(2);
    expect(active.map((p) => p.label)).toEqual(['Ativo', 'Outro ativo']);
  });
});

/* ───────────── Purpose Map for Pipeline Cards ───────────── */

describe('contact purpose map building', () => {
  /** Simulates the logic in PipelineView.fetchPipelinePlayers for building the purposeMap */
  function buildPurposeMap(
    historyRows: { player_id: number; contact_purpose_id: string | null; contact_purpose_custom: string | null; label: string | null }[]
  ): Record<number, string> {
    const purposeMap: Record<number, string> = {};
    for (const row of historyRows) {
      if (purposeMap[row.player_id]) continue;
      const label = row.contact_purpose_id
        ? (row.label ?? null)
        : (row.contact_purpose_custom ?? null);
      if (label) purposeMap[row.player_id] = label;
    }
    return purposeMap;
  }

  it('picks structured label when contact_purpose_id is set', () => {
    const map = buildPurposeMap([
      { player_id: 1, contact_purpose_id: 'cp-1', contact_purpose_custom: null, label: 'Vir Treinar' },
    ]);
    expect(map[1]).toBe('Vir Treinar');
  });

  it('picks custom text when contact_purpose_id is null (Outro)', () => {
    const map = buildPurposeMap([
      { player_id: 1, contact_purpose_id: null, contact_purpose_custom: 'Razão custom', label: null },
    ]);
    expect(map[1]).toBe('Razão custom');
  });

  it('uses most recent entry per player (first in desc order)', () => {
    const map = buildPurposeMap([
      { player_id: 1, contact_purpose_id: 'cp-2', contact_purpose_custom: null, label: 'Follow-up' },
      { player_id: 1, contact_purpose_id: 'cp-1', contact_purpose_custom: null, label: 'Vir Treinar' },
    ]);
    expect(map[1]).toBe('Follow-up'); // First (most recent) wins
  });

  it('handles multiple players', () => {
    const map = buildPurposeMap([
      { player_id: 1, contact_purpose_id: 'cp-1', contact_purpose_custom: null, label: 'Vir Treinar' },
      { player_id: 2, contact_purpose_id: null, contact_purpose_custom: 'Motivo especial', label: null },
    ]);
    expect(map[1]).toBe('Vir Treinar');
    expect(map[2]).toBe('Motivo especial');
  });

  it('skips entries with no purpose data', () => {
    const map = buildPurposeMap([
      { player_id: 1, contact_purpose_id: null, contact_purpose_custom: null, label: null },
    ]);
    expect(map[1]).toBeUndefined();
  });
});

// src/components/pipeline/__tests__/kanban-helpers.test.ts
// Unit tests for Kanban drag-and-drop ID parsing and container lookup helpers
// Validates card/column ID formats, container resolution, and buildContainerItems
// RELEVANT FILES: src/components/pipeline/kanban-helpers.ts, src/components/pipeline/KanbanBoard.tsx

import {
  cardId,
  parseCardId,
  columnId,
  parseColumnId,
  subZoneId,
  parseSubZoneId,
  buildContainerItems,
  findContainer,
  STATUS_SET,
} from '@/components/pipeline/kanban-helpers';
import { RECRUITMENT_STATUSES } from '@/lib/constants';
import { makePlayer } from '@/lib/__tests__/factories';
import type { Player, RecruitmentStatus } from '@/lib/types';

/* ───────────── Helpers ───────────── */

/** Build a minimal playersByStatus record for testing */
function makePbs(entries: [RecruitmentStatus, Player[]][]): Record<RecruitmentStatus, Player[]> {
  const pbs = {} as Record<RecruitmentStatus, Player[]>;
  for (const s of RECRUITMENT_STATUSES) pbs[s.value] = [];
  for (const [status, players] of entries) pbs[status] = players;
  return pbs;
}

/* ───────────── cardId / parseCardId ───────────── */

describe('cardId', () => {
  it('formats player ID as card drag ID', () => {
    expect(cardId(42)).toBe('card-42');
    expect(cardId(1)).toBe('card-1');
    expect(cardId(9999)).toBe('card-9999');
  });
});

describe('parseCardId', () => {
  it('extracts player ID from valid card ID', () => {
    expect(parseCardId('card-42')).toBe(42);
    expect(parseCardId('card-1')).toBe(1);
    expect(parseCardId('card-9999')).toBe(9999);
  });

  it('returns null for invalid formats', () => {
    expect(parseCardId('pipeline-42-por_tratar')).toBeNull();
    expect(parseCardId('column-por_tratar')).toBeNull();
    expect(parseCardId('status-por_tratar')).toBeNull();
    expect(parseCardId('card-')).toBeNull();
    expect(parseCardId('card-abc')).toBeNull();
    expect(parseCardId('')).toBeNull();
  });
});

/* ───────────── columnId / parseColumnId ───────────── */

describe('columnId', () => {
  it('formats status as column ID', () => {
    expect(columnId('por_tratar')).toBe('column-por_tratar');
    expect(columnId('em_contacto')).toBe('column-em_contacto');
  });
});

describe('parseColumnId', () => {
  it('extracts status from valid column ID', () => {
    expect(parseColumnId('column-por_tratar')).toBe('por_tratar');
    expect(parseColumnId('column-em_contacto')).toBe('em_contacto');
  });

  it('returns null for invalid formats', () => {
    expect(parseColumnId('card-42')).toBeNull();
    expect(parseColumnId('status-por_tratar')).toBeNull();
    expect(parseColumnId('')).toBeNull();
  });
});

/* ───────────── STATUS_SET ───────────── */

describe('STATUS_SET', () => {
  it('contains all recruitment statuses', () => {
    for (const s of RECRUITMENT_STATUSES) {
      expect(STATUS_SET.has(s.value)).toBe(true);
    }
  });

  it('does not contain non-status values', () => {
    expect(STATUS_SET.has('invalid' as RecruitmentStatus)).toBe(false);
    expect(STATUS_SET.has('card-42' as RecruitmentStatus)).toBe(false);
  });
});

/* ───────────── subZoneId / parseSubZoneId ───────────── */

describe('subZoneId', () => {
  it('formats decision side as sub-zone ID', () => {
    expect(subZoneId('club')).toBe('subzone-a_decidir-club');
    expect(subZoneId('player')).toBe('subzone-a_decidir-player');
  });
});

describe('parseSubZoneId', () => {
  it('extracts decision side from valid sub-zone ID', () => {
    expect(parseSubZoneId('subzone-a_decidir-club')).toBe('club');
    expect(parseSubZoneId('subzone-a_decidir-player')).toBe('player');
  });

  it('returns null for invalid formats', () => {
    expect(parseSubZoneId('subzone-a_decidir-invalid')).toBeNull();
    expect(parseSubZoneId('status-a_decidir')).toBeNull();
    expect(parseSubZoneId('card-42')).toBeNull();
    expect(parseSubZoneId('')).toBeNull();
  });
});

/* ───────────── buildContainerItems ───────────── */

describe('buildContainerItems', () => {
  it('converts playersByStatus to card ID arrays', () => {
    const pbs = makePbs([
      ['por_tratar', [makePlayer({ id: 10 }), makePlayer({ id: 20 })]],
      ['em_contacto', [makePlayer({ id: 30 })]],
    ]);

    const items = buildContainerItems(pbs);

    expect(items.por_tratar).toEqual(['card-10', 'card-20']);
    expect(items.em_contacto).toEqual(['card-30']);
  });

  it('produces empty arrays for statuses with no players', () => {
    const pbs = makePbs([]);
    const items = buildContainerItems(pbs);

    for (const s of RECRUITMENT_STATUSES) {
      expect(items[s.value]).toEqual([]);
    }
  });

  it('includes all recruitment statuses as keys', () => {
    const pbs = makePbs([]);
    const items = buildContainerItems(pbs);

    for (const s of RECRUITMENT_STATUSES) {
      expect(items).toHaveProperty(s.value);
    }
  });
});

/* ───────────── findContainer ───────────── */

describe('findContainer', () => {
  const items = buildContainerItems(
    makePbs([
      ['por_tratar', [makePlayer({ id: 10 }), makePlayer({ id: 20 })]],
      ['em_contacto', [makePlayer({ id: 30 })]],
    ])
  );

  it('resolves droppable zone "status-{value}" to status', () => {
    expect(findContainer('status-por_tratar', items)).toBe('por_tratar');
    expect(findContainer('status-em_contacto', items)).toBe('em_contacto');
    expect(findContainer('status-unknown_status', items)).toBeNull();
  });

  it('resolves bare status value', () => {
    expect(findContainer('por_tratar', items)).toBe('por_tratar');
    expect(findContainer('em_contacto', items)).toBe('em_contacto');
  });

  it('resolves column wrapper "column-{status}"', () => {
    expect(findContainer('column-por_tratar', items)).toBe('por_tratar');
    expect(findContainer('column-em_contacto', items)).toBe('em_contacto');
  });

  it('resolves card ID to its container', () => {
    expect(findContainer('card-10', items)).toBe('por_tratar');
    expect(findContainer('card-20', items)).toBe('por_tratar');
    expect(findContainer('card-30', items)).toBe('em_contacto');
  });

  it('returns null for unknown IDs', () => {
    expect(findContainer('card-999', items)).toBeNull();
    expect(findContainer('unknown', items)).toBeNull();
    expect(findContainer('', items)).toBeNull();
  });

  it('returns null for invalid status droppable zone', () => {
    expect(findContainer('status-invalid', items)).toBeNull();
  });

  it('handles numeric IDs by converting to string', () => {
    expect(findContainer(42, items)).toBeNull();
  });

  it('resolves sub-zone IDs to a_decidir container', () => {
    expect(findContainer('subzone-a_decidir-club', items)).toBe('a_decidir');
    expect(findContainer('subzone-a_decidir-player', items)).toBe('a_decidir');
  });

  it('finds card after cross-container move (card in different column)', () => {
    // Simulate a card moved from por_tratar to confirmado during drag
    const movedItems = { ...items };
    movedItems.por_tratar = items.por_tratar.filter((id) => id !== 'card-10');
    movedItems.confirmado = [...items.confirmado, 'card-10'];

    expect(findContainer('card-10', movedItems)).toBe('confirmado');
    expect(findContainer('card-20', movedItems)).toBe('por_tratar');
  });
});

// src/components/pipeline/kanban-helpers.ts
// Pure helper functions for KanbanBoard drag-and-drop ID parsing and container lookup
// Extracted for testability — no React or @dnd-kit dependencies
// RELEVANT FILES: src/components/pipeline/KanbanBoard.tsx, src/components/pipeline/StatusColumn.tsx, src/lib/constants.ts

import { RECRUITMENT_STATUSES } from '@/lib/constants';
import type { Player, RecruitmentStatus } from '@/lib/types';

/* ───────────── Card & Column ID helpers ───────────── */

/** Card drag IDs: "card-{playerId}" — status-agnostic for cross-container moves */
export function cardId(playerId: number): string { return `card-${playerId}`; }

export function parseCardId(id: string): number | null {
  const match = id.match(/^card-(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/** Column sortable IDs */
export function columnId(status: RecruitmentStatus): string { return `column-${status}`; }

export function parseColumnId(id: string): RecruitmentStatus | null {
  const match = id.match(/^column-(.+)$/);
  return match ? (match[1] as RecruitmentStatus) : null;
}

/* ───────────── Container items ───────────── */

/** Container items: status → card IDs (mirrors playersByStatus but as string arrays) */
export type ContainerItems = Record<RecruitmentStatus, string[]>;

/** All status values as a Set for quick lookup */
export const STATUS_SET = new Set(RECRUITMENT_STATUSES.map((s) => s.value));

/** Build container items from player data */
export function buildContainerItems(pbs: Record<RecruitmentStatus, Player[]>): ContainerItems {
  const items = {} as ContainerItems;
  for (const s of RECRUITMENT_STATUSES) {
    items[s.value] = (pbs[s.value] ?? []).map((p) => cardId(p.id));
  }
  return items;
}

/** Find which container a card/droppable/column ID belongs to */
export function findContainer(id: string | number, items: ContainerItems): RecruitmentStatus | null {
  const sid = String(id);
  // Direct status match (droppable zone "status-{value}")
  const statusMatch = sid.match(/^status-(.+)$/);
  if (statusMatch && STATUS_SET.has(statusMatch[1] as RecruitmentStatus)) return statusMatch[1] as RecruitmentStatus;
  // Bare status value
  if (STATUS_SET.has(sid as RecruitmentStatus)) return sid as RecruitmentStatus;
  // Column wrapper
  const col = parseColumnId(sid);
  if (col) return col;
  // Card — search containers
  for (const status of RECRUITMENT_STATUSES) {
    if (items[status.value].includes(sid)) return status.value;
  }
  return null;
}

// src/lib/squads/possibility-reason.ts
// Pure normalization helpers for the Possibilidade motivo (custom text + color).
// Kept out of 'use server' files so it can be imported by both server actions and client components.
// RELEVANT FILES: src/actions/squads.ts, src/components/squad/SquadPanelView.tsx, src/components/squad/SquadSpecialSection.tsx

import type { CustomColorChoice } from '@/lib/constants';

/**
 * Normalize a possibility-reason input pair: trims text, collapses empty → null,
 * and drops the color when there's no text (color only makes sense with a motivo).
 */
export function normalizePossibilityReason(
  text: string | null | undefined,
  color: CustomColorChoice | string | null | undefined
): { text: string | null; color: CustomColorChoice | string | null } {
  const trimmed = text?.trim() ?? '';
  if (trimmed.length === 0) {
    return { text: null, color: null };
  }
  return { text: trimmed, color: color ?? null };
}

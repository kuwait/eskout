// src/lib/utils/player-name.ts
// Shared display helpers for player names in squad/list cards
// Centralizes the abbreviation logic so cards in different views stay consistent
// RELEVANT FILES: src/components/squad/FormationSlot.tsx, src/components/squad/SquadCompareView.tsx, src/components/squad/SquadSpecialSection.tsx

/** Compact name for narrow cards: "F. Last" for 2+ words, else returns the input.
 *  - "Cristiano Ronaldo" → "C. Ronaldo"
 *  - "Cristiano Ronaldo dos Santos Aveiro" → "C. Aveiro"
 *  - "Pelé" → "Pelé"
 *  Used by the smallest cards (compare-view 2-col grid, mobile compact slot, etc.). */
export function compactName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
}

/** "First + Last initial" for share pills / chip lists: "João Carlos Silva" → "João S."
 *  - Single-word names are returned unchanged.
 *  Different from `shortName` (which keeps the full last name) and from `compactName`
 *  (which abbreviates the first name instead). */
export function firstNameWithLastInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

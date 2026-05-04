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

// src/lib/utils/search.ts
// Pure search utilities for multi-word player/club matching
// Extracted from searchPickerPlayers to enable unit testing and client-side filtering
// RELEVANT FILES: src/actions/player-lists.ts, src/components/squad/AddToSquadDialog.tsx

/**
 * Strip diacritics (accents) from a string for accent-insensitive matching.
 * e.g. "Hernâni" → "Hernani", "João" → "Joao"
 */
export function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extract up to 3 meaningful search words from a search string.
 * Filters out words shorter than 2 chars.
 * For 4+ words, keeps first, second-to-last, and last (skips common middle names).
 */
export function extractSearchWords(search: string): string[] {
  const words = search.trim().split(/\s+/).filter(w => w.length >= 2);
  if (words.length <= 3) return words;
  // Use first, second-to-last, and last (skip common middle names like "de", "da", "dos")
  return [words[0], words[words.length - 2], words[words.length - 1]];
}

/**
 * Check if a player matches a multi-word search query.
 * Each word must appear in either the player name OR the club name.
 * Case-insensitive and accent-insensitive (e.g. "hernani" matches "Hernâni").
 * This enables cross-field matching: "carlos soares hernani" matches
 * name="Carlos Soares" + club="Hernâni".
 */
export function matchesPickerSearch(
  player: { name: string; club?: string | null },
  searchWords: string[]
): boolean {
  if (searchWords.length === 0) return true;
  const nameLower = stripAccents(player.name.toLowerCase());
  const clubLower = stripAccents((player.club ?? '').toLowerCase());
  return searchWords.every(word => {
    const w = stripAccents(word.toLowerCase());
    return nameLower.includes(w) || clubLower.includes(w);
  });
}

// src/lib/utils.ts
// Shared low-level helpers: tailwind className merge (cn), accent stripping,
// and shortName abbreviation used across the app.
// RELEVANT FILES: src/lib/utils/player-name.ts, src/lib/utils/positions.ts, src/lib/utils/dates.ts

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip diacritics and lowercase: "Famalicão" → "famalicao" */
export function normalize(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Multi-word fuzzy search: "Afo Rodr" matches "Afonso Filipe Oliveira Rodrigues".
 * Every word in the query must appear somewhere in the target.
 * Accent-insensitive and case-insensitive.
 */
export function fuzzyMatch(target: string, query: string): boolean {
  const normTarget = normalize(target);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every((word) => normTarget.includes(word));
}

/** "João Miguel Ferreira Silva" → "João Silva" (first + last name) */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Multi-word fuzzy search: "Afo Rodr" matches "Afonso Filipe Oliveira Rodrigues".
 * Every word in the query must appear somewhere in the target (case-insensitive).
 */
export function fuzzyMatch(target: string, query: string): boolean {
  const lowerTarget = target.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => lowerTarget.includes(word));
}

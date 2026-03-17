// src/components/players/profile-utils.ts
// Pure utility functions and constants shared across PlayerProfile sub-components.
// Extracted from PlayerProfile.tsx to reduce file size and improve reusability.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/ProfileViewSections.tsx, src/components/players/RecruitmentCard.tsx

/* ───────────── Rating color map (shared by header widgets) ───────────── */

/* Unified 1-5 color scale: 1=red, 2=orange, 3=sky, 4=teal, 5=green */
export const RATING_COLOR_MAP: Record<number, { dot: string; num: string; bg: string; border: string; ring: string }> = {
  1: { dot: 'bg-red-500', num: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', ring: 'border-red-400' },
  2: { dot: 'bg-orange-400', num: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', ring: 'border-orange-400' },
  3: { dot: 'bg-sky-500', num: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200', ring: 'border-sky-400' },
  4: { dot: 'bg-teal-500', num: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200', ring: 'border-teal-400' },
  5: { dot: 'bg-green-500', num: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200', ring: 'border-green-400' },
};
export const RATING_DEFAULT = { dot: 'bg-neutral-300', num: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200', ring: 'border-neutral-300' };

export function parseRating(value: string) {
  const numMatch = value.match(/^(\d)/);
  const rating = numMatch ? parseInt(numMatch[1], 10) : 0;
  const ratingText = value.replace(/^\d\s*-\s*/, '');
  const colors = RATING_COLOR_MAP[rating] ?? RATING_DEFAULT;
  return { rating, ratingText, colors };
}

/** First name + last name (e.g. "Leonardo Diego Baptista Santos" -> "Leonardo Santos") */
export function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('pt-PT');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    // Only show time if it's not midnight (meaning time was actually set)
    return time === '00:00' ? date : `${date} ${time}`;
  } catch {
    return dateStr;
  }
}

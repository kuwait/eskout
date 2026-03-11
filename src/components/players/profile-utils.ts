// src/components/players/profile-utils.ts
// Pure utility functions and constants shared across PlayerProfile sub-components.
// Extracted from PlayerProfile.tsx to reduce file size and improve reusability.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/ProfileViewSections.tsx, src/components/players/RecruitmentCard.tsx

/* ───────────── Rating color map (shared by header widgets) ───────────── */

export const RATING_COLOR_MAP: Record<number, { dot: string; num: string; bg: string; border: string; ring: string }> = {
  1: { dot: 'bg-red-500', num: 'text-red-600', bg: 'bg-red-50/80', border: 'border-red-200', ring: 'border-red-400' },
  2: { dot: 'bg-orange-400', num: 'text-orange-600', bg: 'bg-orange-50/80', border: 'border-orange-200', ring: 'border-orange-400' },
  3: { dot: 'bg-blue-400', num: 'text-blue-600', bg: 'bg-blue-50/80', border: 'border-blue-200', ring: 'border-blue-400' },
  4: { dot: 'bg-emerald-400', num: 'text-emerald-600', bg: 'bg-emerald-50/80', border: 'border-emerald-200', ring: 'border-emerald-400' },
  5: { dot: 'bg-emerald-600', num: 'text-emerald-700', bg: 'bg-emerald-50/80', border: 'border-emerald-200', ring: 'border-emerald-500' },
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

// src/actions/data-quality-helpers.ts
// Pure helper functions for data quality checks — extracted from data-quality.ts
// Sync functions can't be exported from 'use server' files, so they live here
// RELEVANT FILES: src/actions/data-quality.ts, src/actions/__tests__/data-quality.test.ts

/** Grace period for new players — don't flag as stale if never checked and created recently */
export const NEW_PLAYER_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** FPF stale checkpoints — data should be refreshed by these dates each season.
 * Oct 1: season started, all registrations should be in FPF.
 * Mar 1: transfer window closed (last day of Feb), registrations updated. */
const STALE_CHECKPOINTS = [
  { month: 10, day: 1 },  // October 1
  { month: 3, day: 1 },   // March 1
];

/** Get the most recent stale checkpoint before `now`.
 * E.g. if now is Dec 15 2025 → Oct 1 2025. If now is Feb 10 2026 → Oct 1 2025.
 * If now is Apr 5 2026 → Mar 1 2026. */
export function getLastCheckpoint(now: number): Date {
  const d = new Date(now);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-indexed
  const day = d.getDate();

  // Check this year's checkpoints in reverse order (Mar, Oct → check Oct first if month > Oct)
  // We want the latest checkpoint that is <= now
  const candidates: Date[] = [];
  for (const cp of STALE_CHECKPOINTS) {
    // This year
    candidates.push(new Date(year, cp.month - 1, cp.day));
    // Previous year (in case we're before all checkpoints this year)
    candidates.push(new Date(year - 1, cp.month - 1, cp.day));
  }

  // Filter to checkpoints in the past, pick the most recent
  const nowDate = new Date(year, month - 1, day);
  const past = candidates
    .filter(c => c <= nowDate)
    .sort((a, b) => b.getTime() - a.getTime());

  return past[0];
}

/** Check if external data needs refreshing — stale if last check is before the most recent checkpoint.
 * If lastChecked is null and the player was created within the grace period, returns false. */
export function isStale(lastChecked: string | null, now: number, createdAt?: string | null): boolean {
  if (!lastChecked) {
    // Never checked — but if player was created recently, don't flag as stale (grace period)
    if (createdAt) {
      const created = new Date(createdAt).getTime();
      if (!isNaN(created) && now - created < NEW_PLAYER_GRACE_MS) return false;
    }
    return true;
  }
  const checked = new Date(lastChecked).getTime();
  if (isNaN(checked)) return true;

  const checkpoint = getLastCheckpoint(now);
  // Stale if last check was before the most recent checkpoint
  return checked < checkpoint.getTime();
}

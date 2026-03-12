// src/lib/zerozero/cooldown.ts
// ZeroZero cooldown manager — tracks captcha/block events and enforces exponential backoff
// Prevents hammering ZZ when blocked, while still allowing FPF-only scraping
// RELEVANT FILES: src/lib/zerozero/client.ts, src/components/players/RefreshPlayerButton.tsx, src/app/admin/dados/DataQualityClient.tsx

const STORAGE_KEY = 'zz_cooldown';

/** Minimum cooldown: 2 minutes */
const MIN_COOLDOWN_MS = 2 * 60 * 1000;
/** Maximum cooldown: 30 minutes */
const MAX_COOLDOWN_MS = 30 * 60 * 1000;

interface CooldownState {
  /** Timestamp (ms) when the block was detected */
  blockedAt: number;
  /** Current cooldown duration in ms (doubles on each consecutive block) */
  duration: number;
}

/* ───────────── Read / Write ───────────── */

function getState(): CooldownState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CooldownState;
  } catch {
    return null;
  }
}

function setState(state: CooldownState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded — ignore */ }
}

function clearState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/* ───────────── Public API ───────────── */

/** Check if ZZ is currently in cooldown. Returns remaining seconds or 0 if available. */
export function zzCooldownRemaining(): number {
  const state = getState();
  if (!state) return 0;
  const elapsed = Date.now() - state.blockedAt;
  const remaining = state.duration - elapsed;
  if (remaining <= 0) {
    // Cooldown expired — don't clear yet, keep duration for next backoff
    return 0;
  }
  return Math.ceil(remaining / 1000);
}

/** Whether ZZ is currently blocked (in cooldown). */
export function isZzBlocked(): boolean {
  return zzCooldownRemaining() > 0;
}

/** Register a ZZ block event — starts or extends cooldown with exponential backoff. */
export function registerZzBlock(): void {
  const prev = getState();
  const now = Date.now();
  // Double the previous duration (exponential backoff), capped at MAX
  const prevDuration = prev?.duration ?? MIN_COOLDOWN_MS / 2;
  const nextDuration = Math.min(prevDuration * 2, MAX_COOLDOWN_MS);
  setState({ blockedAt: now, duration: nextDuration });
}

/** Register a successful ZZ request — resets cooldown entirely. */
export function registerZzSuccess(): void {
  clearState();
}

/** Format remaining cooldown as human-readable string (e.g. "2 min", "30 seg"). */
export function formatCooldown(seconds: number): string {
  if (seconds >= 60) {
    const min = Math.ceil(seconds / 60);
    return `${min} min`;
  }
  return `${seconds} seg`;
}

// src/components/common/MiniPitch.tsx
// Reusable mini pitch component showing player position(s) with hover popup
// Used in player profile header and player table position column
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/PlayerTable.tsx, src/lib/types/index.ts

import type { PositionCode } from '@/lib/types';

/* ───────────── Position Coordinates ───────────── */

/** Position coordinates on a horizontal pitch (percentage-based, GR at left, PL at right) */
const PITCH_POSITIONS: Record<PositionCode, { x: number; y: number }> = {
  GR:  { x: 8,  y: 50 },
  DD:  { x: 24, y: 82 },
  DC:  { x: 22, y: 50 },
  DE:  { x: 24, y: 18 },
  MDC: { x: 35, y: 50 },
  AD:  { x: 36, y: 88 },
  MD:  { x: 50, y: 82 },
  MC:  { x: 50, y: 50 },
  ME:  { x: 50, y: 18 },
  AE:  { x: 36, y: 12 },
  MOC: { x: 62.5, y: 50 },
  ED:  { x: 72, y: 86 },
  EE:  { x: 72, y: 14 },
  SA:  { x: 80, y: 50 },
  PL:  { x: 88, y: 50 },
};

/** Color for each position priority level on the pitch */
const POSITION_LEVEL_COLORS = {
  primary:   { dot: 'bg-green-500 border-white shadow-green-500/50', label: 'text-white' },
  secondary: { dot: 'bg-yellow-400 border-white shadow-yellow-400/50', label: 'text-white' },
  tertiary:  { dot: 'bg-orange-400 border-white shadow-orange-400/50', label: 'text-white' },
} as const;

/* ───────────── PitchCanvas ───────────── */

interface PitchProps {
  primaryPosition: PositionCode;
  secondaryPosition?: PositionCode | null;
  tertiaryPosition?: PositionCode | null;
  size: 'sm' | 'lg';
}

export function PitchCanvas({ primaryPosition, secondaryPosition, tertiaryPosition, size }: PitchProps) {
  const isSm = size === 'sm';

  // Build a map of position → level for quick lookup
  const positionLevels = new Map<PositionCode, keyof typeof POSITION_LEVEL_COLORS>();
  if (primaryPosition) positionLevels.set(primaryPosition, 'primary');
  if (secondaryPosition) positionLevels.set(secondaryPosition, 'secondary');
  if (tertiaryPosition) positionLevels.set(tertiaryPosition, 'tertiary');

  return (
    <div className={`relative overflow-hidden rounded-lg bg-emerald-700/90 ${isSm ? 'h-24 w-36' : 'h-80 w-[480px]'}`}>
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-1.5 rounded-sm border border-white/20" />
        <div className="absolute inset-y-1.5 left-1/2 border-l border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-[25%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
        <div className="absolute left-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute left-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-r border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[45%] w-[12%] -translate-y-1/2 border-y border-l border-white/20" />
        <div className="absolute right-1.5 top-1/2 h-[25%] w-[6%] -translate-y-1/2 border-y border-l border-white/20" />
      </div>

      {/* Position dots */}
      {(Object.entries(PITCH_POSITIONS) as [PositionCode, { x: number; y: number }][]).map(([pos, coords]) => {
        const level = positionLevels.get(pos);
        return (
          <div
            key={pos}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            {level ? (
              <div className="flex flex-col items-center">
                <div className={`rounded-full border-2 shadow-sm ${POSITION_LEVEL_COLORS[level].dot} ${isSm ? 'h-3.5 w-3.5' : 'h-6 w-6'}`} />
                <span className={`font-bold leading-none text-white drop-shadow-sm ${isSm ? 'mt-px text-[8px]' : 'mt-1 text-xs'}`}>{pos}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className={`rounded-full bg-white/30 ${isSm ? 'h-1.5 w-1.5' : 'h-3 w-3'}`} />
                {!isSm && <span className="mt-0.5 text-[9px] font-medium leading-none text-white/40">{pos}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── MiniPitch with hover popup ───────────── */

interface MiniPitchProps {
  primaryPosition: PositionCode;
  secondaryPosition?: PositionCode | null;
  tertiaryPosition?: PositionCode | null;
  /** Where the popup opens relative to the trigger */
  popupAlign?: 'right' | 'left';
}

export function MiniPitch({ primaryPosition, secondaryPosition, tertiaryPosition, popupAlign = 'right' }: MiniPitchProps) {
  const alignClass = popupAlign === 'left' ? 'left-0' : 'right-0';

  return (
    <div className="group relative">
      {/* Normal mini pitch */}
      <PitchCanvas primaryPosition={primaryPosition} secondaryPosition={secondaryPosition} tertiaryPosition={tertiaryPosition} size="sm" />

      {/* Hover popup — large preview, floats outside */}
      <div className={`pointer-events-none absolute ${alignClass} top-full z-50 mt-2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100`}>
        <div className="rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
          <PitchCanvas primaryPosition={primaryPosition} secondaryPosition={secondaryPosition} tertiaryPosition={tertiaryPosition} size="lg" />
        </div>
      </div>
    </div>
  );
}

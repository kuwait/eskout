// src/components/common/ClubBadge.tsx
// Club name with logo badge — shows small logo inline, hover popover with larger logo
// RELEVANT FILES: src/lib/types/index.ts, src/components/players/PlayerProfile.tsx, src/components/players/PlayerTable.tsx

'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

interface ClubBadgeProps {
  club: string;
  logoUrl?: string | null;
  /** Show club name next to the logo (default: true) */
  showName?: boolean;
  /** Size variant */
  size?: 'xs' | 'sm' | 'sm-md' | 'md' | 'lg';
  className?: string;
  /** Callback to remove the logo (shows "Remover" in hover card) */
  onRemoveLogo?: () => void;
}

const SIZES = {
  xs: { logo: 12, text: 'text-[9px]', popover: 48 },
  sm: { logo: 16, text: 'text-xs', popover: 64 },
  'sm-md': { logo: 18, text: 'text-[10px]', popover: 72 },
  md: { logo: 20, text: 'text-sm', popover: 80 },
  lg: { logo: 24, text: 'text-base', popover: 96 },
};

/* Detect touch device — SSR-safe via useSyncExternalStore */
const subscribe = () => () => {};
const getIsTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const getIsTouchServer = () => false;

export function ClubBadge({ club, logoUrl, showName = true, size = 'sm', className = '', onRemoveLogo }: ClubBadgeProps) {
  const isTouch = useSyncExternalStore(subscribe, getIsTouch, getIsTouchServer);

  if (!club) return null;

  const s = SIZES[size];

  // No logo URL — just render plain text
  if (!logoUrl) {
    return showName ? <span className={`${s.text} ${className}`}>{club}</span> : null;
  }

  const badge = (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Image
        src={logoUrl}
        alt={club}
        width={s.logo}
        height={s.logo}
        className="shrink-0 object-contain"
        style={{ width: s.logo, height: s.logo }}
        unoptimized
      />
      {showName && <span className={s.text}>{club}</span>}
    </span>
  );

  // Touch devices — no hover popover
  if (isTouch) return badge;

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-default">{badge}</span>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-auto p-3">
        <div className="flex items-center gap-3">
          <Image
            src={logoUrl}
            alt={club}
            width={s.popover}
            height={s.popover}
            className="shrink-0 object-contain"
            style={{ width: s.popover, height: s.popover }}
            unoptimized
          />
          <div>
            <span className="text-sm font-medium">{club}</span>
            {onRemoveLogo && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveLogo(); }}
                className="mt-1 block text-[10px] text-red-500 hover:text-red-700 hover:underline"
              >
                Logo errado? Remover
              </button>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

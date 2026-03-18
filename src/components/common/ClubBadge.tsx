// src/components/common/ClubBadge.tsx
// Club name with logo badge — shows small logo inline, hover popover with larger logo
// RELEVANT FILES: src/lib/types/index.ts, src/components/players/PlayerProfile.tsx, src/components/players/PlayerTable.tsx

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
  /** Wrap in a link to /?clube=X to filter the players list (default: false) */
  linkToFilter?: boolean;
}

const SIZES = {
  xs: { logo: 12, text: 'text-[9px]', popover: 48 },
  sm: { logo: 16, text: 'text-xs', popover: 64 },
  'sm-md': { logo: 18, text: 'text-[10px]', popover: 72 },
  md: { logo: 20, text: 'text-sm', popover: 80 },
  lg: { logo: 24, text: 'text-base', popover: 96 },
};

export function ClubBadge({ club, logoUrl, showName = true, size = 'sm', className = '', onRemoveLogo, linkToFilter }: ClubBadgeProps) {
  // Detect touch after mount to avoid hydration mismatch (server always renders non-touch)
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  if (!club) return null;

  const s = SIZES[size];
  const clubHref = `/?clube=${encodeURIComponent(club)}`;

  // No logo URL — just render plain text (or link)
  if (!logoUrl) {
    if (!showName) return null;
    return linkToFilter ? (
      <Link href={clubHref} className={`${s.text} ${className} hover:underline`} onClick={(e) => e.stopPropagation()}>{club}</Link>
    ) : (
      <span className={`${s.text} ${className}`}>{club}</span>
    );
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
  if (isTouch) {
    return linkToFilter ? (
      <Link href={clubHref} onClick={(e) => e.stopPropagation()}>{badge}</Link>
    ) : badge;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        {linkToFilter ? (
          <Link href={clubHref} className="cursor-pointer" onClick={(e) => e.stopPropagation()}>{badge}</Link>
        ) : (
          <span className="cursor-default">{badge}</span>
        )}
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

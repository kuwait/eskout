// src/components/common/ClubBadge.tsx
// Club name with logo badge — shows small logo inline, hover popover with larger logo
// RELEVANT FILES: src/lib/types/index.ts, src/components/players/PlayerProfile.tsx, src/components/players/PlayerTable.tsx

'use client';

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
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { logo: 16, text: 'text-xs', popover: 64 },
  md: { logo: 20, text: 'text-sm', popover: 80 },
  lg: { logo: 24, text: 'text-base', popover: 96 },
};

export function ClubBadge({ club, logoUrl, showName = true, size = 'sm', className = '' }: ClubBadgeProps) {
  if (!club) return null;

  const s = SIZES[size];

  // No logo URL — just render plain text
  if (!logoUrl) {
    return showName ? <span className={`${s.text} ${className}`}>{club}</span> : null;
  }

  const badge = (
    <span className={`inline-flex items-start gap-1.5 ${className}`}>
      <Image
        src={logoUrl}
        alt={club}
        width={s.logo}
        height={s.logo}
        className="mt-0.5 shrink-0 object-contain"
        style={{ width: s.logo, height: s.logo }}
        unoptimized
      />
      {showName && <span className={s.text}>{club}</span>}
    </span>
  );

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
          <span className="text-sm font-medium">{club}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// src/components/common/PlayerAvatar.tsx
// Reusable player avatar with hover/click tooltip showing player info card
// Used in calendar badges, pipeline cards, squad cards, and formation slots
// RELEVANT FILES: src/components/calendar/EventBadge.tsx, src/components/pipeline/PipelineCard.tsx, src/components/squad/SquadPlayerCard.tsx

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { User } from 'lucide-react';
import { POSITION_LABELS } from '@/lib/constants';
import type { PositionCode } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface PlayerInfo {
  name: string;
  photoUrl?: string | null;
  club?: string | null;
  position?: string | null;
  dob?: string | null;
  foot?: string | null;
}

interface PlayerAvatarProps {
  player: PlayerInfo;
  /** Avatar size in pixels (default 20) */
  size?: number;
  /** Extra CSS classes on the wrapper */
  className?: string;
}

/* ───────────── Helpers ───────────── */

/** First + last name (e.g. "Afonso Filipe Oliveira Rodrigues" -> "Afonso Rodrigues") */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 2) return full;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Format dob to dd/MM/yyyy */
function formatDob(dob: string): string {
  try {
    const d = new Date(dob);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return dob; }
}

/* ───────────── Component ───────────── */

export function PlayerAvatar({ player, size = 20, className = '' }: PlayerAvatarProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setTooltip({ x: rect.left, y: rect.top });
  }, []);

  // Desktop: hover with delay
  const handleEnter = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    timeoutRef.current = setTimeout(() => showTooltip(el), 200);
  }, [showTooltip]);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTooltip(null);
  }, []);

  // Mobile: tap to toggle
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (tooltip) {
      setTooltip(null);
    } else {
      showTooltip(e.currentTarget as HTMLElement);
    }
  }, [tooltip, showTooltip]);

  // Close on outside click (mobile)
  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tooltip]);

  const iconSize = Math.round(size * 0.6);
  const tooltipPhotoSize = Math.max(56, size);

  return (
    <>
      {/* Avatar circle */}
      <span
        className={`shrink-0 cursor-pointer ${className}`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      >
        {player.photoUrl ? (
          <Image
            src={player.photoUrl}
            alt=""
            width={size}
            height={size}
            unoptimized
            className="rounded-md object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          <span
            className="flex items-center justify-center rounded-md bg-neutral-200 text-neutral-500"
            style={{ width: size, height: size }}
          >
            <User style={{ width: iconSize, height: iconSize }} />
          </span>
        )}
      </span>

      {/* Tooltip — portal to body to escape overflow:hidden */}
      {tooltip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] rounded-lg border bg-white p-3 shadow-xl"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translateY(-100%) translateY(-8px)', width: 'max-content', maxWidth: '320px' }}
        >
          <div className="flex items-center gap-3">
            {player.photoUrl ? (
              <Image
                src={player.photoUrl}
                alt=""
                width={tooltipPhotoSize}
                height={tooltipPhotoSize}
                unoptimized
                className="shrink-0 rounded-lg object-cover"
                style={{ width: tooltipPhotoSize, height: tooltipPhotoSize }}
              />
            ) : (
              <span
                className="flex shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400"
                style={{ width: tooltipPhotoSize, height: tooltipPhotoSize }}
              >
                <User className="h-7 w-7" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight whitespace-nowrap">{shortName(player.name)}</p>
              {player.club && (
                <p className="mt-0.5 text-xs text-muted-foreground whitespace-nowrap">{player.club}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
                {player.position && (
                  <span>
                    <span className="text-muted-foreground">Pos: </span>
                    <span className="font-medium">{POSITION_LABELS[player.position as PositionCode] ?? player.position}</span>
                  </span>
                )}
                {player.foot && (
                  <span>
                    <span className="text-muted-foreground">Pe: </span>
                    <span className="font-medium">{player.foot}</span>
                  </span>
                )}
                {player.dob && (
                  <span>
                    <span className="text-muted-foreground">Nasc: </span>
                    <span className="font-medium">{formatDob(player.dob)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

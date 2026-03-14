// src/components/ui/page-spinner.tsx
// Generic page-level loading indicator — Eskout logo with circular progress ring
// Single source of truth for the loading state visual across the entire app
// RELEVANT FILES: src/app/*/loading.tsx, src/components/squad/SquadPanelView.tsx

import Image from 'next/image';

/**
 * Centered loading indicator: Eskout logo icon inside a circular
 * progress ring that fills continuously. Renders at a fixed vertical
 * center to avoid layout jumps between loading.tsx and page.tsx.
 */
export function PageSpinner({ message }: { message?: string } = {}) {
  // Ring dimensions: 56px diameter, 3px stroke
  const size = 56;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background ring (subtle) */}
        <svg className="absolute inset-0" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted-foreground/10"
          />
        </svg>

        {/* Animated progress ring */}
        <svg
          className="absolute inset-0 -rotate-90 animate-spinner-ring"
          width={size}
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="text-muted-foreground/40"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: circumference * 0.75,
            }}
          />
        </svg>

        {/* Logo icon centered inside the ring */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/logo-icon.svg"
            alt=""
            width={28}
            height={28}
            className="opacity-30"
            priority
          />
        </div>
      </div>
      {message && (
        <p className="text-xs text-muted-foreground/60">{message}</p>
      )}
    </div>
  );
}

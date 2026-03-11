// src/components/players/ProfileViewSections.tsx
// Display-only sub-components used in PlayerProfile view mode: Section, EditField, InfoChip, DecisionBadge, JerseySvg.
// Extracted from PlayerProfile.tsx to reduce file size and improve modularity.
// RELEVANT FILES: src/components/players/PlayerProfile.tsx, src/components/players/profile-utils.ts, src/components/players/ProfileFormWidgets.tsx

'use client';

import Link from 'next/link';
import { CircleCheckBig } from 'lucide-react';

/* ───────────── Section — card wrapper with accent title bar ───────────── */

export function Section({ title, action, children, stretch }: { title: string; action?: React.ReactNode; children: React.ReactNode; stretch?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-3 shadow-sm ${stretch ? 'flex h-full flex-col' : ''}`}>
      {/* Title bar — accent pill + compact layout */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-1 rounded-full bg-neutral-800" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-600">{title}</span>
        </div>
        {action}
      </div>
      {/* Separator */}
      <div className="-mx-4 border-b" />
      {/* Content */}
      <div className={`pt-3 ${stretch ? 'flex-1' : ''}`}>{children}</div>
    </div>
  );
}

/* ───────────── EditField — label + input wrapper for edit mode ───────────── */

export function EditField({ label, suffix, children }: { label: string; suffix?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {suffix}
      </div>
      {children}
    </div>
  );
}

/* ───────────── InfoChip — compact icon + label/value for Info Basica grid ───────────── */

/** Compact info chip — icon + label/value, used in Info Basica grid. wrap=true allows multi-line value */
export function InfoChip({ icon, label, value, linked, wrap, href }: { icon: React.ReactNode; label: string; value: string; linked?: boolean; wrap?: boolean; href?: string }) {
  const content = (
    <>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-200/60">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className={`${wrap ? 'line-clamp-2 text-xs' : 'truncate text-sm'} font-semibold leading-snug`}>{value}</p>
          {linked && <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[8px] font-bold text-blue-600">LINKED</span>}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center gap-2.5 rounded-lg bg-neutral-50/80 px-2.5 py-2 transition-colors hover:bg-neutral-100/80">
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-neutral-50/80 px-2.5 py-2">
      {content}
    </div>
  );
}

/* ───────────── DecisionBadge — colored badge with icon ───────────── */

/** Decision colors — matches ScoutingReports.tsx DECISION_STYLES */
export const DECISION_BADGE_STYLES: Record<string, { icon: string; bg: string; text: string; border: string }> = {
  'Assinar':        { icon: 'text-green-600',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  'Acompanhar':     { icon: 'text-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  'Rever':          { icon: 'text-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  'Sem Interesse':  { icon: 'text-red-500',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
  'Sem interesse':  { icon: 'text-red-500',    bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200' },
};
export const DECISION_DEFAULT_STYLE = { icon: 'text-neutral-400', bg: 'bg-neutral-50', text: 'text-neutral-600', border: 'border-neutral-200' };

/** Colored decision badge with icon — used in Observacao section */
export function DecisionBadge({ decision }: { decision: string }) {
  const s = DECISION_BADGE_STYLES[decision] ?? DECISION_DEFAULT_STYLE;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border ${s.border} ${s.bg} px-3 py-2`}>
      <CircleCheckBig className={`h-5 w-5 shrink-0 ${s.icon}`} />
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">Decisão</p>
        <p className={`text-sm font-bold ${s.text}`}>{decision}</p>
      </div>
    </div>
  );
}

/* ───────────── JerseySvg — SVG jersey silhouette with number ───────────── */

/** SVG jersey silhouette (back view) with number */
export function JerseySvg({ number, className }: { number?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 130" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main body — torso + sleeves as one smooth shape */}
      <path
        d="M36 8 L28 5 C22 3 14 8 6 18 L2 24 C0 27 0 31 2 34 L12 50 C14 53 18 54 20 52 L24 48 L22 110 C22 116 26 120 32 120 L88 120 C94 120 98 116 98 110 L96 48 L100 52 C102 54 106 53 108 50 L118 34 C120 31 120 27 118 24 L114 18 C106 8 98 3 92 5 L84 8 C78 14 66 18 60 18 C54 18 42 14 36 8 Z"
        fill="currentColor"
      />
      {/* Collar — round neckline */}
      <path
        d="M36 8 C42 14 54 18 60 18 C66 18 78 14 84 8"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
      {/* Collar inner shadow */}
      <path
        d="M40 11 C46 15 54 17 60 17 C66 17 74 15 80 11"
        fill="none"
        stroke="white"
        strokeWidth="1"
        strokeOpacity="0.15"
        strokeLinecap="round"
      />
      {/* Left sleeve seam */}
      <path d="M24 48 L22 110" stroke="white" strokeWidth="1" strokeOpacity="0.12" />
      {/* Right sleeve seam */}
      <path d="M96 48 L98 110" stroke="white" strokeWidth="1" strokeOpacity="0.12" />
      {/* Bottom hem */}
      <path d="M32 120 L88 120" stroke="white" strokeWidth="2" strokeOpacity="0.2" strokeLinecap="round" />
      {/* Shoulder highlight (left) */}
      <path d="M28 5 C22 3 14 8 6 18" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
      {/* Shoulder highlight (right) */}
      <path d="M92 5 C98 3 106 8 114 18" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
      {/* Number on back */}
      {number && (
        <text
          x="60"
          y="78"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={number.length > 1 ? '44' : '52'}
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          letterSpacing="-2"
        >
          {number}
        </text>
      )}
    </svg>
  );
}

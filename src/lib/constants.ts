// src/lib/constants.ts
// Business rule constants, color maps, and lookup tables for the Eskout application
// Single source of truth for all domain enums and their display properties
// RELEVANT FILES: src/lib/types/index.ts, src/lib/utils/positions.ts, src/lib/validators.ts

import type { DepartmentOpinion, PositionCode, RecruitmentStatus } from '@/lib/types';

/* ───────────── Positions ───────────── */

export const POSITIONS: { code: PositionCode; labelPt: string; labelEn: string }[] = [
  { code: 'GR', labelPt: 'Guarda-Redes', labelEn: 'Goalkeeper' },
  { code: 'DD', labelPt: 'Defesa Direito', labelEn: 'Right Back' },
  { code: 'DE', labelPt: 'Defesa Esquerdo', labelEn: 'Left Back' },
  { code: 'DC', labelPt: 'Defesa Central', labelEn: 'Centre Back' },
  { code: 'MDC', labelPt: 'Médio Defensivo', labelEn: 'Defensive Midfielder' },
  { code: 'MC', labelPt: 'Médio Centro', labelEn: 'Central Midfielder' },
  { code: 'MOC', labelPt: 'Médio Ofensivo', labelEn: 'Attacking Midfielder' },
  { code: 'ED', labelPt: 'Extremo Direito', labelEn: 'Right Winger' },
  { code: 'EE', labelPt: 'Extremo Esquerdo', labelEn: 'Left Winger' },
  { code: 'PL', labelPt: 'Ponta de Lança', labelEn: 'Striker' },
] as const;

export const POSITION_CODES: PositionCode[] = POSITIONS.map((p) => p.code);

/** Quick lookup: code → Portuguese label */
export const POSITION_LABELS: Record<PositionCode, string> = Object.fromEntries(
  POSITIONS.map((p) => [p.code, p.labelPt])
) as Record<PositionCode, string>;

/* ───────────── Department Opinions ───────────── */

export const DEPARTMENT_OPINIONS: { value: DepartmentOpinion; color: string; tailwind: string }[] = [
  { value: '1ª Escolha', color: '#3b82f6', tailwind: 'bg-blue-500 text-white' },
  { value: '2ª Escolha', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'Acompanhar', color: '#eab308', tailwind: 'bg-yellow-500 text-white' },
  { value: 'Por Observar', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white' },
  { value: 'Urgente Observar', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'Sem interesse', color: '#ef4444', tailwind: 'bg-red-500 text-white' },
  { value: 'Potencial', color: '#a855f7', tailwind: 'bg-purple-500 text-white' },
];

export const OPINION_COLOR_MAP: Record<DepartmentOpinion, string> = Object.fromEntries(
  DEPARTMENT_OPINIONS.map((o) => [o.value, o.tailwind])
) as Record<DepartmentOpinion, string>;

/* ───────────── Observer Evaluations ───────────── */

export const OBSERVER_EVALS = [
  '2 - Dúvida',
  '3 - Bom',
  '4 - Muito Bom',
  '5 - Excelente',
] as const;

export const OBSERVER_DECISIONS = [
  'Assinar',
  'Acompanhar',
  'Rever',
  'Sem Interesse',
] as const;

/* ───────────── Recruitment Pipeline ───────────── */

export const RECRUITMENT_STATUSES: {
  value: RecruitmentStatus;
  labelPt: string;
  color: string;
  tailwind: string;
}[] = [
  { value: 'pool', labelPt: 'Pool', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white' },
  { value: 'shortlist', labelPt: 'Shortlist', color: '#3b82f6', tailwind: 'bg-blue-500 text-white' },
  { value: 'to_observe', labelPt: 'A Observar', color: '#eab308', tailwind: 'bg-yellow-500 text-white' },
  { value: 'target', labelPt: 'Alvo', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'in_contact', labelPt: 'Em Contacto', color: '#a855f7', tailwind: 'bg-purple-500 text-white' },
  { value: 'negotiating', labelPt: 'Em Negociação', color: '#1e40af', tailwind: 'bg-blue-800 text-white' },
  { value: 'confirmed', labelPt: 'Confirmado', color: '#22c55e', tailwind: 'bg-green-500 text-white' },
  { value: 'rejected', labelPt: 'Rejeitado', color: '#ef4444', tailwind: 'bg-red-500 text-white' },
];

export const RECRUITMENT_STATUS_MAP: Record<RecruitmentStatus, string> = Object.fromEntries(
  RECRUITMENT_STATUSES.map((s) => [s.value, s.tailwind])
) as Record<RecruitmentStatus, string>;

export const RECRUITMENT_LABEL_MAP: Record<RecruitmentStatus, string> = Object.fromEntries(
  RECRUITMENT_STATUSES.map((s) => [s.value, s.labelPt])
) as Record<RecruitmentStatus, string>;

/* ───────────── Foot ───────────── */

export const FOOT_OPTIONS = [
  { value: 'Dir', label: 'Direito' },
  { value: 'Esq', label: 'Esquerdo' },
  { value: 'Amb', label: 'Ambidestro' },
] as const;

/* ───────────── Age Groups (season 2025/2026) ───────────── */

export const AGE_GROUPS: { name: string; generationYear: number }[] = [
  { name: 'Sub-19', generationYear: 2007 },
  { name: 'Sub-18', generationYear: 2008 },
  { name: 'Sub-17', generationYear: 2009 },
  { name: 'Sub-16', generationYear: 2010 },
  { name: 'Sub-15', generationYear: 2011 },
  { name: 'Sub-14', generationYear: 2012 },
  { name: 'Sub-13', generationYear: 2013 },
  { name: 'Sub-12', generationYear: 2014 },
  { name: 'Sub-11', generationYear: 2015 },
  { name: 'Sub-10', generationYear: 2016 },
  { name: 'Sub-9', generationYear: 2017 },
  { name: 'Sub-8', generationYear: 2018 },
  { name: 'Sub-7', generationYear: 2019 },
];

// Sub-19 covers multiple years
const SUB_19_YEARS = [2004, 2005, 2006, 2007];

/** Map birth year to age group name */
export function birthYearToAgeGroup(year: number): string | null {
  if (SUB_19_YEARS.includes(year)) return 'Sub-19';
  const group = AGE_GROUPS.find((g) => g.generationYear === year);
  return group?.name ?? null;
}

/* ───────────── Navigation ───────────── */

export const CURRENT_SEASON = '2025/2026';

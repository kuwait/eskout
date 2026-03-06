// src/lib/constants.ts
// Business rule constants, color maps, and lookup tables for the Eskout application
// Single source of truth for all domain enums and their display properties
// RELEVANT FILES: src/lib/types/index.ts, src/lib/utils/positions.ts, src/lib/validators.ts

import type { CalendarEventType, DepartmentOpinion, ObservationTier, Player, PositionCode, RecruitmentStatus } from '@/lib/types';

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

/** Extended squad slot codes — includes DC_E / DC_D for formation views */
export type SquadSlot = PositionCode | 'DC_E' | 'DC_D';

/** All valid squad slot codes (10 positions + 2 DC sub-slots) */
export const SQUAD_SLOT_CODES: SquadSlot[] = [...POSITION_CODES, 'DC_E', 'DC_D'];

/** Squad display slots — DC split into DC (E) and DC (D) for list/compare views */
export const SQUAD_SLOTS: { slot: SquadSlot; label: string }[] = [
  { slot: 'GR', label: 'Guarda-Redes' },
  { slot: 'DD', label: 'Defesa Direito' },
  { slot: 'DE', label: 'Defesa Esquerdo' },
  { slot: 'DC_E', label: 'Central (E)' },
  { slot: 'DC_D', label: 'Central (D)' },
  { slot: 'MDC', label: 'Médio Defensivo' },
  { slot: 'MC', label: 'Médio Centro' },
  { slot: 'MOC', label: 'Médio Ofensivo' },
  { slot: 'ED', label: 'Extremo Direito' },
  { slot: 'EE', label: 'Extremo Esquerdo' },
  { slot: 'PL', label: 'Ponta de Lança' },
];

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
  { value: 'Assinar', color: '#22c55e', tailwind: 'bg-green-500 text-white' },
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

/* ───────────── Recruitment Statuses (Abordagens) ───────────── */

export const RECRUITMENT_STATUSES: {
  value: RecruitmentStatus;
  labelPt: string;
  color: string;
  tailwind: string;
}[] = [
  { value: 'por_tratar', labelPt: 'Por tratar', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white' },
  { value: 'a_observar', labelPt: 'A Observar', color: '#eab308', tailwind: 'bg-yellow-500 text-white' },
  { value: 'em_contacto', labelPt: 'Em contacto', color: '#a855f7', tailwind: 'bg-purple-500 text-white' },
  { value: 'vir_treinar', labelPt: 'Vir treinar', color: '#3b82f6', tailwind: 'bg-blue-500 text-white' },
  { value: 'reuniao_marcada', labelPt: 'Reunião Marcada', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'a_decidir', labelPt: 'A decidir', color: '#1e40af', tailwind: 'bg-blue-800 text-white' },
  { value: 'confirmado', labelPt: 'Confirmado', color: '#22c55e', tailwind: 'bg-green-500 text-white' },
  { value: 'assinou', labelPt: 'Assinou', color: '#16a34a', tailwind: 'bg-green-700 text-white' },
  { value: 'rejeitado', labelPt: 'Rejeitado', color: '#ef4444', tailwind: 'bg-red-500 text-white' },
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

/** Map short foot codes to full Portuguese labels */
export const FOOT_LABEL_MAP: Record<string, string> = {
  Dir: 'Direito',
  Esq: 'Esquerdo',
  Amb: 'Ambidestro',
};

/* ───────────── Nationalities (common in Portuguese youth football) ───────────── */

export const NATIONALITIES = [
  { value: 'Portugal', flag: '🇵🇹' },
  { value: 'Brasil', flag: '🇧🇷' },
  { value: 'Angola', flag: '🇦🇴' },
  { value: 'Moçambique', flag: '🇲🇿' },
  { value: 'Cabo Verde', flag: '🇨🇻' },
  { value: 'Guiné-Bissau', flag: '🇬🇼' },
  { value: 'São Tomé e Príncipe', flag: '🇸🇹' },
  { value: 'Espanha', flag: '🇪🇸' },
  { value: 'França', flag: '🇫🇷' },
  { value: 'Alemanha', flag: '🇩🇪' },
  { value: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { value: 'Itália', flag: '🇮🇹' },
  { value: 'Holanda', flag: '🇳🇱' },
  { value: 'Bélgica', flag: '🇧🇪' },
  { value: 'Suíça', flag: '🇨🇭' },
  { value: 'Roménia', flag: '🇷🇴' },
  { value: 'Ucrânia', flag: '🇺🇦' },
  { value: 'Polónia', flag: '🇵🇱' },
  { value: 'Sérvia', flag: '🇷🇸' },
  { value: 'Croácia', flag: '🇭🇷' },
  { value: 'Turquia', flag: '🇹🇷' },
  { value: 'Nigéria', flag: '🇳🇬' },
  { value: 'Senegal', flag: '🇸🇳' },
  { value: 'Gana', flag: '🇬🇭' },
  { value: 'Camarões', flag: '🇨🇲' },
  { value: 'Costa do Marfim', flag: '🇨🇮' },
  { value: 'Guiné', flag: '🇬🇳' },
  { value: 'Marrocos', flag: '🇲🇦' },
  { value: 'Argélia', flag: '🇩🇿' },
  { value: 'Colômbia', flag: '🇨🇴' },
  { value: 'Argentina', flag: '🇦🇷' },
  { value: 'Venezuela', flag: '🇻🇪' },
  { value: 'Uruguai', flag: '🇺🇾' },
] as const;

/** Get flag emoji for a nationality, or generic globe if not found */
export function getNationalityFlag(nationality: string | null): string {
  if (!nationality) return '';
  const entry = NATIONALITIES.find((n) => n.value.toLowerCase() === nationality.toLowerCase());
  return entry?.flag ?? '🌍';
}

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

/* ───────────── Calendar Event Types ───────────── */

export const CALENDAR_EVENT_TYPES: {
  value: CalendarEventType;
  labelPt: string;
  color: string;
  tailwind: string;
}[] = [
  { value: 'treino', labelPt: 'Vir Treinar', color: '#3b82f6', tailwind: 'bg-blue-500 text-white' },
  { value: 'assinatura', labelPt: 'Assinatura', color: '#22c55e', tailwind: 'bg-green-500 text-white' },
  { value: 'reuniao', labelPt: 'Reunião', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'observacao', labelPt: 'Observação', color: '#a855f7', tailwind: 'bg-purple-500 text-white' },
  { value: 'outro', labelPt: 'Lembrete', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white' },
];

export const EVENT_TYPE_LABEL_MAP: Record<CalendarEventType, string> = Object.fromEntries(
  CALENDAR_EVENT_TYPES.map((t) => [t.value, t.labelPt])
) as Record<CalendarEventType, string>;

export const EVENT_TYPE_COLOR_MAP: Record<CalendarEventType, string> = Object.fromEntries(
  CALENDAR_EVENT_TYPES.map((t) => [t.value, t.tailwind])
) as Record<CalendarEventType, string>;

/* ───────────── Observation Tier (Estado de Observação) ───────────── */

export const OBSERVATION_TIERS: {
  value: ObservationTier;
  labelPt: string;
  icon: string;
  tooltip: string;
  tailwind: string;
}[] = [
  {
    value: 'observado',
    labelPt: 'Observado',
    icon: 'FileText',
    tooltip: 'Este jogador tem pelo menos um relatório de observação.',
    tailwind: 'text-emerald-600',
  },
  {
    value: 'referenciado',
    labelPt: 'Referenciado',
    icon: 'Eye',
    tooltip: 'Este jogador foi sinalizado por um observador.',
    tailwind: 'text-amber-500',
  },
  {
    value: 'adicionado',
    labelPt: 'Adicionado',
    icon: 'Plus',
    tooltip: 'Jogador apenas registado na base de dados.',
    tailwind: 'text-neutral-400',
  },
];

/** Compute observation tier from player data — has reports > has referred_by > default */
export function getObservationTier(player: Player): ObservationTier {
  // Has at least one non-empty report link
  const hasReports = player.reportLinks.some((link) => Boolean(link));
  if (hasReports) return 'observado';

  if (player.referredBy.trim()) return 'referenciado';

  return 'adicionado';
}

export const OBSERVATION_TIER_MAP: Record<ObservationTier, (typeof OBSERVATION_TIERS)[number]> =
  Object.fromEntries(OBSERVATION_TIERS.map((t) => [t.value, t])) as Record<ObservationTier, (typeof OBSERVATION_TIERS)[number]>;

/* ───────────── Hybrid Rating ───────────── */

/** Primary rating: report average if available, else manual observer eval, else null */
export function getPrimaryRating(player: Player): { value: number; isAverage: boolean } | null {
  // Prefer report average (from scouting reports)
  if (player.reportAvgRating !== null) {
    return { value: player.reportAvgRating, isAverage: true };
  }
  // Fall back to manual observer eval ("4 - Muito Bom" → 4)
  if (player.observerEval) {
    const m = player.observerEval.match(/^(\d)/);
    if (m) return { value: parseInt(m[1], 10), isAverage: false };
  }
  return null;
}

/* ───────────── Navigation ───────────── */

export const CURRENT_SEASON = '2025/2026';

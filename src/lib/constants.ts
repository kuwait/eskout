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
  { code: 'MD', labelPt: 'Médio Direito', labelEn: 'Right Midfielder' },
  { code: 'MC', labelPt: 'Médio Centro', labelEn: 'Central Midfielder' },
  { code: 'ME', labelPt: 'Médio Esquerdo', labelEn: 'Left Midfielder' },
  { code: 'MOC', labelPt: 'Médio Ofensivo', labelEn: 'Attacking Midfielder' },
  { code: 'ED', labelPt: 'Extremo Direito', labelEn: 'Right Winger' },
  { code: 'EE', labelPt: 'Extremo Esquerdo', labelEn: 'Left Winger' },
  { code: 'AD', labelPt: 'Ala Direito', labelEn: 'Right Wing-Back' },
  { code: 'AE', labelPt: 'Ala Esquerdo', labelEn: 'Left Wing-Back' },
  { code: 'SA', labelPt: 'Segundo Avançado', labelEn: 'Second Striker' },
  { code: 'PL', labelPt: 'Ponta de Lança', labelEn: 'Striker' },
] as const;

export const POSITION_CODES: PositionCode[] = POSITIONS.map((p) => p.code);

/** Extended squad slot codes — includes DC_E / DC_D for formation views. AD/AE excluded from squads */
export type SquadSlot = Exclude<PositionCode, 'AD' | 'AE' | 'MD' | 'ME'> | 'DC_E' | 'DC_D';

/** All valid squad slot codes (10 positions + 2 DC sub-slots, no AD/AE) */
const NON_SQUAD_POSITIONS = new Set(['AD', 'AE', 'MD', 'ME', 'SA']);
export const SQUAD_SLOT_CODES: SquadSlot[] = [...POSITION_CODES.filter((c) => !NON_SQUAD_POSITIONS.has(c)) as SquadSlot[], 'DC_E', 'DC_D'];

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
  { value: 'rejeitado', labelPt: 'Recusou vir', color: '#ef4444', tailwind: 'bg-red-500 text-white' },
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

/* ───────────── Age Groups (dynamic — season starts July 1) ───────────── */

// Season runs July to June. Season end year = the year the season finishes.
// e.g. in March 2026 → season 2025/26 → end year = 2026
// e.g. in September 2026 → season 2026/27 → end year = 2027
function getSeasonEndYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

// Sub-N: birth year = seasonEndYear - N
// Sénior: birth year ≤ seasonEndYear - 20
export function getAgeGroups(): { name: string; generationYear: number }[] {
  const endYear = getSeasonEndYear();
  return [
    { name: 'Sénior', generationYear: endYear - 20 },
    ...([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7] as const).map((n) => ({
      name: `Sub-${n}`,
      generationYear: endYear - n,
    })),
  ];
}

// Kept for backwards compat — computed once at import time
export const AGE_GROUPS = getAgeGroups();

/** Map birth year to age group name */
export function birthYearToAgeGroup(year: number): string | null {
  const endYear = getSeasonEndYear();
  const seniorCutoff = endYear - 20;
  if (year <= seniorCutoff) return 'Sénior';
  const age = endYear - year;
  if (age >= 7 && age <= 19) return `Sub-${age}`;
  return null;
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

// Dynamic season based on current date (season starts July 1)
export const CURRENT_SEASON = (() => {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
})();

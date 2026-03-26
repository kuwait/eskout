// src/lib/constants.ts
// Business rule constants, color maps, and lookup tables for the Eskout application
// Single source of truth for all domain enums and their display properties
// RELEVANT FILES: src/lib/types/index.ts, src/lib/utils/positions.ts, src/lib/validators.ts

import type { BuildScale, CalendarEventType, DecisionSide, DepartmentOpinion, HeightScale, IntensityScale, MaturationScale, ObservationTier, Player, PositionCode, RecruitmentStatus, SpeedScale, TrainingDecision, TrainingPresence } from '@/lib/types';

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

/** Special squad sections — non-positional groups below the pitch (real squads only) */
export const SPECIAL_SQUAD_SECTIONS = ['DUVIDA', 'POSSIBILIDADE'] as const;
export type SpecialSquadSection = typeof SPECIAL_SQUAD_SECTIONS[number];

/** Display labels for special squad sections */
export const SPECIAL_SECTION_LABELS: Record<SpecialSquadSection, string> = {
  DUVIDA: 'Dúvida',
  POSSIBILIDADE: 'Possibilidades',
};

/** Check if a position value is a special section (not a pitch slot) */
export function isSpecialSection(position: string): position is SpecialSquadSection {
  return position === 'DUVIDA' || position === 'POSSIBILIDADE';
}

/** Squad display slots — DC split into DC (E) and DC (D) for list/compare views */
export const SQUAD_SLOTS: { slot: SquadSlot; label: string }[] = [
  { slot: 'GR', label: 'Guarda-Redes' },
  { slot: 'DD', label: 'Defesa Direito' },
  { slot: 'DC_D', label: 'Central (D)' },
  { slot: 'DC_E', label: 'Central (E)' },
  { slot: 'DE', label: 'Defesa Esquerdo' },
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

/** Squad slot labels — includes DC_E/DC_D for formation views */
const SQUAD_SLOT_LABELS: Record<string, string> = Object.fromEntries(
  SQUAD_SLOTS.map((s) => [s.slot, s.label])
);

/** Resolve any position or squad slot code to a Portuguese label */
export function getPositionLabel(code: string | null | undefined): string {
  if (!code) return '';
  return POSITION_LABELS[code as PositionCode] ?? SQUAD_SLOT_LABELS[code] ?? code;
}

/* ───────────── Department Opinions ───────────── */

export const DEPARTMENT_OPINIONS: { value: DepartmentOpinion; color: string; tailwind: string }[] = [
  { value: '1ª Escolha', color: '#3b82f6', tailwind: 'bg-blue-500 text-white' },
  { value: '2ª Escolha', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'Acompanhar', color: '#eab308', tailwind: 'bg-yellow-500 text-white' },
  { value: 'Por Observar', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white' },
  { value: 'Urgente Observar', color: '#f97316', tailwind: 'bg-orange-500 text-white' },
  { value: 'Sem interesse', color: '#ef4444', tailwind: 'bg-red-500 text-white' },
  { value: 'Potencial', color: '#a855f7', tailwind: 'bg-purple-500 text-white' },
  { value: 'Ver em treino', color: '#06b6d4', tailwind: 'bg-cyan-500 text-white' },
  { value: 'Stand-by', color: '#64748b', tailwind: 'bg-slate-500 text-white' },
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
  /** Light variant: colored text on light bg with border (matches Opinião Departamento pattern) */
  tailwindLight: { bg: string; text: string; border: string; dot: string };
}[] = [
  { value: 'por_tratar', labelPt: 'Por tratar', color: '#a3a3a3', tailwind: 'bg-neutral-400 text-white', tailwindLight: { bg: 'bg-neutral-100', text: 'text-neutral-600', border: 'border-neutral-300', dot: 'bg-neutral-400' } },
  { value: 'em_contacto', labelPt: 'Em contacto', color: '#a855f7', tailwind: 'bg-purple-500 text-white', tailwindLight: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300', dot: 'bg-purple-500' } },
  { value: 'vir_treinar', labelPt: 'Vir treinar', color: '#3b82f6', tailwind: 'bg-blue-500 text-white', tailwindLight: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', dot: 'bg-blue-500' } },
  { value: 'reuniao_marcada', labelPt: 'Reunião Marcada', color: '#f97316', tailwind: 'bg-orange-500 text-white', tailwindLight: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500' } },
  { value: 'a_decidir', labelPt: 'A decidir', color: '#1e40af', tailwind: 'bg-blue-800 text-white', tailwindLight: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-800' } },
  { value: 'em_standby', labelPt: 'Em Stand-by', color: '#64748b', tailwind: 'bg-slate-500 text-white', tailwindLight: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-300', dot: 'bg-slate-500' } },
  { value: 'confirmado', labelPt: 'Confirmado', color: '#22c55e', tailwind: 'bg-green-500 text-white', tailwindLight: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', dot: 'bg-green-500' } },
  { value: 'assinou', labelPt: 'Assinou', color: '#16a34a', tailwind: 'bg-green-700 text-white', tailwindLight: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', dot: 'bg-emerald-600' } },
  { value: 'rejeitado', labelPt: 'Recusou vir', color: '#ef4444', tailwind: 'bg-red-500 text-white', tailwindLight: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-300', dot: 'bg-red-500' } },
];

export const RECRUITMENT_STATUS_MAP: Record<RecruitmentStatus, string> = Object.fromEntries(
  RECRUITMENT_STATUSES.map((s) => [s.value, s.tailwind])
) as Record<RecruitmentStatus, string>;

export const RECRUITMENT_LABEL_MAP: Record<RecruitmentStatus, string> = Object.fromEntries(
  RECRUITMENT_STATUSES.map((s) => [s.value, s.labelPt])
) as Record<RecruitmentStatus, string>;

/* ───────────── Decision Side (A Decidir sub-sections) ───────────── */

export const DECISION_SIDES: { value: DecisionSide; labelPt: string; icon: string }[] = [
  { value: 'club', labelPt: 'Clube a decidir', icon: 'Building2' },
  { value: 'player', labelPt: 'Jogador a decidir', icon: 'User' },
];

export const DECISION_SIDE_LABEL_MAP: Record<DecisionSide, string> = Object.fromEntries(
  DECISION_SIDES.map((d) => [d.value, d.labelPt])
) as Record<DecisionSide, string>;

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

/* ───────────── Nationalities (all 211 FIFA member associations) ───────────── */

export const NATIONALITIES = [
  // Lusófonos (prioritários no dropdown)
  { value: 'Portugal', flag: '🇵🇹' },
  { value: 'Brasil', flag: '🇧🇷' },
  { value: 'Angola', flag: '🇦🇴' },
  { value: 'Moçambique', flag: '🇲🇿' },
  { value: 'Cabo Verde', flag: '🇨🇻' },
  { value: 'Guiné-Bissau', flag: '🇬🇼' },
  { value: 'São Tomé e Príncipe', flag: '🇸🇹' },
  { value: 'Timor-Leste', flag: '🇹🇱' },
  // Resto — ordem alfabética
  { value: 'Afeganistão', flag: '🇦🇫' },
  { value: 'África do Sul', flag: '🇿🇦' },
  { value: 'Albânia', flag: '🇦🇱' },
  { value: 'Alemanha', flag: '🇩🇪' },
  { value: 'Andorra', flag: '🇦🇩' },
  { value: 'Antígua e Barbuda', flag: '🇦🇬' },
  { value: 'Arábia Saudita', flag: '🇸🇦' },
  { value: 'Argélia', flag: '🇩🇿' },
  { value: 'Argentina', flag: '🇦🇷' },
  { value: 'Arménia', flag: '🇦🇲' },
  { value: 'Aruba', flag: '🇦🇼' },
  { value: 'Austrália', flag: '🇦🇺' },
  { value: 'Áustria', flag: '🇦🇹' },
  { value: 'Azerbaijão', flag: '🇦🇿' },
  { value: 'Bahamas', flag: '🇧🇸' },
  { value: 'Bahrein', flag: '🇧🇭' },
  { value: 'Bangladesh', flag: '🇧🇩' },
  { value: 'Barbados', flag: '🇧🇧' },
  { value: 'Bélgica', flag: '🇧🇪' },
  { value: 'Belize', flag: '🇧🇿' },
  { value: 'Benim', flag: '🇧🇯' },
  { value: 'Bermudas', flag: '🇧🇲' },
  { value: 'Bielorrússia', flag: '🇧🇾' },
  { value: 'Bolívia', flag: '🇧🇴' },
  { value: 'Bonaire', flag: '🇧🇶' },
  { value: 'Bósnia e Herzegovina', flag: '🇧🇦' },
  { value: 'Botsuana', flag: '🇧🇼' },
  { value: 'Brunei', flag: '🇧🇳' },
  { value: 'Bulgária', flag: '🇧🇬' },
  { value: 'Burquina Faso', flag: '🇧🇫' },
  { value: 'Burundi', flag: '🇧🇮' },
  { value: 'Butão', flag: '🇧🇹' },
  { value: 'Camarões', flag: '🇨🇲' },
  { value: 'Camboja', flag: '🇰🇭' },
  { value: 'Canadá', flag: '🇨🇦' },
  { value: 'Catar', flag: '🇶🇦' },
  { value: 'Cazaquistão', flag: '🇰🇿' },
  { value: 'Chade', flag: '🇹🇩' },
  { value: 'Chéquia', flag: '🇨🇿' },
  { value: 'Chile', flag: '🇨🇱' },
  { value: 'China', flag: '🇨🇳' },
  { value: 'Chipre', flag: '🇨🇾' },
  { value: 'Colômbia', flag: '🇨🇴' },
  { value: 'Comores', flag: '🇰🇲' },
  { value: 'Congo', flag: '🇨🇬' },
  { value: 'Coreia do Norte', flag: '🇰🇵' },
  { value: 'Coreia do Sul', flag: '🇰🇷' },
  { value: 'Costa do Marfim', flag: '🇨🇮' },
  { value: 'Costa Rica', flag: '🇨🇷' },
  { value: 'Croácia', flag: '🇭🇷' },
  { value: 'Cuba', flag: '🇨🇺' },
  { value: 'Curaçau', flag: '🇨🇼' },
  { value: 'Dinamarca', flag: '🇩🇰' },
  { value: 'Djibuti', flag: '🇩🇯' },
  { value: 'Dominica', flag: '🇩🇲' },
  { value: 'Egito', flag: '🇪🇬' },
  { value: 'El Salvador', flag: '🇸🇻' },
  { value: 'Emirados Árabes Unidos', flag: '🇦🇪' },
  { value: 'Equador', flag: '🇪🇨' },
  { value: 'Eritreia', flag: '🇪🇷' },
  { value: 'Escócia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { value: 'Eslováquia', flag: '🇸🇰' },
  { value: 'Eslovénia', flag: '🇸🇮' },
  { value: 'Espanha', flag: '🇪🇸' },
  { value: 'Estados Unidos', flag: '🇺🇸' },
  { value: 'Estónia', flag: '🇪🇪' },
  { value: 'Essuatíni', flag: '🇸🇿' },
  { value: 'Etiópia', flag: '🇪🇹' },
  { value: 'Fiji', flag: '🇫🇯' },
  { value: 'Filipinas', flag: '🇵🇭' },
  { value: 'Finlândia', flag: '🇫🇮' },
  { value: 'França', flag: '🇫🇷' },
  { value: 'Gabão', flag: '🇬🇦' },
  { value: 'Gâmbia', flag: '🇬🇲' },
  { value: 'Gana', flag: '🇬🇭' },
  { value: 'Geórgia', flag: '🇬🇪' },
  { value: 'Gibraltar', flag: '🇬🇮' },
  { value: 'Granada', flag: '🇬🇩' },
  { value: 'Grécia', flag: '🇬🇷' },
  { value: 'Guam', flag: '🇬🇺' },
  { value: 'Guatemala', flag: '🇬🇹' },
  { value: 'Guiana', flag: '🇬🇾' },
  { value: 'Guiana Francesa', flag: '🇬🇫' },
  { value: 'Guiné', flag: '🇬🇳' },
  { value: 'Guiné Equatorial', flag: '🇬🇶' },
  { value: 'Haiti', flag: '🇭🇹' },
  { value: 'Holanda', flag: '🇳🇱' },
  { value: 'Honduras', flag: '🇭🇳' },
  { value: 'Hong Kong', flag: '🇭🇰' },
  { value: 'Hungria', flag: '🇭🇺' },
  { value: 'Iémen', flag: '🇾🇪' },
  { value: 'Ilhas Caimão', flag: '🇰🇾' },
  { value: 'Ilhas Cook', flag: '🇨🇰' },
  { value: 'Ilhas Faroé', flag: '🇫🇴' },
  { value: 'Ilhas Salomão', flag: '🇸🇧' },
  { value: 'Ilhas Turcas e Caicos', flag: '🇹🇨' },
  { value: 'Ilhas Virgens Americanas', flag: '🇻🇮' },
  { value: 'Ilhas Virgens Britânicas', flag: '🇻🇬' },
  { value: 'Índia', flag: '🇮🇳' },
  { value: 'Indonésia', flag: '🇮🇩' },
  { value: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { value: 'Irão', flag: '🇮🇷' },
  { value: 'Iraque', flag: '🇮🇶' },
  { value: 'Irlanda', flag: '🇮🇪' },
  { value: 'Irlanda do Norte', flag: '🇬🇧' },
  { value: 'Islândia', flag: '🇮🇸' },
  { value: 'Israel', flag: '🇮🇱' },
  { value: 'Itália', flag: '🇮🇹' },
  { value: 'Jamaica', flag: '🇯🇲' },
  { value: 'Japão', flag: '🇯🇵' },
  { value: 'Jordânia', flag: '🇯🇴' },
  { value: 'Kosovo', flag: '🇽🇰' },
  { value: 'Kuwait', flag: '🇰🇼' },
  { value: 'Laos', flag: '🇱🇦' },
  { value: 'Lesoto', flag: '🇱🇸' },
  { value: 'Letónia', flag: '🇱🇻' },
  { value: 'Líbano', flag: '🇱🇧' },
  { value: 'Libéria', flag: '🇱🇷' },
  { value: 'Líbia', flag: '🇱🇾' },
  { value: 'Listenstaine', flag: '🇱🇮' },
  { value: 'Lituânia', flag: '🇱🇹' },
  { value: 'Luxemburgo', flag: '🇱🇺' },
  { value: 'Macau', flag: '🇲🇴' },
  { value: 'Macedónia do Norte', flag: '🇲🇰' },
  { value: 'Madagáscar', flag: '🇲🇬' },
  { value: 'Malásia', flag: '🇲🇾' },
  { value: 'Maláui', flag: '🇲🇼' },
  { value: 'Maldivas', flag: '🇲🇻' },
  { value: 'Mali', flag: '🇲🇱' },
  { value: 'Malta', flag: '🇲🇹' },
  { value: 'Marrocos', flag: '🇲🇦' },
  { value: 'Maurícia', flag: '🇲🇺' },
  { value: 'Mauritânia', flag: '🇲🇷' },
  { value: 'México', flag: '🇲🇽' },
  { value: 'Mianmar', flag: '🇲🇲' },
  { value: 'Moldávia', flag: '🇲🇩' },
  { value: 'Mongólia', flag: '🇲🇳' },
  { value: 'Montenegro', flag: '🇲🇪' },
  { value: 'Montserrate', flag: '🇲🇸' },
  { value: 'Nepal', flag: '🇳🇵' },
  { value: 'Nicarágua', flag: '🇳🇮' },
  { value: 'Níger', flag: '🇳🇪' },
  { value: 'Nigéria', flag: '🇳🇬' },
  { value: 'Noruega', flag: '🇳🇴' },
  { value: 'Nova Caledónia', flag: '🇳🇨' },
  { value: 'Nova Zelândia', flag: '🇳🇿' },
  { value: 'Omã', flag: '🇴🇲' },
  { value: 'País de Gales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
  { value: 'Palau', flag: '🇵🇼' },
  { value: 'Palestina', flag: '🇵🇸' },
  { value: 'Panamá', flag: '🇵🇦' },
  { value: 'Papua-Nova Guiné', flag: '🇵🇬' },
  { value: 'Paquistão', flag: '🇵🇰' },
  { value: 'Paraguai', flag: '🇵🇾' },
  { value: 'Peru', flag: '🇵🇪' },
  { value: 'Polónia', flag: '🇵🇱' },
  { value: 'Porto Rico', flag: '🇵🇷' },
  { value: 'Quénia', flag: '🇰🇪' },
  { value: 'Quirguistão', flag: '🇰🇬' },
  { value: 'RD Congo', flag: '🇨🇩' },
  { value: 'República Centro-Africana', flag: '🇨🇫' },
  { value: 'República Dominicana', flag: '🇩🇴' },
  { value: 'Roménia', flag: '🇷🇴' },
  { value: 'Ruanda', flag: '🇷🇼' },
  { value: 'Rússia', flag: '🇷🇺' },
  { value: 'Samoa', flag: '🇼🇸' },
  { value: 'Samoa Americana', flag: '🇦🇸' },
  { value: 'San Marino', flag: '🇸🇲' },
  { value: 'Santa Lúcia', flag: '🇱🇨' },
  { value: 'São Cristóvão e Neves', flag: '🇰🇳' },
  { value: 'São Martinho', flag: '🇸🇽' },
  { value: 'São Vicente e Granadinas', flag: '🇻🇨' },
  { value: 'Senegal', flag: '🇸🇳' },
  { value: 'Serra Leoa', flag: '🇸🇱' },
  { value: 'Sérvia', flag: '🇷🇸' },
  { value: 'Seicheles', flag: '🇸🇨' },
  { value: 'Singapura', flag: '🇸🇬' },
  { value: 'Síria', flag: '🇸🇾' },
  { value: 'Somália', flag: '🇸🇴' },
  { value: 'Sri Lanca', flag: '🇱🇰' },
  { value: 'Sudão', flag: '🇸🇩' },
  { value: 'Sudão do Sul', flag: '🇸🇸' },
  { value: 'Suécia', flag: '🇸🇪' },
  { value: 'Suíça', flag: '🇨🇭' },
  { value: 'Suriname', flag: '🇸🇷' },
  { value: 'Tailândia', flag: '🇹🇭' },
  { value: 'Taipé Chinesa', flag: '🇹🇼' },
  { value: 'Tajiquistão', flag: '🇹🇯' },
  { value: 'Tanzânia', flag: '🇹🇿' },
  { value: 'Togo', flag: '🇹🇬' },
  { value: 'Tonga', flag: '🇹🇴' },
  { value: 'Trindade e Tobago', flag: '🇹🇹' },
  { value: 'Tunísia', flag: '🇹🇳' },
  { value: 'Turquemenistão', flag: '🇹🇲' },
  { value: 'Turquia', flag: '🇹🇷' },
  { value: 'Ucrânia', flag: '🇺🇦' },
  { value: 'Uganda', flag: '🇺🇬' },
  { value: 'Uruguai', flag: '🇺🇾' },
  { value: 'Usbequistão', flag: '🇺🇿' },
  { value: 'Vanuatu', flag: '🇻🇺' },
  { value: 'Venezuela', flag: '🇻🇪' },
  { value: 'Vietname', flag: '🇻🇳' },
  { value: 'Zâmbia', flag: '🇿🇲' },
  { value: 'Zimbabué', flag: '🇿🇼' },
] as const;

/** Strip diacritics for accent-insensitive comparison (e.g. "África" matches "Africa") */
function normalizeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Alternative spellings found in DB/FPF data → canonical NATIONALITIES value (all lowercase, pre-normalized) */
const NATIONALITY_ALIASES: Record<string, string> = {
  'republica checa': 'chequia',
  'republica pop.da china': 'china',
  'republica popular da china': 'china',
  'inglaterra / reino unido': 'inglaterra',
  'reino unido': 'inglaterra',
  'paises baixos': 'holanda',
  'bosnia': 'bosnia e herzegovina',
  'rd congo': 'rd congo',
  'republica dominicana': 'republica dominicana',
  'republica centro-africana': 'republica centro-africana',
  'eua': 'estados unidos',
  'usa': 'estados unidos',
  'south africa': 'africa do sul',
  'ivory coast': 'costa do marfim',
};

/** Get flag emoji for a nationality, or generic globe if not found */
export function getNationalityFlag(nationality: string | null): string {
  if (!nationality) return '';
  const normalized = normalizeAccents(nationality.toLowerCase().trim());
  // Check aliases first for DB values with completely different names
  const aliased = NATIONALITY_ALIASES[normalized] ?? normalized;
  const entry = NATIONALITIES.find(
    (n) => normalizeAccents(n.value.toLowerCase()) === aliased,
  );
  return entry?.flag ?? '🌍';
}

/* ───────────── Country Dial Codes ───────────── */

/** Common country dial codes for phone input — ordered by relevance to Portuguese football scouting */
export const COUNTRY_DIAL_CODES = [
  { code: '+351', flag: '🇵🇹', country: 'Portugal' },
  { code: '+55',  flag: '🇧🇷', country: 'Brasil' },
  { code: '+244', flag: '🇦🇴', country: 'Angola' },
  { code: '+258', flag: '🇲🇿', country: 'Moçambique' },
  { code: '+238', flag: '🇨🇻', country: 'Cabo Verde' },
  { code: '+245', flag: '🇬🇼', country: 'Guiné-Bissau' },
  { code: '+34',  flag: '🇪🇸', country: 'Espanha' },
  { code: '+33',  flag: '🇫🇷', country: 'França' },
  { code: '+49',  flag: '🇩🇪', country: 'Alemanha' },
  { code: '+44',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'Inglaterra' },
  { code: '+39',  flag: '🇮🇹', country: 'Itália' },
  { code: '+31',  flag: '🇳🇱', country: 'Holanda' },
  { code: '+32',  flag: '🇧🇪', country: 'Bélgica' },
  { code: '+41',  flag: '🇨🇭', country: 'Suíça' },
  { code: '+40',  flag: '🇷🇴', country: 'Roménia' },
  { code: '+234', flag: '🇳🇬', country: 'Nigéria' },
  { code: '+221', flag: '🇸🇳', country: 'Senegal' },
  { code: '+233', flag: '🇬🇭', country: 'Gana' },
  { code: '+212', flag: '🇲🇦', country: 'Marrocos' },
] as const;

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
    ...([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3] as const).map((n) => ({
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
  if (age >= 3 && age <= 19) return `Sub-${age}`;
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

/* ───────────── Training Presence ───────────── */

export const TRAINING_PRESENCE: { value: TrainingPresence; labelPt: string; icon: string; color: string }[] = [
  { value: 'attended', labelPt: 'Veio', icon: '✓', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'missed', labelPt: 'Faltou', icon: '✗', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'rescheduled', labelPt: 'Reagendado', icon: '↻', color: 'bg-amber-50 text-amber-700 border-amber-200' },
];

/* ───────────── Training Decision (Decisão Pós-Treino) ───────────── */

export const TRAINING_DECISIONS: { value: TrainingDecision; labelPt: string; icon: string; color: string; colorActive: string }[] = [
  { value: 'assinar', labelPt: 'Assinar', icon: '✓', color: 'bg-green-100/80 text-green-600 border-green-200', colorActive: 'bg-green-500 text-white border-green-500 shadow-sm' },
  { value: 'repetir', labelPt: 'Repetir', icon: '↻', color: 'bg-blue-100/80 text-blue-600 border-blue-200', colorActive: 'bg-blue-500 text-white border-blue-500 shadow-sm' },
  { value: 'duvidas', labelPt: 'Dúvidas', icon: '?', color: 'bg-amber-100/80 text-amber-600 border-amber-200', colorActive: 'bg-amber-500 text-white border-amber-500 shadow-sm' },
  { value: 'descartar', labelPt: 'Descartar', icon: '✗', color: 'bg-red-100/80 text-red-600 border-red-200', colorActive: 'bg-red-500 text-white border-red-500 shadow-sm' },
];

/** Coach decisions (external feedback) — same values as TRAINING_DECISIONS */
export const COACH_DECISIONS: { value: string; labelPt: string; icon: string; color: string; colorActive: string }[] = [
  { value: 'assinar', labelPt: 'Assinar', icon: '✓', color: 'bg-green-100/80 text-green-600 border-green-200', colorActive: 'bg-green-500 text-white border-green-500 shadow-sm' },
  { value: 'repetir', labelPt: 'Repetir', icon: '↻', color: 'bg-blue-100/80 text-blue-600 border-blue-200', colorActive: 'bg-blue-500 text-white border-blue-500 shadow-sm' },
  { value: 'duvidas', labelPt: 'Dúvidas', icon: '?', color: 'bg-amber-100/80 text-amber-600 border-amber-200', colorActive: 'bg-amber-500 text-white border-amber-500 shadow-sm' },
  { value: 'descartar', labelPt: 'Descartar', icon: '✗', color: 'bg-red-100/80 text-red-600 border-red-200', colorActive: 'bg-red-500 text-white border-red-500 shadow-sm' },
];

/* ───────────── Training Physical Scales ───────────── */

export const HEIGHT_SCALE_OPTIONS: { value: HeightScale; labelPt: string }[] = [
  { value: 'alto', labelPt: 'Alto' },
  { value: 'normal', labelPt: 'Normal' },
  { value: 'baixo', labelPt: 'Baixo' },
];

export const BUILD_SCALE_OPTIONS: { value: BuildScale; labelPt: string }[] = [
  { value: 'ectomorfo', labelPt: 'Ecto' },
  { value: 'mesomorfo', labelPt: 'Meso' },
  { value: 'endomorfo', labelPt: 'Endo' },
];

export const SPEED_SCALE_OPTIONS: { value: SpeedScale; labelPt: string }[] = [
  { value: 'rapido', labelPt: 'Rápido' },
  { value: 'normal', labelPt: 'Normal' },
  { value: 'lento', labelPt: 'Lento' },
];

export const INTENSITY_SCALE_OPTIONS: { value: IntensityScale; labelPt: string }[] = [
  { value: 'intenso', labelPt: 'Intenso' },
  { value: 'pouco_intenso', labelPt: 'Pouco intenso' },
];

export const MATURATION_SCALE_OPTIONS: { value: MaturationScale; labelPt: string }[] = [
  { value: 'nada_maturado', labelPt: 'Nada' },
  { value: 'a_iniciar', labelPt: 'Início' },
  { value: 'maturado', labelPt: 'Maturado' },
  { value: 'super_maturado', labelPt: 'Super' },
];

/* ───────────── Training Tags (multi-select per category) ───────────── */

export const TRAINING_TAG_CATEGORIES: { category: string; labelPt: string; tags: { value: string; labelPt: string }[] }[] = [
  {
    category: 'tecnica',
    labelPt: 'Técnica',
    tags: [
      { value: 'boa_qualidade', labelPt: 'Boa qualidade' },
      { value: 'bom_passe', labelPt: 'Bom passe' },
      { value: 'bom_remate', labelPt: 'Bom remate' },
      { value: 'bom_drible', labelPt: 'Bom drible' },
      { value: 'bom_pe_esquerdo', labelPt: 'Bom pé esquerdo' },
      { value: 'bom_pe_direito', labelPt: 'Bom pé direito' },
      { value: 'bom_cabeceamento', labelPt: 'Bom cabeceamento' },
      { value: 'bom_primeiro_toque', labelPt: 'Bom 1º toque' },
      { value: 'fraco_com_bola', labelPt: 'Fraco com bola' },
    ],
  },
  {
    category: 'tatico',
    labelPt: 'Tático',
    tags: [
      { value: 'bom_posicionamento', labelPt: 'Bom posicionamento' },
      { value: 'leitura_jogo', labelPt: 'Leitura de jogo' },
      { value: 'desorientado', labelPt: 'Desorientado' },
      { value: 'disciplinado', labelPt: 'Disciplinado' },
    ],
  },
  {
    category: 'mental',
    labelPt: 'Mental',
    tags: [
      { value: 'boa_atitude', labelPt: 'Boa atitude' },
      { value: 'comunicativo', labelPt: 'Comunicativo' },
      { value: 'competitivo', labelPt: 'Competitivo' },
      { value: 'timido', labelPt: 'Tímido' },
      { value: 'nervoso', labelPt: 'Nervoso' },
      { value: 'agressivo', labelPt: 'Agressivo' },
      { value: 'inteligente', labelPt: 'Inteligente' },
      { value: 'lider', labelPt: 'Líder' },
      { value: 'desligado', labelPt: 'Desligado' },
    ],
  },
  {
    category: 'adaptacao',
    labelPt: 'Adaptação',
    tags: [
      { value: 'adaptou_se_bem', labelPt: 'Adaptou-se bem' },
      { value: 'dificuldade_contexto', labelPt: 'Dificuldade no contexto' },
      { value: 'precisa_tempo', labelPt: 'Precisa de tempo' },
      { value: 'nivel_acima', labelPt: 'Nível acima' },
      { value: 'nivel_abaixo', labelPt: 'Nível abaixo' },
      { value: 'resistente', labelPt: 'Resistente' },
    ],
  },
];

/** Flat lookup: tag value → label */
export const TRAINING_TAG_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TRAINING_TAG_CATEGORIES.flatMap((c) => c.tags.map((t) => [t.value, t.labelPt]))
);

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

/* ───────────── FPF Competition Scraping ───────────── */

export const FPF_RESULTS_BASE = 'https://resultados.fpf.pt';

/** Season ID formula: 95 + (startYear - 2015). E.g. 2025/26 → 105 */
export function getFpfResultsSeasonId(startYear: number): number {
  return 95 + (startYear - 2015);
}

/** Current season ID for resultados.fpf.pt */
export const FPF_CURRENT_SEASON_ID = (() => {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return getFpfResultsSeasonId(startYear);
})();

/** FPF ClassId → escalão name mapping */
export const FPF_CLASS_TO_ESCALAO: Record<number, string> = {
  10: 'Sub-7',
  9: 'Sub-9',
  8: 'Sub-11',
  6: 'Sub-13',
  5: 'Sub-15',
  4: 'Sub-17',
  3: 'Sub-19',
  2: 'Sénior',
};

/** Match duration in minutes by escalão (official FPF rules)
 *  Sub-13 and below: 30+30=60 | Sub-14/15: 40+40=80 | Sub-16+: 45+45=90 */
export const ESCALAO_MATCH_DURATION: Record<string, number> = {
  'Sub-7': 40,
  'Sub-8': 40,
  'Sub-9': 40,
  'Sub-10': 50,
  'Sub-11': 50,
  'Sub-12': 60,
  'Sub-13': 60,
  'Sub-14': 80,
  'Sub-15': 80,
  'Sub-16': 90,
  'Sub-17': 90,
  'Sub-18': 90,
  'Sub-19': 90,
  'Sénior': 90,
};

/** Expected birth year range per escalão for a given season start year.
 *  Used for "Playing Up" detection — if player DOB is outside this range, they're playing above. */
export function getEscalaoBirthYearRange(escalao: string, seasonStartYear: number): { start: number; end: number } | null {
  // Sub-N → players born in (ref - N). E.g. Sub-15 2025/26 → ref 2026 → born 2011.
  // "start" = the birth year for this escalão, "end" = same (single year).
  // Players born AFTER "end" are "playing up" (younger, from a lower escalão).
  // Sub-19 spans multiple years (2004-2007 for 2025/26).
  const offsets: Record<string, [number, number]> = {
    'Sub-7': [-7, -7],
    'Sub-8': [-8, -8],
    'Sub-9': [-9, -9],
    'Sub-10': [-10, -10],
    'Sub-11': [-11, -11],
    'Sub-12': [-12, -12],
    'Sub-13': [-13, -13],
    'Sub-14': [-14, -14],
    'Sub-15': [-15, -15],
    'Sub-16': [-16, -16],
    'Sub-17': [-17, -17],
    'Sub-18': [-18, -18],
    'Sub-19': [-22, -19],
  };
  const range = offsets[escalao];
  if (!range) return null;
  // Season start year + 1 = the reference year (e.g. 2025/26 → reference 2026)
  const ref = seasonStartYear + 1;
  return { start: ref + range[0], end: ref + range[1] };
}

/* ───────────── Available Seasons ───────────── */

/** List available FPF seasons (computed — FPF has data from 2015/16 to current) */
export function getAvailableSeasons(): { seasonId: number; label: string }[] {
  const now = new Date();
  const currentStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const seasons: { seasonId: number; label: string }[] = [];

  for (let startYear = currentStartYear; startYear >= 2015; startYear--) {
    seasons.push({
      seasonId: 95 + (startYear - 2015),
      label: `${startYear}/${startYear + 1}`,
    });
  }

  return seasons;
}

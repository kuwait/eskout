// src/lib/validators.ts
// Zod schemas for runtime validation of forms, API inputs, and data boundaries
// Shared between client (forms) and server (actions)
// RELEVANT FILES: src/lib/types/index.ts, src/lib/constants.ts, src/actions/players.ts

import { z } from 'zod';

/* ───────────── Login ───────────── */

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Palavra-passe tem de ter pelo menos 6 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/* ───────────── Player Form ───────────── */

const POSITION_CODES = ['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL', ''] as const;
const FOOT_VALUES = ['Dir', 'Esq', 'Amb', ''] as const;
const OPINION_VALUES = [
  '1ª Escolha', '2ª Escolha', 'Acompanhar',
  'Por Observar', 'Urgente Observar', 'Sem interesse', 'Potencial',
  'Ver em treino', 'Stand-by', 'Assinar', '',
] as const;
const RECRUITMENT_VALUES = [
  'por_tratar', 'em_contacto', 'vir_treinar',
  'reuniao_marcada', 'a_decidir', 'em_standby', 'confirmado', 'assinou', 'rejeitado',
] as const;

export const playerFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  dob: z.string().min(1, 'Data de nascimento é obrigatória'),
  positionNormalized: z.enum(POSITION_CODES).default(''),
  club: z.string().min(1, 'Clube é obrigatório'),
  foot: z.enum(FOOT_VALUES).default(''),
  shirtNumber: z.string().default(''),
  contact: z.string().default(''),
  departmentOpinion: z.preprocess(
    (val) => {
      // FormData sends comma-separated or multiple entries; ensure array
      if (typeof val === 'string') return val ? val.split(',') : [];
      if (Array.isArray(val)) return val;
      return [];
    },
    z.array(z.enum(OPINION_VALUES)).default(['Por Observar'])
  ),
  observer: z.string().default(''),
  observerEval: z.string().default(''),
  observerDecision: z.string().default(''),
  referredBy: z.string().default(''),
  notes: z.string().default(''),
  fpfLink: z.string().url('URL FPF inválido').or(z.literal('')).default(''),
  zerozeroLink: z.string().url('URL ZeroZero inválido').or(z.literal('')).default(''),
  recruitmentStatus: z.enum(RECRUITMENT_VALUES).optional(),
  // Scraped fields — auto-filled from FPF/ZeroZero, stored on player creation
  photoUrl: z.string().default(''),
  height: z.string().default(''),
  weight: z.string().default(''),
  nationality: z.string().default(''),
  birthCountry: z.string().default(''),
});

export type PlayerFormData = z.infer<typeof playerFormSchema>;

/* ───────────── Player Edit (partial — admin only) ───────────── */

export const playerEditSchema = playerFormSchema.partial();
export type PlayerEditData = z.infer<typeof playerEditSchema>;

/* ───────────── Observation Note ───────────── */

export const observationNoteSchema = z.object({
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  matchContext: z.string().default(''),
});

export type ObservationNoteData = z.infer<typeof observationNoteSchema>;

/* ───────────── Squad Position (shared enum for real & shadow squad slots) ───────────── */

const SQUAD_POSITION_CODES = ['GR', 'DD', 'DE', 'DC', 'DC_E', 'DC_D', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL', 'DUVIDA', 'POSSIBILIDADE'] as const;

/* ───────────── Shadow Squad ───────────── */

export const shadowSquadSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  position: z.enum(SQUAD_POSITION_CODES, { message: 'Posição inválida' }),
});

export type ShadowSquadData = z.infer<typeof shadowSquadSchema>;

/* ───────────── Real Squad ───────────── */

export const realSquadSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  position: z.enum(SQUAD_POSITION_CODES, { message: 'Posição inválida' }),
});

export type RealSquadData = z.infer<typeof realSquadSchema>;

/* ───────────── Custom Squads ───────────── */

export const createSquadSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(60, 'Máximo 60 caracteres'),
  squadType: z.enum(['real', 'shadow'], { message: 'Tipo de plantel inválido' }),
  ageGroupId: z.number().int().positive('Escalão inválido').optional(),
  description: z.string().max(200, 'Máximo 200 caracteres').optional(),
});

export type CreateSquadData = z.infer<typeof createSquadSchema>;

export const renameSquadSchema = z.object({
  squadId: z.number().int().positive(),
  name: z.string().min(1, 'Nome é obrigatório').max(60, 'Máximo 60 caracteres'),
});

export type RenameSquadData = z.infer<typeof renameSquadSchema>;

export const updateSquadDescriptionSchema = z.object({
  squadId: z.number().int().positive(),
  description: z.string().max(200, 'Máximo 200 caracteres').optional(),
});

export type UpdateSquadDescriptionData = z.infer<typeof updateSquadDescriptionSchema>;

export const squadPlayerSchema = z.object({
  squadId: z.number().int().positive(),
  playerId: z.number().int().positive('ID de jogador inválido'),
  position: z.enum(SQUAD_POSITION_CODES, { message: 'Posição inválida' }),
});

export type SquadPlayerData = z.infer<typeof squadPlayerSchema>;

/* ───────────── Recruitment Status Change ───────────── */

export const recruitmentStatusChangeSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  newStatus: z.enum([
    'por_tratar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'em_standby', 'confirmado', 'assinou', 'rejeitado',
  ], {
    message: 'Estado de recrutamento inválido',
  }),
  note: z.string().optional(),
});

export type RecruitmentStatusChangeData = z.infer<typeof recruitmentStatusChangeSchema>;

/* ───────────── Decision Side (A Decidir sub-sections) ───────────── */

export const decisionSideSchema = z.enum(['club', 'player']);

/* ───────────── Calendar Event ───────────── */

const EVENT_TYPES = ['treino', 'assinatura', 'reuniao', 'observacao', 'outro'] as const;

export const calendarEventSchema = z.object({
  ageGroupId: z.number().int().positive('Escalão inválido').optional(),
  playerId: z.number().int().positive('ID de jogador inválido').optional(),
  eventType: z.enum(EVENT_TYPES, { message: 'Tipo de evento inválido' }),
  title: z.string().min(1, 'Título é obrigatório'),
  eventDate: z.string().min(1, 'Data é obrigatória'),
  eventTime: z.string().optional(),
  location: z.string().default(''),
  notes: z.string().default(''),
  assigneeUserId: z.string().uuid('ID de utilizador inválido').optional(),
  assigneeName: z.string().default(''),
});

export type CalendarEventFormData = z.infer<typeof calendarEventSchema>;

/* ───────────── Training Feedback ───────────── */

const TRAINING_PRESENCE_VALUES = ['attended', 'missed', 'rescheduled'] as const;
const TRAINING_DECISION_VALUES = ['assinar', 'repetir', 'duvidas', 'descartar', 'sem_decisao'] as const;
const HEIGHT_SCALE_VALUES = ['alto', 'normal', 'baixo'] as const;
const BUILD_SCALE_VALUES = ['ectomorfo', 'mesomorfo', 'endomorfo'] as const;
const SPEED_SCALE_VALUES = ['rapido', 'normal', 'lento'] as const;
const INTENSITY_SCALE_VALUES = ['intenso', 'pouco_intenso'] as const;
const MATURATION_SCALE_VALUES = ['nada_maturado', 'a_iniciar', 'maturado', 'super_maturado'] as const;

export const trainingFeedbackSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  trainingDate: z.string().min(1, 'Data de treino é obrigatória'),
  escalao: z.string().optional(),
  presence: z.enum(TRAINING_PRESENCE_VALUES, { message: 'Presença inválida' }),
  feedback: z.string().optional(),
  ratingPerformance: z.number().int().min(1).max(5).optional(),
  ratingPotential: z.number().int().min(1).max(5).optional(),
  decision: z.enum(TRAINING_DECISION_VALUES).default('sem_decisao'),
  heightScale: z.enum(HEIGHT_SCALE_VALUES).nullable().optional(),
  buildScale: z.enum(BUILD_SCALE_VALUES).nullable().optional(),
  speedScale: z.enum(SPEED_SCALE_VALUES).nullable().optional(),
  intensityScale: z.enum(INTENSITY_SCALE_VALUES).nullable().optional(),
  maturation: z.enum(MATURATION_SCALE_VALUES).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export type TrainingFeedbackFormData = z.infer<typeof trainingFeedbackSchema>;

/* ───────────── Coach Feedback (external, via share link) ───────────── */

const COACH_DECISION_VALUES = ['assinar', 'repetir', 'descartar', 'duvidas'] as const;

export const coachFeedbackSchema = z.object({
  feedback: z.string().min(1, 'Feedback é obrigatório'),
  ratingPerformance: z.number().int().min(1, 'Avaliação de rendimento é obrigatória').max(5),
  ratingPotential: z.number().int().min(1, 'Avaliação de potencial é obrigatória').max(5),
  decision: z.enum(COACH_DECISION_VALUES, { message: 'Decisão é obrigatória' }),
  heightScale: z.enum(HEIGHT_SCALE_VALUES).nullable().optional(),
  buildScale: z.enum(BUILD_SCALE_VALUES).nullable().optional(),
  speedScale: z.enum(SPEED_SCALE_VALUES).nullable().optional(),
  intensityScale: z.enum(INTENSITY_SCALE_VALUES).nullable().optional(),
  maturation: z.enum(MATURATION_SCALE_VALUES).nullable().optional(),
  tags: z.array(z.string()).default([]),
  observedPosition: z.string().min(1, 'Posição é obrigatória'),
  coachName: z.string().min(1, 'Nome é obrigatório'),
});

export type CoachFeedbackFormData = z.infer<typeof coachFeedbackSchema>;

/* ───────────── Player Lists ───────────── */

export const createListSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(50, 'Máximo 50 caracteres'),
  emoji: z.string().default('📋'),
});

export type CreateListData = z.infer<typeof createListSchema>;

export const renameListSchema = z.object({
  listId: z.number().int().positive(),
  name: z.string().min(1, 'Nome é obrigatório').max(50, 'Máximo 50 caracteres'),
  emoji: z.string().optional(),
});

export type RenameListData = z.infer<typeof renameListSchema>;

export const addToListSchema = z.object({
  listId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  note: z.string().optional(),
});

export type AddToListData = z.infer<typeof addToListSchema>;

/* ───────────── Saved Comparisons ───────────── */

export const saveComparisonSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(60, 'Máximo 60 caracteres'),
  playerIds: z.array(z.number().int().positive()).min(2, 'Mínimo 2 jogadores').max(3, 'Máximo 3 jogadores'),
});

export type SaveComparisonData = z.infer<typeof saveComparisonSchema>;

/* ───────────── Player Videos ───────────── */

/** Matches youtube.com/watch, youtu.be, youtube.com/shorts */
const YOUTUBE_URL_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

export const addVideoSchema = z.object({
  playerId: z.number().int().positive(),
  url: z.string().url('URL inválido').regex(YOUTUBE_URL_REGEX, 'Apenas URLs do YouTube'),
  note: z.string().max(100, 'Máximo 100 caracteres').optional(),
});

export type AddVideoData = z.infer<typeof addVideoSchema>;

/* ───────────── FPF Competition Scraping ───────────── */

export const addFpfCompetitionSchema = z.object({
  fpfCompetitionId: z.number().int().positive(),
  fpfSeasonId: z.number().int().positive(),
  name: z.string().min(1, 'Nome obrigatório'),
  associationName: z.string().nullable().optional(),
  associationId: z.number().int().nullable().optional(),
  classId: z.number().int().nullable().optional(),
  escalao: z.string().nullable().optional(),
  season: z.string().min(1, 'Época obrigatória'),
  matchDurationMinutes: z.number().int().min(20).max(120).optional(),
});

export type AddFpfCompetitionData = z.infer<typeof addFpfCompetitionSchema>;

/* ───────────── Quick Scout Reports ───────────── */

const QUICK_REPORT_RECOMMENDATIONS = ['Assinar', 'Acompanhar', 'Sem interesse'] as const;
const QUICK_REPORT_MATURATIONS = ['Atrasado', 'Normal', 'Avançado'] as const;
const QUICK_REPORT_FEET = ['Direito', 'Esquerdo', 'Ambos'] as const;
const QUICK_REPORT_STANDOUTS = ['Acima', 'Ao nível', 'Abaixo'] as const;
const QUICK_REPORT_STARTERS = ['Titular', 'Suplente'] as const;
const PHYSICAL_HEIGHTS = ['alto', 'normal', 'baixo'] as const;
const PHYSICAL_BUILDS = ['ectomorfo', 'mesomorfo', 'endomorfo'] as const;
const PHYSICAL_SPEEDS = ['rapido', 'normal', 'lento'] as const;
const PHYSICAL_INTENSITIES = ['intenso', 'pouco_intenso'] as const;
const PHYSICAL_MATURATIONS = ['nada_maturado', 'a_iniciar', 'maturado', 'super_maturado'] as const;
const QUICK_REPORT_OPPONENT_LEVELS = ['Forte', 'Médio', 'Fraco'] as const;

export const quickScoutReportSchema = z.object({
  playerId: z.number().int().positive(),
  ratingTecnica: z.number().int().min(1).max(5),
  ratingTatica: z.number().int().min(1).max(5),
  ratingFisico: z.number().int().min(1).max(5),
  ratingMentalidade: z.number().int().min(1).max(5),
  ratingPotencial: z.number().int().min(1).max(5),
  ratingOverall: z.number().int().min(1).max(5),
  recommendation: z.enum(QUICK_REPORT_RECOMMENDATIONS),
  tagsTecnica: z.array(z.string()).default([]),
  tagsTatica: z.array(z.string()).default([]),
  tagsFisico: z.array(z.string()).default([]),
  tagsMentalidade: z.array(z.string()).default([]),
  tagsPotencial: z.array(z.string()).default([]),
  maturation: z.enum(QUICK_REPORT_MATURATIONS).optional(),
  observedFoot: z.enum(QUICK_REPORT_FEET).optional(),
  heightScale: z.enum(PHYSICAL_HEIGHTS).optional(),
  buildScale: z.enum(PHYSICAL_BUILDS).optional(),
  speedScale: z.enum(PHYSICAL_SPEEDS).optional(),
  intensityScale: z.enum(PHYSICAL_INTENSITIES).optional(),
  maturationScale: z.enum(PHYSICAL_MATURATIONS).optional(),
  opponentLevel: z.enum(QUICK_REPORT_OPPONENT_LEVELS).optional(),
  observedPosition: z.string().optional(),
  minutesObserved: z.number().int().min(1).max(120).optional(),
  standoutLevel: z.enum(QUICK_REPORT_STANDOUTS).optional(),
  starter: z.enum(QUICK_REPORT_STARTERS).optional(),
  subMinute: z.number().int().min(1).max(120).optional(),
  conditions: z.array(z.string()).default([]),
  competition: z.string().optional(),
  opponent: z.string().optional(),
  matchDate: z.string().optional(),
  notes: z.string().optional(),
  gameId: z.number().int().positive().optional(),
});

export type QuickScoutReportData = z.infer<typeof quickScoutReportSchema>;

/* ───────────── Scouting Map ───────────── */

const SCOUTING_ROUND_STATUSES = ['draft', 'published', 'closed'] as const;

export const scoutingRoundSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Máximo 100 caracteres'),
  startDate: z.string().min(1, 'Data de início é obrigatória'),
  endDate: z.string().min(1, 'Data de fim é obrigatória'),
  status: z.enum(SCOUTING_ROUND_STATUSES).default('published'),
  notes: z.string().default(''),
});

export type ScoutingRoundFormData = z.infer<typeof scoutingRoundSchema>;

export const scoutingGameSchema = z.object({
  roundId: z.number().int().positive('Ronda inválida'),
  fpfMatchId: z.number().int().positive().optional(),
  homeTeam: z.string().min(1, 'Equipa da casa é obrigatória'),
  awayTeam: z.string().min(1, 'Equipa visitante é obrigatória'),
  matchDate: z.string().min(1, 'Data do jogo é obrigatória'),
  matchTime: z.string().optional(),
  venue: z.string().optional(),
  competitionName: z.string().optional(),
  escalao: z.string().optional(),
  priority: z.number().int().min(0).max(5).default(0),
  notes: z.string().default(''),
});

export type ScoutingGameFormData = z.infer<typeof scoutingGameSchema>;

const ASSIGNMENT_STATUSES = ['assigned', 'confirmed', 'completed', 'cancelled'] as const;

export const scoutAssignmentSchema = z.object({
  gameId: z.number().int().positive('Jogo inválido'),
  scoutId: z.string().uuid('ID de scout inválido'),
  status: z.enum(ASSIGNMENT_STATUSES).default('assigned'),
  coordinatorNotes: z.string().default(''),
});

export type ScoutAssignmentFormData = z.infer<typeof scoutAssignmentSchema>;

const AVAILABILITY_TYPES = ['always', 'full_day', 'period', 'time_range'] as const;
const AVAILABILITY_PERIODS = ['morning', 'afternoon', 'evening'] as const;

export const scoutAvailabilitySchema = z.object({
  roundId: z.number().int().positive('Ronda inválida'),
  availabilityType: z.enum(AVAILABILITY_TYPES),
  availableDate: z.string().optional(),
  period: z.enum(AVAILABILITY_PERIODS).optional(),
  timeStart: z.string().optional(),
  timeEnd: z.string().optional(),
  notes: z.string().default(''),
}).refine(
  (data) => data.availabilityType === 'always' || !!data.availableDate,
  { message: 'Data é obrigatória para este tipo de disponibilidade', path: ['availableDate'] }
).refine(
  (data) => data.availabilityType !== 'period' || !!data.period,
  { message: 'Período é obrigatório', path: ['period'] }
).refine(
  (data) => data.availabilityType !== 'time_range' || (!!data.timeStart && !!data.timeEnd),
  { message: 'Hora início e fim são obrigatórias', path: ['timeStart'] }
);

export type ScoutAvailabilityFormData = z.infer<typeof scoutAvailabilitySchema>;

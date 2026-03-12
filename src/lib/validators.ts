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
  'Por Observar', 'Urgente Observar', 'Sem interesse', 'Potencial', 'Assinar', '',
] as const;
const RECRUITMENT_VALUES = [
  'por_tratar', 'em_contacto', 'vir_treinar',
  'reuniao_marcada', 'a_decidir', 'confirmado', 'assinou', 'rejeitado',
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

const SQUAD_POSITION_CODES = ['GR', 'DD', 'DE', 'DC', 'DC_E', 'DC_D', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'] as const;

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

/* ───────────── Recruitment Status Change ───────────── */

export const recruitmentStatusChangeSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  newStatus: z.enum([
    'por_tratar', 'em_contacto', 'vir_treinar',
    'reuniao_marcada', 'a_decidir', 'confirmado', 'assinou', 'rejeitado',
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

export const trainingFeedbackSchema = z.object({
  playerId: z.number().int().positive('ID de jogador inválido'),
  trainingDate: z.string().min(1, 'Data de treino é obrigatória'),
  escalao: z.string().optional(),
  presence: z.enum(TRAINING_PRESENCE_VALUES, { message: 'Presença inválida' }),
  feedback: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export type TrainingFeedbackFormData = z.infer<typeof trainingFeedbackSchema>;

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

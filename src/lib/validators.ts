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
  'Por Observar', 'Urgente Observar', 'Sem interesse', 'Potencial', '',
] as const;
const RECRUITMENT_VALUES = [
  'pool', 'shortlist', 'to_observe', 'target',
  'in_contact', 'negotiating', 'confirmed', 'rejected',
] as const;

export const playerFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  dob: z.string().min(1, 'Data de nascimento é obrigatória'),
  positionNormalized: z.enum(POSITION_CODES).default(''),
  club: z.string().min(1, 'Clube é obrigatório'),
  foot: z.enum(FOOT_VALUES).default(''),
  shirtNumber: z.string().default(''),
  contact: z.string().default(''),
  departmentOpinion: z.enum(OPINION_VALUES).default('Por Observar'),
  observer: z.string().default(''),
  observerEval: z.string().default(''),
  observerDecision: z.string().default(''),
  referredBy: z.string().default(''),
  notes: z.string().default(''),
  fpfLink: z.string().url('URL FPF inválido').or(z.literal('')).default(''),
  zerozeroLink: z.string().url('URL ZeroZero inválido').or(z.literal('')).default(''),
  recruitmentStatus: z.enum(RECRUITMENT_VALUES).default('pool'),
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

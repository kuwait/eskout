// src/lib/__tests__/validators.test.ts
// Tests for Zod validation schemas — ensures forms reject invalid data
// Covers login, player form, calendar event, observation note, squad schemas
// RELEVANT FILES: src/lib/validators.ts, src/lib/types/index.ts

import {
  loginSchema,
  playerFormSchema,
  observationNoteSchema,
  shadowSquadSchema,
  realSquadSchema,
  createSquadSchema,
  renameSquadSchema,
  updateSquadDescriptionSchema,
  squadPlayerSchema,
  calendarEventSchema,
  recruitmentStatusChangeSchema,
  trainingFeedbackSchema,
  saveComparisonSchema,
  addVideoSchema,
  quickScoutReportSchema,
} from '@/lib/validators';

/* ───────────── loginSchema ───────────── */

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'admin@boavista.pt', password: 'seguro123' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'seguro123' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = loginSchema.safeParse({ email: 'admin@boavista.pt', password: '12345' });
    expect(result.success).toBe(false);
  });
});

/* ───────────── playerFormSchema ───────────── */

describe('playerFormSchema', () => {
  const validPlayer = {
    name: 'João Silva',
    dob: '2012-03-15',
    club: 'Boavista FC',
  };

  it('accepts minimal valid player (name + dob + club)', () => {
    const result = playerFormSchema.safeParse(validPlayer);
    expect(result.success).toBe(true);
  });

  it('populates defaults for optional fields', () => {
    const result = playerFormSchema.safeParse(validPlayer);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.foot).toBe('');
      expect(result.data.shirtNumber).toBe('');
      expect(result.data.notes).toBe('');
    }
  });

  it('rejects missing name', () => {
    const result = playerFormSchema.safeParse({ dob: '2012-03-15', club: 'Boavista' });
    expect(result.success).toBe(false);
  });

  it('rejects missing club', () => {
    const result = playerFormSchema.safeParse({ name: 'João', dob: '2012-03-15' });
    expect(result.success).toBe(false);
  });

  it('preprocesses departmentOpinion string to array', () => {
    const result = playerFormSchema.safeParse({
      ...validPlayer,
      departmentOpinion: '1ª Escolha,Acompanhar',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.departmentOpinion).toEqual(['1ª Escolha', 'Acompanhar']);
    }
  });

  it('accepts valid position codes', () => {
    const result = playerFormSchema.safeParse({ ...validPlayer, positionNormalized: 'DC' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid FPF URL', () => {
    const result = playerFormSchema.safeParse({ ...validPlayer, fpfLink: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts empty FPF URL', () => {
    const result = playerFormSchema.safeParse({ ...validPlayer, fpfLink: '' });
    expect(result.success).toBe(true);
  });
});

/* ───────────── observationNoteSchema ───────────── */

describe('observationNoteSchema', () => {
  it('accepts valid note', () => {
    const result = observationNoteSchema.safeParse({ content: 'Bom posicionamento.' });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = observationNoteSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('defaults matchContext to empty string', () => {
    const result = observationNoteSchema.safeParse({ content: 'Nota' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matchContext).toBe('');
    }
  });
});

/* ───────────── shadowSquadSchema ───────────── */

describe('shadowSquadSchema', () => {
  it('accepts valid player + position', () => {
    const result = shadowSquadSchema.safeParse({ playerId: 42, position: 'DC' });
    expect(result.success).toBe(true);
  });

  it('accepts DC sub-slots', () => {
    expect(shadowSquadSchema.safeParse({ playerId: 1, position: 'DC_E' }).success).toBe(true);
    expect(shadowSquadSchema.safeParse({ playerId: 1, position: 'DC_D' }).success).toBe(true);
  });

  it('accepts special section positions (DUVIDA, POSSIBILIDADE)', () => {
    expect(shadowSquadSchema.safeParse({ playerId: 1, position: 'DUVIDA' }).success).toBe(true);
    expect(shadowSquadSchema.safeParse({ playerId: 1, position: 'POSSIBILIDADE' }).success).toBe(true);
  });

  it('rejects invalid position', () => {
    const result = shadowSquadSchema.safeParse({ playerId: 42, position: 'XX' });
    expect(result.success).toBe(false);
  });

  it('rejects negative playerId', () => {
    const result = shadowSquadSchema.safeParse({ playerId: -1, position: 'DC' });
    expect(result.success).toBe(false);
  });
});

/* ───────────── realSquadSchema ───────────── */

describe('realSquadSchema', () => {
  it('accepts valid player + position', () => {
    const result = realSquadSchema.safeParse({ playerId: 10, position: 'MC' });
    expect(result.success).toBe(true);
  });

  it('accepts DC sub-slots', () => {
    expect(realSquadSchema.safeParse({ playerId: 1, position: 'DC_E' }).success).toBe(true);
    expect(realSquadSchema.safeParse({ playerId: 1, position: 'DC_D' }).success).toBe(true);
  });

  it('accepts special section positions (DUVIDA, POSSIBILIDADE)', () => {
    expect(realSquadSchema.safeParse({ playerId: 1, position: 'DUVIDA' }).success).toBe(true);
    expect(realSquadSchema.safeParse({ playerId: 1, position: 'POSSIBILIDADE' }).success).toBe(true);
  });

  it('rejects invalid position', () => {
    expect(realSquadSchema.safeParse({ playerId: 1, position: 'ZZ' }).success).toBe(false);
  });

  it('rejects negative playerId', () => {
    expect(realSquadSchema.safeParse({ playerId: -1, position: 'GR' }).success).toBe(false);
  });
});

/* ───────────── createSquadSchema ───────────── */

describe('createSquadSchema', () => {
  it('accepts valid real squad', () => {
    const result = createSquadSchema.safeParse({ name: 'Sub-15 A', squadType: 'real' });
    expect(result.success).toBe(true);
  });

  it('accepts valid shadow squad with ageGroupId', () => {
    const result = createSquadSchema.safeParse({ name: 'Sombra B', squadType: 'shadow', ageGroupId: 3 });
    expect(result.success).toBe(true);
  });

  it('accepts optional description', () => {
    const result = createSquadSchema.safeParse({ name: 'A', squadType: 'real', description: 'Campeonato Nacional' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(createSquadSchema.safeParse({ name: '', squadType: 'real' }).success).toBe(false);
  });

  it('rejects name over 60 characters', () => {
    expect(createSquadSchema.safeParse({ name: 'A'.repeat(61), squadType: 'real' }).success).toBe(false);
  });

  it('rejects invalid squad type', () => {
    expect(createSquadSchema.safeParse({ name: 'Test', squadType: 'mixed' }).success).toBe(false);
  });

  it('rejects description over 200 characters', () => {
    expect(createSquadSchema.safeParse({ name: 'A', squadType: 'real', description: 'X'.repeat(201) }).success).toBe(false);
  });
});

/* ───────────── renameSquadSchema ───────────── */

describe('renameSquadSchema', () => {
  it('accepts valid rename', () => {
    expect(renameSquadSchema.safeParse({ squadId: 1, name: 'Sub-15 B' }).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(renameSquadSchema.safeParse({ squadId: 1, name: '' }).success).toBe(false);
  });

  it('rejects non-positive squadId', () => {
    expect(renameSquadSchema.safeParse({ squadId: 0, name: 'Test' }).success).toBe(false);
  });
});

/* ───────────── updateSquadDescriptionSchema ───────────── */

describe('updateSquadDescriptionSchema', () => {
  it('accepts valid description update', () => {
    expect(updateSquadDescriptionSchema.safeParse({ squadId: 5, description: 'Liga Nacional' }).success).toBe(true);
  });

  it('accepts empty/undefined description (clear)', () => {
    expect(updateSquadDescriptionSchema.safeParse({ squadId: 5 }).success).toBe(true);
  });

  it('rejects description over 200 characters', () => {
    expect(updateSquadDescriptionSchema.safeParse({ squadId: 5, description: 'X'.repeat(201) }).success).toBe(false);
  });

  it('rejects non-positive squadId', () => {
    expect(updateSquadDescriptionSchema.safeParse({ squadId: -1, description: 'Test' }).success).toBe(false);
  });
});

/* ───────────── squadPlayerSchema ───────────── */

describe('squadPlayerSchema', () => {
  it('accepts valid squad player assignment', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 42, position: 'DC' }).success).toBe(true);
  });

  it('accepts DC sub-slots', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 1, position: 'DC_D' }).success).toBe(true);
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 1, position: 'DC_E' }).success).toBe(true);
  });

  it('accepts special section positions (DUVIDA, POSSIBILIDADE)', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 1, position: 'DUVIDA' }).success).toBe(true);
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 1, position: 'POSSIBILIDADE' }).success).toBe(true);
  });

  it('rejects invalid position', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: 1, position: 'XX' }).success).toBe(false);
  });

  it('rejects negative playerId', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 1, playerId: -1, position: 'GR' }).success).toBe(false);
  });

  it('rejects non-positive squadId', () => {
    expect(squadPlayerSchema.safeParse({ squadId: 0, playerId: 1, position: 'GR' }).success).toBe(false);
  });
});

/* ───────────── calendarEventSchema ───────────── */

describe('calendarEventSchema', () => {
  const validEvent = {
    eventType: 'treino' as const,
    title: 'Treino de avaliação',
    eventDate: '2025-02-15',
  };

  it('accepts valid event', () => {
    const result = calendarEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const result = calendarEventSchema.safeParse({ eventType: 'treino', eventDate: '2025-02-15' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event type', () => {
    const result = calendarEventSchema.safeParse({ ...validEvent, eventType: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid event types', () => {
    for (const type of ['treino', 'assinatura', 'reuniao', 'observacao', 'outro']) {
      expect(calendarEventSchema.safeParse({ ...validEvent, eventType: type }).success).toBe(true);
    }
  });
});

/* ───────────── trainingFeedbackSchema ───────────── */

describe('trainingFeedbackSchema', () => {
  const validFeedback = {
    playerId: 42,
    trainingDate: '2026-03-10',
    presence: 'attended' as const,
  };

  it('accepts valid minimal feedback (playerId + date + presence)', () => {
    const result = trainingFeedbackSchema.safeParse(validFeedback);
    expect(result.success).toBe(true);
  });

  it('accepts all valid presence values', () => {
    for (const p of ['attended', 'missed', 'rescheduled']) {
      expect(trainingFeedbackSchema.safeParse({ ...validFeedback, presence: p }).success).toBe(true);
    }
  });

  it('rejects invalid presence value', () => {
    const result = trainingFeedbackSchema.safeParse({ ...validFeedback, presence: 'late' });
    expect(result.success).toBe(false);
  });

  it('accepts optional feedback text', () => {
    const result = trainingFeedbackSchema.safeParse({ ...validFeedback, feedback: 'Bom treino.' });
    expect(result.success).toBe(true);
  });

  it('accepts ratingPerformance and ratingPotential 1–5', () => {
    for (const r of [1, 2, 3, 4, 5]) {
      expect(trainingFeedbackSchema.safeParse({ ...validFeedback, ratingPerformance: r }).success).toBe(true);
      expect(trainingFeedbackSchema.safeParse({ ...validFeedback, ratingPotential: r }).success).toBe(true);
    }
  });

  it('rejects rating outside 1–5', () => {
    expect(trainingFeedbackSchema.safeParse({ ...validFeedback, ratingPerformance: 0 }).success).toBe(false);
    expect(trainingFeedbackSchema.safeParse({ ...validFeedback, ratingPerformance: 6 }).success).toBe(false);
  });

  it('rejects missing trainingDate', () => {
    const result = trainingFeedbackSchema.safeParse({ playerId: 42, presence: 'attended', trainingDate: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative playerId', () => {
    const result = trainingFeedbackSchema.safeParse({ ...validFeedback, playerId: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts optional escalao', () => {
    const result = trainingFeedbackSchema.safeParse({ ...validFeedback, escalao: 'Sub-14' });
    expect(result.success).toBe(true);
  });
});

/* ───────────── recruitmentStatusChangeSchema ───────────── */

describe('recruitmentStatusChangeSchema', () => {
  it('accepts valid status change', () => {
    const result = recruitmentStatusChangeSchema.safeParse({
      playerId: 1,
      newStatus: 'vir_treinar',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = recruitmentStatusChangeSchema.safeParse({
      playerId: 1,
      newStatus: 'invalid_status',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional note', () => {
    const result = recruitmentStatusChangeSchema.safeParse({
      playerId: 1,
      newStatus: 'em_contacto',
      note: 'Contactado o pai.',
    });
    expect(result.success).toBe(true);
  });
});

/* ───────────── saveComparisonSchema ───────────── */

describe('saveComparisonSchema', () => {
  it('accepts valid comparison with 2 players', () => {
    const result = saveComparisonSchema.safeParse({ name: 'Gustavo vs Martim', playerIds: [1, 2] });
    expect(result.success).toBe(true);
  });

  it('accepts valid comparison with 3 players', () => {
    const result = saveComparisonSchema.safeParse({ name: 'Trio DC', playerIds: [10, 20, 30] });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = saveComparisonSchema.safeParse({ name: '', playerIds: [1, 2] });
    expect(result.success).toBe(false);
  });

  it('rejects name over 60 characters', () => {
    const result = saveComparisonSchema.safeParse({ name: 'A'.repeat(61), playerIds: [1, 2] });
    expect(result.success).toBe(false);
  });

  it('rejects fewer than 2 players', () => {
    const result = saveComparisonSchema.safeParse({ name: 'Solo', playerIds: [1] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 3 players', () => {
    const result = saveComparisonSchema.safeParse({ name: 'Demais', playerIds: [1, 2, 3, 4] });
    expect(result.success).toBe(false);
  });
});

/* ───────────── addVideoSchema ───────────── */

describe('addVideoSchema', () => {
  it('accepts youtube.com/watch URL', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(result.success).toBe(true);
  });

  it('accepts youtu.be short URL', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(result.success).toBe(true);
  });

  it('accepts youtube.com/shorts URL', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://youtube.com/shorts/dQw4w9WgXcQ' });
    expect(result.success).toBe(true);
  });

  it('accepts optional note', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://youtu.be/abc123xyz99', note: 'Golo vs Benfica' });
    expect(result.success).toBe(true);
  });

  it('rejects non-YouTube URL', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://vimeo.com/12345' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects note over 100 characters', () => {
    const result = addVideoSchema.safeParse({ playerId: 1, url: 'https://youtu.be/dQw4w9WgXcQ', note: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

/* ───────────── quickScoutReportSchema ───────────── */

describe('quickScoutReportSchema', () => {
  const validReport = {
    playerId: 1,
    ratingTecnica: 4,
    ratingTatica: 3,
    ratingFisico: 5,
    ratingMentalidade: 2,
    ratingPotencial: 4,
    ratingOverall: 4,
    recommendation: 'Acompanhar' as const,
  };

  it('accepts valid report', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('accepts ratingOverall at minimum 1', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts ratingOverall at maximum 5', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects ratingOverall of 0', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects ratingOverall of 6', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer ratingOverall', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 3.5 });
    expect(result.success).toBe(false);
  });

  it('rejects dimension rating of 0', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingTecnica: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects dimension rating of 6', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingTecnica: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer dimension rating', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingTecnica: 3.5 });
    expect(result.success).toBe(false);
  });

  it('accepts all valid recommendations', () => {
    for (const rec of ['Assinar', 'Acompanhar', 'Sem interesse']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, recommendation: rec });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid recommendation', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, recommendation: 'Rever' });
    expect(result.success).toBe(false);
  });

  it('defaults tag arrays to empty when omitted', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tagsTecnica).toEqual([]);
      expect(result.data.tagsFisico).toEqual([]);
    }
  });

  it('rejects missing playerId', () => {
    const { playerId: _omitted, ...rest } = validReport; // eslint-disable-line @typescript-eslint/no-unused-vars
    const result = quickScoutReportSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts valid maturation values', () => {
    for (const mat of ['Atrasado', 'Normal', 'Avançado']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, maturation: mat });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid maturation value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, maturation: 'Precoce' });
    expect(result.success).toBe(false);
  });

  it('accepts omitted maturation (optional)', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.maturation).toBeUndefined();
  });

  it('accepts valid observedFoot values', () => {
    for (const foot of ['Direito', 'Esquerdo', 'Ambos']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, observedFoot: foot });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid observedFoot value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, observedFoot: 'Misto' });
    expect(result.success).toBe(false);
  });

  it('accepts omitted observedFoot (optional)', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.observedFoot).toBeUndefined();
  });

  it('accepts valid standoutLevel values', () => {
    for (const level of ['Acima', 'Ao nível', 'Abaixo']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, standoutLevel: level });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid standoutLevel value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, standoutLevel: 'Médio' });
    expect(result.success).toBe(false);
  });

  it('accepts valid starter values', () => {
    for (const s of ['Titular', 'Suplente']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, starter: s });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid starter value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, starter: 'Banco' });
    expect(result.success).toBe(false);
  });

  it('accepts minutesObserved within range', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, minutesObserved: 70 });
    expect(result.success).toBe(true);
  });

  it('rejects minutesObserved of 0', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, minutesObserved: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects minutesObserved above 120', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, minutesObserved: 121 });
    expect(result.success).toBe(false);
  });

  it('accepts subMinute within range', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, subMinute: 45 });
    expect(result.success).toBe(true);
  });

  it('accepts observedPosition as string', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, observedPosition: 'MC' });
    expect(result.success).toBe(true);
  });

  it('accepts conditions as string array', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, conditions: ['🌧️ Chuva', '🏟️ Sintético'] });
    expect(result.success).toBe(true);
  });

  it('defaults conditions to empty array when omitted', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.conditions).toEqual([]);
  });

  it('accepts valid heightImpression values', () => {
    for (const h of ['Baixo', 'Médio', 'Alto']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, heightImpression: h });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid heightImpression value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, heightImpression: 'Enorme' });
    expect(result.success).toBe(false);
  });

  it('accepts valid buildImpression values', () => {
    for (const b of ['Magro', 'Normal', 'Robusto']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, buildImpression: b });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid buildImpression value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, buildImpression: 'Gordo' });
    expect(result.success).toBe(false);
  });

  it('accepts valid opponentLevel values', () => {
    for (const lvl of ['Forte', 'Médio', 'Fraco']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, opponentLevel: lvl });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid opponentLevel value', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, opponentLevel: 'Razoável' });
    expect(result.success).toBe(false);
  });

  it('accepts full report with all optional fields', () => {
    const fullReport = {
      ...validReport,
      tagsTecnica: ['Passe', 'Drible'],
      tagsTatica: ['Posicionamento'],
      tagsFisico: [],
      tagsMentalidade: ['Combativo'],
      tagsPotencial: ['Alto potencial'],
      maturation: 'Normal' as const,
      observedFoot: 'Direito' as const,
      heightImpression: 'Alto' as const,
      buildImpression: 'Robusto' as const,
      opponentLevel: 'Forte' as const,
      observedPosition: 'DC(E)',
      minutesObserved: 70,
      standoutLevel: 'Acima' as const,
      starter: 'Titular' as const,
      subMinute: undefined,
      conditions: ['🌧️ Chuva', '🏟️ Sintético'],
      competition: 'Campeonato Distrital Sub-15',
      opponent: 'Boavista vs Leixões',
      matchDate: '2026-03-15',
      notes: 'Jogador muito dominante no jogo aéreo',
    };
    const result = quickScoutReportSchema.safeParse(fullReport);
    expect(result.success).toBe(true);
  });

  it('accepts suplente with subMinute', () => {
    const result = quickScoutReportSchema.safeParse({
      ...validReport,
      starter: 'Suplente',
      subMinute: 55,
    });
    expect(result.success).toBe(true);
  });

  it('rejects subMinute of 0', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, subMinute: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects subMinute above 120', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, subMinute: 121 });
    expect(result.success).toBe(false);
  });

  it('accepts observedPosition DC(E) and DC(D)', () => {
    for (const pos of ['DC(E)', 'DC(D)', 'GR', 'MC', 'PL']) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, observedPosition: pos });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all dimension ratings at boundaries (1 and 5)', () => {
    const dims = ['ratingTecnica', 'ratingTatica', 'ratingFisico', 'ratingMentalidade', 'ratingPotencial'] as const;
    for (const dim of dims) {
      for (const v of [1, 5]) {
        const result = quickScoutReportSchema.safeParse({ ...validReport, [dim]: v });
        expect(result.success).toBe(true);
      }
    }
  });

  it('rejects all dimension ratings at 0', () => {
    const dims = ['ratingTecnica', 'ratingTatica', 'ratingFisico', 'ratingMentalidade', 'ratingPotencial'] as const;
    for (const dim of dims) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, [dim]: 0 });
      expect(result.success).toBe(false);
    }
  });

  it('rejects non-integer for all dimension ratings', () => {
    const dims = ['ratingTecnica', 'ratingTatica', 'ratingFisico', 'ratingMentalidade', 'ratingPotencial', 'ratingOverall'] as const;
    for (const dim of dims) {
      const result = quickScoutReportSchema.safeParse({ ...validReport, [dim]: 2.5 });
      expect(result.success).toBe(false);
    }
  });

  it('accepts omitted optional context fields', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maturation).toBeUndefined();
      expect(result.data.observedFoot).toBeUndefined();
      expect(result.data.heightImpression).toBeUndefined();
      expect(result.data.buildImpression).toBeUndefined();
      expect(result.data.opponentLevel).toBeUndefined();
      expect(result.data.observedPosition).toBeUndefined();
      expect(result.data.minutesObserved).toBeUndefined();
      expect(result.data.standoutLevel).toBeUndefined();
      expect(result.data.starter).toBeUndefined();
      expect(result.data.subMinute).toBeUndefined();
      expect(result.data.conditions).toEqual([]);
      expect(result.data.competition).toBeUndefined();
      expect(result.data.opponent).toBeUndefined();
      expect(result.data.matchDate).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it('rejects minutesObserved as non-integer', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, minutesObserved: 45.5 });
    expect(result.success).toBe(false);
  });
});

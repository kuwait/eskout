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

  it('accepts rating 1–5', () => {
    for (const r of [1, 2, 3, 4, 5]) {
      expect(trainingFeedbackSchema.safeParse({ ...validFeedback, rating: r }).success).toBe(true);
    }
  });

  it('rejects rating outside 1–5', () => {
    expect(trainingFeedbackSchema.safeParse({ ...validFeedback, rating: 0 }).success).toBe(false);
    expect(trainingFeedbackSchema.safeParse({ ...validFeedback, rating: 6 }).success).toBe(false);
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
    ratingOverall: 3.5,
    recommendation: 'Acompanhar' as const,
  };

  it('accepts valid report with half-star overall', () => {
    const result = quickScoutReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('accepts ratingOverall at minimum 0.5', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 0.5 });
    expect(result.success).toBe(true);
  });

  it('accepts ratingOverall at maximum 5', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 5 });
    expect(result.success).toBe(true);
  });

  it.each([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])('accepts ratingOverall %s', (v) => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: v });
    expect(result.success).toBe(true);
  });

  it('rejects ratingOverall of 0', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects ratingOverall of 5.5', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rejects ratingOverall not a 0.5 multiple (0.3)', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 0.3 });
    expect(result.success).toBe(false);
  });

  it('rejects ratingOverall not a 0.5 multiple (2.7)', () => {
    const result = quickScoutReportSchema.safeParse({ ...validReport, ratingOverall: 2.7 });
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
    const { playerId, ...rest } = validReport;
    const result = quickScoutReportSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

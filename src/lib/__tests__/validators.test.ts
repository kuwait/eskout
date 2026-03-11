// src/lib/__tests__/validators.test.ts
// Tests for Zod validation schemas — ensures forms reject invalid data
// Covers login, player form, calendar event, observation note, squad schemas
// RELEVANT FILES: src/lib/validators.ts, src/lib/types/index.ts

import {
  loginSchema,
  playerFormSchema,
  observationNoteSchema,
  shadowSquadSchema,
  calendarEventSchema,
  recruitmentStatusChangeSchema,
  trainingFeedbackSchema,
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

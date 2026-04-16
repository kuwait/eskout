// src/lib/__tests__/email.test.ts
// Testes dos helpers de email de training-sessions — subject, intro e CTA por kind (Fase 6)
// Garante que reschedule/cancel não dizem "Nova tarefa" e que o texto muda conforme o tipo
// RELEVANT FILES: src/lib/email.ts, src/actions/notifications.ts, src/actions/training-feedback.ts

import { buildSubject, buildIntro, buildCtaLabel, type TaskEmailData } from '@/lib/email';

/* ───────────── Helpers ───────────── */

const baseData: TaskEmailData = {
  to: 'user@test.com',
  recipientName: 'Diogo',
  assignedByName: 'Carlos',
  taskTitle: '⚽ Registar feedback do treino',
  taskSource: 'pipeline_training',
  playerName: 'João Silva',
  playerClub: 'Boavista FC',
  playerPhotoUrl: null,
  playerContact: null,
  playerPosition: 'DC',
  playerDob: '2012-03-15',
  playerFoot: 'Dir',
  playerFpfLink: null,
  playerZzLink: null,
  contactPurpose: null,
  dueDate: '2026-04-22',
  trainingEscalao: 'Sub-14',
  tasksUrl: 'https://eskout.com/tarefas',
  clubName: 'Boavista FC',
};

/* ───────────── buildSubject ───────────── */

describe('buildSubject', () => {
  it('kind=created → "Nova tarefa: ..." (default compatível)', () => {
    expect(buildSubject({ ...baseData, kind: 'created' }))
      .toBe('Nova tarefa: Registar feedback do treino');
  });

  it('kind undefined → usa fallback "created"', () => {
    expect(buildSubject(baseData))
      .toBe('Nova tarefa: Registar feedback do treino');
  });

  it('kind=rescheduled → "Treino alterado — <player>"', () => {
    expect(buildSubject({ ...baseData, kind: 'rescheduled' }))
      .toBe('Treino alterado — João Silva');
  });

  it('kind=cancelled → "Treino cancelado — <player>"', () => {
    expect(buildSubject({ ...baseData, kind: 'cancelled' }))
      .toBe('Treino cancelado — João Silva');
  });

  it('rescheduled sem playerName → "Treino alterado" (sem emdash)', () => {
    expect(buildSubject({ ...baseData, kind: 'rescheduled', playerName: null }))
      .toBe('Treino alterado');
  });

  it('cancelled sem playerName → "Treino cancelado"', () => {
    expect(buildSubject({ ...baseData, kind: 'cancelled', playerName: null }))
      .toBe('Treino cancelado');
  });

  it('subject created remove emoji do título', () => {
    const subject = buildSubject({ ...baseData, kind: 'created' });
    expect(subject).not.toContain('⚽');
  });

  it('subject created remove purpose suffix (" — X")', () => {
    const subject = buildSubject({
      ...baseData,
      kind: 'created',
      taskTitle: '📞 Contactar João — Vir Treinar',
    });
    expect(subject).toBe('Nova tarefa: Contactar João');
    expect(subject).not.toContain('—');
  });

  it('rescheduled/cancelled nunca começam com "Nova tarefa"', () => {
    expect(buildSubject({ ...baseData, kind: 'rescheduled' })).not.toMatch(/^Nova tarefa/);
    expect(buildSubject({ ...baseData, kind: 'cancelled' })).not.toMatch(/^Nova tarefa/);
  });
});

/* ───────────── buildIntro ───────────── */

describe('buildIntro', () => {
  it('kind=created → "atribuiu-te uma nova tarefa"', () => {
    const intro = buildIntro({ ...baseData, kind: 'created' });
    expect(intro).toContain('atribuiu-te uma nova tarefa');
  });

  it('kind=rescheduled → "alterou a data de um treino"', () => {
    const intro = buildIntro({ ...baseData, kind: 'rescheduled' });
    expect(intro).toContain('alterou a data de um treino');
    expect(intro).not.toContain('nova tarefa');
  });

  it('kind=cancelled → "cancelou um treino"', () => {
    const intro = buildIntro({ ...baseData, kind: 'cancelled' });
    expect(intro).toContain('cancelou um treino');
    expect(intro).not.toContain('nova tarefa');
  });

  it('inclui nome de quem fez a ação em bold', () => {
    const intro = buildIntro({ ...baseData, assignedByName: 'Ana' });
    expect(intro).toContain('<strong>Ana</strong>');
  });

  it('escapa HTML no assignedByName (prevenir XSS)', () => {
    const intro = buildIntro({ ...baseData, assignedByName: '<script>alert(1)</script>' });
    expect(intro).not.toContain('<script>');
    expect(intro).toContain('&lt;script&gt;');
  });

  it('kind undefined → fallback created intro', () => {
    const intro = buildIntro(baseData);
    expect(intro).toContain('atribuiu-te uma nova tarefa');
  });
});

/* ───────────── buildCtaLabel ───────────── */

describe('buildCtaLabel', () => {
  it('created → "Ver Tarefas"', () => {
    expect(buildCtaLabel('created')).toBe('Ver Tarefas');
  });

  it('undefined → "Ver Tarefas" (fallback)', () => {
    expect(buildCtaLabel(undefined)).toBe('Ver Tarefas');
  });

  it('rescheduled → "Ver nova data"', () => {
    expect(buildCtaLabel('rescheduled')).toBe('Ver nova data');
  });

  it('cancelled → "Ver detalhes"', () => {
    expect(buildCtaLabel('cancelled')).toBe('Ver detalhes');
  });
});

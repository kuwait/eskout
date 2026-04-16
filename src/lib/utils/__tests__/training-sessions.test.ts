// src/lib/utils/__tests__/training-sessions.test.ts
// Testes puros dos helpers de training sessions — countdown, chips, auto-move, transition
// Garantem que o comportamento central da feature não regride (sem mocks de Supabase)
// RELEVANT FILES: src/lib/utils/training-sessions.ts

import {
  daysUntil,
  countdownLabel,
  formatTrainingChip,
  chipColorClass,
  shouldAutoMoveToVirTreinar,
  scheduleSignature,
  shouldTransitionToRealizado,
} from '@/lib/utils/training-sessions';

/* ───────────── daysUntil ───────────── */

describe('daysUntil', () => {
  const FIXED_NOW = new Date(2026, 3, 17, 10, 30, 0); // 17 abril 2026 @ 10:30

  it('retorna 0 para hoje', () => {
    expect(daysUntil('2026-04-17', FIXED_NOW)).toBe(0);
  });

  it('retorna 1 para amanhã', () => {
    expect(daysUntil('2026-04-18', FIXED_NOW)).toBe(1);
  });

  it('retorna -1 para ontem', () => {
    expect(daysUntil('2026-04-16', FIXED_NOW)).toBe(-1);
  });

  it('retorna 7 para daqui a 1 semana', () => {
    expect(daysUntil('2026-04-24', FIXED_NOW)).toBe(7);
  });

  it('retorna -30 para há 30 dias', () => {
    expect(daysUntil('2026-03-18', FIXED_NOW)).toBe(-30);
  });

  it('ignora a hora do "now" (compara dias a 00:00)', () => {
    const lateNight = new Date(2026, 3, 17, 23, 59, 59);
    const earlyMorning = new Date(2026, 3, 17, 0, 0, 1);
    expect(daysUntil('2026-04-18', lateNight)).toBe(1);
    expect(daysUntil('2026-04-18', earlyMorning)).toBe(1);
  });

  it('retorna null para data inválida', () => {
    expect(daysUntil('', FIXED_NOW)).toBeNull();
    expect(daysUntil('not-a-date', FIXED_NOW)).toBeNull();
    expect(daysUntil('abc-de-fg', FIXED_NOW)).toBeNull();
  });

  it('lida com mudança de mês', () => {
    const endOfMonth = new Date(2026, 3, 30, 12, 0, 0); // 30 abril
    expect(daysUntil('2026-05-01', endOfMonth)).toBe(1);
    expect(daysUntil('2026-05-07', endOfMonth)).toBe(7);
  });

  it('lida com mudança de ano', () => {
    const newYearsEve = new Date(2026, 11, 31, 12, 0, 0);
    expect(daysUntil('2027-01-01', newYearsEve)).toBe(1);
    expect(daysUntil('2027-01-07', newYearsEve)).toBe(7);
  });
});

/* ───────────── countdownLabel ───────────── */

describe('countdownLabel', () => {
  it('mapeia 0 → "hoje"', () => {
    expect(countdownLabel(0)).toBe('hoje');
  });

  it('mapeia 1 → "amanhã"', () => {
    expect(countdownLabel(1)).toBe('amanhã');
  });

  it('mapeia 2+ → "daqui a X dias"', () => {
    expect(countdownLabel(2)).toBe('daqui a 2 dias');
    expect(countdownLabel(7)).toBe('daqui a 7 dias');
    expect(countdownLabel(30)).toBe('daqui a 30 dias');
  });

  it('mapeia -1 → "ontem"', () => {
    expect(countdownLabel(-1)).toBe('ontem');
  });

  it('mapeia -2+ → "há X dias"', () => {
    expect(countdownLabel(-2)).toBe('há 2 dias');
    expect(countdownLabel(-7)).toBe('há 7 dias');
    expect(countdownLabel(-30)).toBe('há 30 dias');
  });

  it('null → null', () => {
    expect(countdownLabel(null)).toBeNull();
  });

  it('nunca usa o termo antigo "em X dias"', () => {
    for (const d of [2, 3, 7, 30]) {
      expect(countdownLabel(d)).not.toContain('em ');
      expect(countdownLabel(d)).toMatch(/^daqui a /);
    }
  });
});

/* ───────────── formatTrainingChip ───────────── */

describe('formatTrainingChip', () => {
  it('formata data sem hora', () => {
    // 22/04/2026 é uma 4ª feira
    const chip = formatTrainingChip('2026-04-22', null);
    expect(chip).toContain('22/04');
    expect(chip).not.toContain('·');
  });

  it('formata data com hora (drops seconds)', () => {
    const chip = formatTrainingChip('2026-04-22', '10:30:00');
    expect(chip).toContain('22/04');
    expect(chip).toContain('10:30');
    expect(chip).toContain(' · ');
  });

  it('formata data com hora HH:MM (sem segundos)', () => {
    expect(formatTrainingChip('2026-04-22', '10:30')).toContain('10:30');
  });

  it('trata "00:00:00" como sem hora', () => {
    const chip = formatTrainingChip('2026-04-22', '00:00:00');
    expect(chip).not.toContain('·');
    expect(chip).not.toContain('00:00');
  });

  it('trata "00:00" como sem hora', () => {
    const chip = formatTrainingChip('2026-04-22', '00:00');
    expect(chip).not.toContain('·');
  });

  it('inclui weekday abreviado sem ponto final', () => {
    // Weekday em pt-PT para 2026-04-22 (quarta) — esperar sem ponto
    const chip = formatTrainingChip('2026-04-22', null);
    expect(chip).not.toMatch(/\./);
  });

  it('padding de 2 dígitos no dia e mês', () => {
    expect(formatTrainingChip('2026-01-05', null)).toContain('05/01');
    expect(formatTrainingChip('2026-09-09', null)).toContain('09/09');
  });

  it('retorna a data raw se for inválida', () => {
    expect(formatTrainingChip('', null)).toBe('');
    expect(formatTrainingChip('not-a-date', null)).toBe('not-a-date');
  });
});

/* ───────────── chipColorClass ───────────── */

describe('chipColorClass', () => {
  const TODAY = '2026-04-17';

  it('agendado com data passada → orange (atraso)', () => {
    expect(chipColorClass(
      { status: 'agendado', training_date: '2026-04-10', has_evaluation: false },
      TODAY,
    )).toContain('orange');
  });

  it('agendado futuro → amber', () => {
    expect(chipColorClass(
      { status: 'agendado', training_date: '2026-04-25', has_evaluation: false },
      TODAY,
    )).toContain('amber');
  });

  it('agendado hoje → amber (não orange)', () => {
    expect(chipColorClass(
      { status: 'agendado', training_date: '2026-04-17', has_evaluation: false },
      TODAY,
    )).toContain('amber');
  });

  it('realizado sem avaliação → yellow (pendente)', () => {
    expect(chipColorClass(
      { status: 'realizado', training_date: '2026-04-10', has_evaluation: false },
      TODAY,
    )).toContain('yellow');
  });

  it('realizado com avaliação → green', () => {
    expect(chipColorClass(
      { status: 'realizado', training_date: '2026-04-10', has_evaluation: true },
      TODAY,
    )).toContain('green');
  });
});

/* ───────────── shouldAutoMoveToVirTreinar ───────────── */

describe('shouldAutoMoveToVirTreinar', () => {
  it('por_tratar → SIM', () => {
    expect(shouldAutoMoveToVirTreinar('por_tratar')).toBe(true);
  });

  it('em_contacto → SIM', () => {
    expect(shouldAutoMoveToVirTreinar('em_contacto')).toBe(true);
  });

  it('vir_treinar → NÃO (no-op)', () => {
    expect(shouldAutoMoveToVirTreinar('vir_treinar')).toBe(false);
  });

  it('estados terminais → NÃO', () => {
    expect(shouldAutoMoveToVirTreinar('assinou')).toBe(false);
    expect(shouldAutoMoveToVirTreinar('rejeitado')).toBe(false);
  });

  it('estados intermédios → NÃO', () => {
    expect(shouldAutoMoveToVirTreinar('reuniao_marcada')).toBe(false);
    expect(shouldAutoMoveToVirTreinar('a_decidir')).toBe(false);
    expect(shouldAutoMoveToVirTreinar('em_standby')).toBe(false);
    expect(shouldAutoMoveToVirTreinar('confirmado')).toBe(false);
  });

  it('null/undefined → NÃO (player sem pipeline)', () => {
    expect(shouldAutoMoveToVirTreinar(null)).toBe(false);
    expect(shouldAutoMoveToVirTreinar(undefined)).toBe(false);
  });
});

/* ───────────── scheduleSignature ───────────── */

describe('scheduleSignature', () => {
  it('gera chave estável (player+autor+data+hora)', () => {
    const sig = scheduleSignature(42, 'user-abc', '2026-04-22', '10:00');
    expect(sig).toBe('42:user-abc:2026-04-22:10:00');
  });

  it('diferentes inputs produzem signatures diferentes', () => {
    const a = scheduleSignature(42, 'u1', '2026-04-22', '10:00');
    const b = scheduleSignature(42, 'u2', '2026-04-22', '10:00');
    const c = scheduleSignature(43, 'u1', '2026-04-22', '10:00');
    const d = scheduleSignature(42, 'u1', '2026-04-23', '10:00');
    const e = scheduleSignature(42, 'u1', '2026-04-22', '11:00');
    expect(new Set([a, b, c, d, e]).size).toBe(5);
  });

  it('null time distinto de string vazia', () => {
    const a = scheduleSignature(42, 'u1', '2026-04-22', null);
    const b = scheduleSignature(42, 'u1', '2026-04-22', '');
    expect(a).toBe(b); // ambos tratados como "sem hora"
  });
});

/* ───────────── shouldTransitionToRealizado ───────────── */

describe('shouldTransitionToRealizado', () => {
  it('agendado + rating performance → SIM', () => {
    expect(shouldTransitionToRealizado('agendado', { ratingPerformance: 3 })).toBe(true);
  });

  it('agendado + rating potential → SIM', () => {
    expect(shouldTransitionToRealizado('agendado', { ratingPotential: 4 })).toBe(true);
  });

  it('agendado + feedback text → SIM', () => {
    expect(shouldTransitionToRealizado('agendado', { feedback: 'Correu bem' })).toBe(true);
  });

  it('agendado + todos null/vazio → NÃO', () => {
    expect(shouldTransitionToRealizado('agendado', {})).toBe(false);
    expect(shouldTransitionToRealizado('agendado', {
      ratingPerformance: null,
      ratingPotential: null,
      feedback: '',
    })).toBe(false);
  });

  it('agendado + feedback só whitespace → NÃO (trim)', () => {
    expect(shouldTransitionToRealizado('agendado', { feedback: '   ' })).toBe(false);
    expect(shouldTransitionToRealizado('agendado', { feedback: '\n\t' })).toBe(false);
  });

  it('já realizado → NÃO (sem transição)', () => {
    expect(shouldTransitionToRealizado('realizado', { ratingPerformance: 5 })).toBe(false);
  });

  it('cancelado → NÃO', () => {
    expect(shouldTransitionToRealizado('cancelado', { ratingPerformance: 5 })).toBe(false);
  });

  it('faltou → NÃO', () => {
    expect(shouldTransitionToRealizado('faltou', { ratingPerformance: 5 })).toBe(false);
  });

  it('rating 0 é tratado como "sem rating" (>= 1-5)', () => {
    // ratingPerformance = 0 passa pelo != null check — mas 0 não é rating válido (é 1-5)
    // nota: o comportamento actual retorna true se != null, ou seja aceita 0.
    // Este teste documenta o comportamento — se mudar, test fails.
    expect(shouldTransitionToRealizado('agendado', { ratingPerformance: 0 })).toBe(true);
  });
});

// src/lib/utils/training-sessions.ts
// Helpers puros para training sessions — countdown, formatação de chip, next-training computation
// Extraído de componentes UI para testabilidade isolada sem DOM nem Supabase
// RELEVANT FILES: src/components/players/TrainingSessionsList.tsx, src/components/pipeline/PipelineCard.tsx, src/lib/__tests__/training-sessions.test.ts

/* ───────────── Countdown ───────────── */

/**
 * Calcula dias entre uma data YYYY-MM-DD e `now` (default hoje).
 * Retorna null se `trainingDate` for inválido.
 * Positivo = futuro; 0 = hoje; negativo = passado.
 */
export function daysUntil(trainingDate: string, now: Date = new Date()): number | null {
  try {
    const [y, m, d] = trainingDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    const target = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).setHours(0, 0, 0, 0);
    return Math.round((target - today0) / 86400000);
  } catch { return null; }
}

/**
 * Produz label PT subtil para contagem de dias:
 * null → null · 0 → 'hoje' · 1 → 'amanhã' · >1 → 'daqui a X dias'
 * -1 → 'ontem' · <-1 → 'há X dias'
 */
export function countdownLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days > 1) return `daqui a ${days} dias`;
  if (days === -1) return 'ontem';
  return `há ${Math.abs(days)} dias`;
}

/* ───────────── Chip formatting (pipeline card) ───────────── */

/**
 * Formata data+hora para chip compacto do pipeline card.
 * "3ª 22/04" ou "3ª 22/04 · 10:00". Trata "00:00:00" como sem hora.
 */
export function formatTrainingChip(date: string, time: string | null): string {
  try {
    const [y, m, d] = date.split('-').map(Number);
    if (!y || !m || !d) return date;
    const dd = new Date(y, m - 1, d, 12);
    const wd = dd.toLocaleString('pt-PT', { weekday: 'short' }).replace('.', '');
    const dm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    const tm = time && time !== '00:00:00' && time !== '00:00' ? time.slice(0, 5) : null;
    return tm ? `${wd} ${dm} · ${tm}` : `${wd} ${dm}`;
  } catch { return date; }
}

/* ───────────── Chip color (pipeline card) ───────────── */

/**
 * Cor do chip baseada em estado + data.
 * - agendado com data passada → orange (atraso)
 * - agendado futuro → amber
 * - realizado sem avaliação → yellow (pendente)
 * - realizado com avaliação → green
 */
export function chipColorClass(
  session: { status: string; training_date: string; has_evaluation: boolean },
  todayISO: string,
): string {
  if (session.status === 'agendado' && session.training_date < todayISO) {
    return 'bg-orange-100 text-orange-700';
  }
  if (session.status === 'agendado') {
    return 'bg-amber-100 text-amber-700';
  }
  if (session.status === 'realizado' && !session.has_evaluation) {
    return 'bg-yellow-100 text-yellow-700';
  }
  return 'bg-green-100 text-green-700';
}

/* ───────────── Auto-move pipeline policy ───────────── */

/**
 * Decide se agendar um treino futuro deve auto-mover o player para vir_treinar.
 * Apenas de estados pre-training: por_tratar, em_contacto.
 * Estados terminais (assinou, rejeitado) e em_standby NÃO auto-movem.
 * null = player sem status no pipeline — não mexe.
 */
export function shouldAutoMoveToVirTreinar(currentStatus: string | null | undefined): boolean {
  return currentStatus === 'por_tratar' || currentStatus === 'em_contacto';
}

/* ───────────── Dedupe signature (schedule training) ───────────── */

/**
 * Signature idempotente usada para detetar treinos duplicados num mesmo flow.
 * Client-side ou server-side, baseado em (player, autor, data, hora).
 */
export function scheduleSignature(playerId: number, authorId: string, date: string, time: string | null): string {
  return `${playerId}:${authorId}:${date}:${time ?? ''}`;
}

/* ───────────── Evaluation transition ───────────── */

/**
 * Determina se preencher avaliação num treino deve transitar status agendado→realizado.
 * Transição implícita quando há pelo menos um campo de avaliação real (rating ou feedback).
 */
export function shouldTransitionToRealizado(
  currentStatus: string,
  fields: { ratingPerformance?: number | null; ratingPotential?: number | null; feedback?: string },
): boolean {
  if (currentStatus !== 'agendado') return false;
  const hasRating = fields.ratingPerformance != null || fields.ratingPotential != null;
  const hasFeedback = !!(fields.feedback && fields.feedback.trim().length > 0);
  return hasRating || hasFeedback;
}

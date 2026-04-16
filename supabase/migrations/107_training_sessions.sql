-- Migration 107: Treinos à Experiência (agendamento + múltiplas sessões + estados top-level)
-- Evolui training_feedback para suportar agendar + N sessões + 4 estados (agendado/realizado/cancelado/faltou)
-- Adiciona players.vir_treinar_entered_at para scoping do pipeline card, FKs em calendar_events e user_tasks,
-- relaxa FK author_id para preservar histórico ao apagar users, e restringe RLS excluindo scouts.
-- RELEVANT FILES: docs/FEATURE_TRAINING_SESSIONS.md, src/actions/training-feedback.ts, src/actions/pipeline.ts

/* ───────────── training_feedback: novos campos ───────────── */

-- Estado top-level — substitui presence como fonte de verdade
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'realizado'
    CHECK (status IN ('agendado', 'realizado', 'cancelado', 'faltou'));

-- Campos de evento
ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS session_time TIME;
ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS observed_position TEXT;

-- Cancelamento
ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE training_feedback ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Flag retroactivo — treinos criados directamente como realizado (sem passar por agendado)
-- Usado para excluir do pipeline card e do calendar (só aparece no perfil do atleta)
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS is_retroactive BOOLEAN NOT NULL DEFAULT false;

/* ───────────── Backfill de estados em linhas existentes ───────────── */

-- PG 11+ fast default cobre automaticamente status='realizado' em linhas existentes.
-- Só corrigimos os casos especiais derivados do campo presence legacy:
UPDATE training_feedback SET status = 'faltou' WHERE presence = 'missed';
UPDATE training_feedback SET status = 'cancelado' WHERE presence = 'rescheduled';

/* ───────────── FK author_id: permitir preservação ao apagar user ───────────── */

-- Hoje: author_id NOT NULL REFERENCES profiles(id) (RESTRICT default) — bloqueia delete do user.
-- Novo: ON DELETE SET NULL + nullable. Treino sobrevive, autor perdido.
ALTER TABLE training_feedback ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE training_feedback DROP CONSTRAINT IF EXISTS training_feedback_author_id_fkey;
ALTER TABLE training_feedback
  ADD CONSTRAINT training_feedback_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

/* ───────────── players: âncora do ciclo vir_treinar ───────────── */

ALTER TABLE players ADD COLUMN IF NOT EXISTS vir_treinar_entered_at TIMESTAMPTZ;

-- Backfill: players actualmente em vir_treinar recebem a última entrada no status_history.
-- Fallback para players.created_at se não houver history (evita NULL, que esconderia treinos do card).
UPDATE players p SET vir_treinar_entered_at = COALESCE(
  (SELECT MAX(sh.created_at)
     FROM status_history sh
     WHERE sh.player_id = p.id
       AND sh.field_changed = 'recruitment_status'
       AND sh.new_value = 'vir_treinar'),
  p.created_at
) WHERE p.recruitment_status = 'vir_treinar';

/* ───────────── Índices ───────────── */

-- Query principal por estado e data (pipeline card, listagem do perfil)
CREATE INDEX IF NOT EXISTS idx_training_feedback_status_date
  ON training_feedback(player_id, status, training_date DESC);

-- Scoping do ciclo actual no pipeline card
CREATE INDEX IF NOT EXISTS idx_training_feedback_cycle
  ON training_feedback(player_id, created_at DESC)
  WHERE status IN ('agendado', 'realizado');

-- Filtro rápido de retroactivos (excluídos do pipeline card e calendar)
CREATE INDEX IF NOT EXISTS idx_training_feedback_retroactive
  ON training_feedback(player_id, is_retroactive, created_at DESC);

/* ───────────── calendar_events ← training_feedback ───────────── */

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS training_feedback_id BIGINT
    REFERENCES training_feedback(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_training_fb
  ON calendar_events(training_feedback_id);

-- Filtro eficiente de events do tipo treino (para excluir cancelados via JOIN)
CREATE INDEX IF NOT EXISTS idx_calendar_events_type_fb
  ON calendar_events(event_type, training_feedback_id)
  WHERE event_type = 'treino';

/* ───────────── user_tasks: unicidade por sessão (permite N tasks activas por player) ───────────── */

ALTER TABLE user_tasks
  ADD COLUMN IF NOT EXISTS training_feedback_id BIGINT
    REFERENCES training_feedback(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_user_tasks_auto_unique;

-- COALESCE para manter compat com tasks que não são de treino (outros sources)
CREATE UNIQUE INDEX idx_user_tasks_auto_unique
  ON user_tasks(user_id, player_id, source, COALESCE(training_feedback_id, 0))
  WHERE source != 'manual' AND completed = false;

/* ───────────── RLS: excluir scouts do INSERT/UPDATE ───────────── */

-- SELECT permanece aberto (scouts podem ler histórico)
-- INSERT/UPDATE passam a exigir role admin/editor/recruiter
-- DELETE mantém migration 097 (author + admin)

DROP POLICY IF EXISTS "Staff insert training feedback" ON training_feedback;
CREATE POLICY "Staff insert training feedback"
  ON training_feedback FOR INSERT
  WITH CHECK (
    user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'recruiter')
  );

DROP POLICY IF EXISTS "Staff update own feedback" ON training_feedback;
CREATE POLICY "Staff update training feedback"
  ON training_feedback FOR UPDATE
  USING (
    user_club_role(auth.uid(), club_id) = 'admin'
    OR (author_id = auth.uid()
        AND user_club_role(auth.uid(), club_id) IN ('admin', 'editor', 'recruiter'))
  );

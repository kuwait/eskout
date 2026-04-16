# Feature — Treinos à Experiência (Training Sessions)

**Estado:** Fase 1-3 implementadas. Fase 4+ pendente.
**Última atualização:** 2026-04-17
**Objetivo:** suportar múltiplos treinos por atleta, com avaliação por treino, independentes da pipeline mas possivelmente relacionados.

---

## 1. Contexto e problema

Hoje existe a fase `vir_treinar` na pipeline, mas o modelo é limitado:

- Atleta só pode ter **1 treino activo** (campo `players.training_date` é overwrite)
- Não há suporte para múltiplos treinos (ex: terça + quarta, 1x por semana durante 2 semanas)
- Não há histórico completo de treinos por atleta
- Não há relatório por treino (o `training_feedback` é tratado como 1:1 na UI)
- Treinos fora da pipeline não são modelados
- Informação não está centralizada na página do atleta

### Objetivo

Suportar:
- Múltiplos treinos por atleta
- Visualização dos treinos na página do atleta
- Um relatório/avaliação por treino
- Treinos independentes da pipeline (possivelmente relacionados)
- Flexibilidade: treinos únicos, múltiplos, retroativos

---

## 2. Diagnóstico da arquitetura atual

### Como "treino" vive hoje

| Peça | Comportamento | Limitação |
|---|---|---|
| `players.training_date` + `training_escalao` | Campo único; overwrite a cada mudança | Sem histórico; só 1 treino ativo |
| `calendar_events` (type=`treino`) | `syncCalendarEvent` faz delete+upsert por player | Só 1 event persistente por player |
| `training_feedback` (tabela) | Já 1:N por `player_id`, mas UI mostra só `attended[0]` | DB aguenta N, fluxos tratam 1:1 |
| `user_tasks` (source=`pipeline_training`) | UNIQUE `(user_id, player_id, source)` ativa | Só 1 tarefa ativa por player |
| `feedback_share_tokens` (coach link) | 1 token → 1 stub `training_feedback` | Já é 1:1 com feedback — ok |
| `status_history` `vir_treinar` | Regista mudança de estado, não o treino em si | Não modela o evento real |

### Schema relevante — campos-chave

**`training_feedback` (migrations 052, 091-095):**
- `id`, `club_id`, `player_id`, `author_id`, `training_date`, `escalao`, `presence` (attended|missed|rescheduled)
- `feedback` (texto), `rating` (DEPRECATED)
- `rating_performance`, `rating_potential` (1-5)
- `decision` (assinar|repetir|duvidas|descartar|sem_decisao)
- `height_scale`, `build_scale`, `speed_scale`, `intensity_scale`, `maturation`
- `tags` TEXT[]
- `coach_feedback`, `coach_rating_performance`, `coach_rating_potential`, `coach_decision`, `coach_name`, `coach_submitted_at`, `coach_observed_position`, `coach_*_scale`, `coach_tags`

**`feedback_share_tokens` (migration 092):**
- `id`, `club_id`, `feedback_id`, `token` (UUID), `coach_name`, `expires_at` (default 7d), `used_at`, `revoked_at`

**`players` (migration 050 — pipeline fields):**
- `training_date` TIMESTAMPTZ, `training_escalao` TEXT, `contact_assigned_to` UUID

**`calendar_events` (migration 011):**
- `event_type` ('treino'|'reuniao'|'assinatura'|'observacao'|'outro'), `event_date`, `event_time`, `player_id`, `assignee_user_id`

**`user_tasks` (migration 050):**
- UNIQUE `(user_id, player_id, source) WHERE source != 'manual' AND completed = false`
- source `pipeline_training` → title "⚽ Registar feedback do treino"

### Ficheiros-chave

**Server Actions:**
- `src/actions/training-feedback.ts` — CRUD + coach link
- `src/actions/pipeline.ts` — vir_treinar handling, auto-task, calendar sync
- `src/actions/notifications.ts`, `src/actions/notification-preferences.ts`
- `src/lib/email.ts`
- `src/app/api/feedback/[token]/route.ts` — public coach submission

**UI:**
- `src/components/players/TrainingFeedback.tsx` — lista + form + share link
- `src/components/feedback/CoachFeedbackForm.tsx` — form externo
- `src/app/feedback/[token]/page.tsx` — página pública coach
- `src/app/jogadores/[id]/page.tsx` — profile

**Types / Queries:**
- `src/lib/types/index.ts` (TrainingFeedback)
- `src/lib/supabase/queries.ts` — `getTrainingFeedback()`, `getAllTrainingFeedbacks()`
- `src/lib/supabase/mappers.ts` — `mapTrainingFeedbackRow()`

### Migrations relevantes

- **052** — CREATE `training_feedback`
- **091** — decision + scales + tags
- **092** — `feedback_share_tokens` + coach_* columns
- **093** — build rename (ectomorfo/etc.) + maturation + dual ratings
- **094** — 'duvidas' decision
- **095** — `coach_observed_position`
- **097** — DELETE RLS (author + admin)
- **099** — `training_feedback_seen_at` em `club_memberships`
- **104** — RLS em `feedback_share_tokens`
- **050** — `training_date`, `training_escalao`, tasks
- **011** — `calendar_events`

### Permissions hoje (RLS)

| Op | Training Feedback |
|---|---|
| SELECT | Qualquer membro do clube |
| INSERT | Qualquer membro do clube (incluindo scouts — **a mudar**) |
| UPDATE | `author_id = auth.uid()` ou admin |
| DELETE | author ou admin (post-097) |

---

## 3. Decisão estruturante — Pipeline vs Treinos

**Decidido: separar conceitos.**

- **Pipeline** = estado do *processo de recrutamento* (por_tratar → assinou)
- **Treino** = *evento real* que ocorreu/vai ocorrer no tempo

Acoplar os dois força escolhas más: se atleta treina 3x, ou inflaciona `vir_treinar` 3x ou fica só com o último.

**Ligação fraca:** pipeline pode *referenciar* treinos (pipeline card mostra treinos do ciclo actual), mas treinos vivem sozinhos.

---

## 4. Findings da investigação (9.1 + 9.2 — CONCLUÍDO)

### 4.1 Comportamento actual de notificações `pipeline_training`

**Verificado em:** `src/actions/pipeline.ts:330-334`, `src/actions/notifications.ts`, `src/lib/email.ts`

| Aspecto | Comportamento actual |
|---|---|
| Trigger | `updateRecruitmentStatus(player, 'vir_treinar', ...)`. NÃO dispara em `updateTrainingDate` |
| Condição | Só se `player.contact_assigned_to IS NOT NULL`. Se null, silencioso |
| Destinatário | `contact_assigned_to` (a pessoa que contactou a família) |
| Self-assignment | Skip se `contact_assigned_to === userId` |
| Task criada | title `⚽ Registar feedback do treino`, source `pipeline_training`, due_date = `training_date` |
| Email conteúdo | Foto, nome, clube, posição, DOB+idade, pé, contacto, FPF, ZZ, escalão, data |
| Preferências | Bloqueio por `email_all=false` OU `email_on_training=false` |
| Unicidade | UNIQUE `(user_id, player_id, source) WHERE source != 'manual' AND completed = false` |
| Alterar data | `updateTrainingDate` actualiza due_date da task. **Não envia novo email** |
| Sair de vir_treinar | task auto-completa, calendar event apagado, campos limpos. **Sem notificação** |

### 4.2 Card da pipeline para `vir_treinar`

**Verificado em:** `src/components/pipeline/PipelineCard.tsx:73-82, 304-315, 332-344`

O card renderiza: pill responsável + botão escalão + botão **único** de data/hora. O dialog usa `updateTrainingDate(playerId, dateTime | null)` que **sobrescreve** o campo único `players.training_date`.

---

## 5. Modelo final (decisões Q&A)

### 5.1 Conceitos

- **Treino** = evento no tempo (data, hora, local, escalão) com um estado top-level
- **Avaliação** = 1 **exclusiva** por treino (staff OU coach externo — não as duas)
- Para substituir avaliação: apagar a existente → nova ou gerar link novo

### 5.2 Estados do treino (top-level)

- `agendado` — futuro, ainda não aconteceu
- `realizado` — já ocorreu
- `faltou` — atleta não apareceu (top-level distinto; `presence` deprecated)
- `cancelado` — treino cancelado, não conta

### 5.3 Flows

**Agendar treino (futuro)**
1. Staff clica "Agendar treino" (perfil do atleta OU pipeline card)
2. Preenche: data + hora + local (opcional) + escalão
3. Cria `training_feedback` com `status='agendado'`, sem avaliação
4. Cria `calendar_events` (type=treino) ligado ao treino
5. Se player em `por_tratar` ou `em_contacto` → auto-move para `vir_treinar` + actualiza `players.vir_treinar_entered_at`
6. Email ao agendador (skip se self)
7. Auto-task "registar feedback do treino" para o agendador

**Preencher avaliação staff**
- Abre dialog no perfil → form unificado (mesmos campos do coach) → guarda
- status passa a `realizado`
- Mesmo form do coach (com `observed_position`, scales, tags, ratings dual, decisão, texto)

**Pedir ao treinador (coach externo)**
- Staff clica "Pedir ao treinador" — no perfil OU no pipeline card
- Se >1 treino agendado → popup para escolher qual
- Gera token → envia link → treinador preenche página pública → status → `realizado`
- Link expira em 7 dias, single-use
- Link revogado auto quando treino cancelado/apagado
- Se link expirar sem submit: badge "link expirou" + botão "gerar novo"

**Cancelar treino**
- Admin/editor/recruiter pode cancelar (confirm dialog + motivo opcional)
- `status='cancelado'`, `cancelled_at` e `cancelled_reason` gravados
- Calendar event **apagado**
- Link coach (se existir) revogado
- Email ao agendador original
- Task auto-completed

**Marcar "faltou"**
- Botão "marcar como faltou" no treino (agendado ou realizado)
- `status='faltou'`, calendar event apagado
- Opcional: nota "porquê"
- Task auto-completed

**Mudar data de treino agendado**
- Admin/editor/recruiter edita data/hora
- Calendar event actualizado
- Link do treinador continua válido (vê nova data)
- Email ao agendador original

**Retroactivo (já aconteceu)**
- **Apenas no perfil do atleta** (botão "Registar treino passado")
- Cria `training_feedback` com `status='realizado'` + avaliação preenchida
- **Não** cria calendar event
- **Não** mexe pipeline
- **Não** aparece no pipeline card (só no perfil)

### 5.4 UI — Perfil do atleta (secção "Treinos")

- Lista cronológica **desc** (mais recente primeiro), sem agrupação
- Cada item: data + hora + escalão + pill de estado
- Pills: `Agendado` · `Link enviado · aguarda treinador` · `Realizado` · `⚠️ Realizado s/ avaliação` · `Cancelado` · `Faltou`
- Cards expandidos: avaliação preenchida (staff OU coach — nunca as duas)
- CTAs por estado:
  - `agendado`: editar · cancelar · marcar faltou · preencher staff · pedir coach
  - `realizado s/ aval`: preencher staff · pedir coach
  - `realizado c/ aval`: editar avaliação (autor/admin) · apagar + regenerar
  - `cancelado` / `faltou`: read-only
- Sem paginação — carrega todos (tipicamente 3-4 treinos por jogador)

### 5.5 UI — Pipeline card `vir_treinar`

- Filtro: treinos com `created_at >= players.vir_treinar_entered_at` (ciclo actual)
- Retroactivos **nunca** aparecem aqui
- Lista compacta: 2-3 visíveis + "+X mais"
- Ordem: agendados asc (próximo primeiro) + realizados recentes
- Pill por treino (mesmas do perfil)
- `⚠️ Realizado s/ avaliação` destacado
- Botão "Pedir ao treinador" no card (popup se >1 treino)
- Sair de `vir_treinar` com agendados → dialog "cancelar N treinos?" (sim/não, não auto-cancela)

### 5.6 UI — Calendar

- 1 event por treino agendado
- Múltiplos treinos no mesmo dia = múltiplos events
- Cancelados e faltou **removidos** do calendar (persistem no perfil)
- Click event → edita/cancela/marca faltou

### 5.7 Notificações (email)

- Trigger: **agendar** · **mudar data** · **cancelar** · **apagar treino**
- Destinatário: `training_feedback.author_id` (agendador original)
- **Self-skip mantém-se** (hoje já faz — `notifyTaskAssigned` skips `targetUserId === assignedByUserId`)
- Template: reusa `sendTaskEmail` com subject variante
- Preferência `email_on_training` continua a silenciar tudo

### 5.8 Permissões

| Action | admin | editor | recruiter | scout |
|---|---|---|---|---|
| SELECT treinos (ler) | ✓ | ✓ | ✓ | ✓ (manter) |
| Agendar / editar / cancelar | ✓ | ✓ | ✓ | ✗ |
| Marcar faltou | ✓ | ✓ | ✓ | ✗ |
| Preencher avaliação staff | ✓ | ✓ | ✓ | ✗ |
| Gerar link coach | ✓ | ✓ | ✓ | ✗ |
| Apagar avaliação | autor + admin | — | — | ✗ |
| Apagar treino inteiro | autor + admin | — | — | ✗ |

---

## 6. Schema final SQL (migration 107)

```sql
-- Migration 107: Treinos à Experiência — agendamento + N sessões + 4 estados top-level
-- Evolui training_feedback + players.vir_treinar_entered_at + FKs em calendar_events e user_tasks
-- RELEVANT FILES: src/actions/training-feedback.ts, src/actions/pipeline.ts,
--                 src/components/players/TrainingFeedback.tsx

/* ───────────── training_feedback: novos campos ───────────── */

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'realizado'
    CHECK (status IN ('agendado', 'realizado', 'cancelado', 'faltou'));

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS session_time TIME;

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS observed_position TEXT;  -- staff (hoje só no coach)

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Flag retroactivo (criado com status=realizado, sem passar por agendado)
-- Usado para filtrar do pipeline card e do calendar
ALTER TABLE training_feedback
  ADD COLUMN IF NOT EXISTS is_retroactive BOOLEAN NOT NULL DEFAULT false;

/* ───────────── players: âncora do ciclo vir_treinar ───────────── */

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS vir_treinar_entered_at TIMESTAMPTZ;

-- Backfill: players actualmente em vir_treinar → use última entry do status_history
-- Fallback para players.created_at se não houver history (evita NULL que esconderia treinos)
UPDATE players p SET vir_treinar_entered_at = COALESCE(
  (SELECT MAX(sh.created_at) FROM status_history sh
    WHERE sh.player_id = p.id
      AND sh.field_changed = 'recruitment_status'
      AND sh.new_value = 'vir_treinar'),
  p.created_at
) WHERE p.recruitment_status = 'vir_treinar';

/* ───────────── Backfill de estados em linhas existentes ───────────── */

-- NOTA: o DEFAULT 'realizado' do ALTER ADD COLUMN cobre automaticamente linhas existentes
-- (PG 11+ fast default). Só precisamos corrigir os casos especiais via presence:

UPDATE training_feedback SET status = 'faltou' WHERE presence = 'missed';
UPDATE training_feedback SET status = 'cancelado' WHERE presence = 'rescheduled';

/* ───────────── FK author_id: permitir preservação de histórico ───────────── */

-- Hoje: author_id NOT NULL REFERENCES profiles(id) (RESTRICT default) — bloqueia delete do user
-- Novo: ON DELETE SET NULL + NULL permitido. Treino sobrevive, autor perdido.
ALTER TABLE training_feedback ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE training_feedback DROP CONSTRAINT IF EXISTS training_feedback_author_id_fkey;
ALTER TABLE training_feedback
  ADD CONSTRAINT training_feedback_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

/* ───────────── Índices ───────────── */

CREATE INDEX IF NOT EXISTS idx_training_feedback_status_date
  ON training_feedback(player_id, status, training_date DESC);

CREATE INDEX IF NOT EXISTS idx_training_feedback_cycle
  ON training_feedback(player_id, created_at DESC)
  WHERE status IN ('agendado', 'realizado');

-- Para filtrar cancelados no calendar query eficientemente
CREATE INDEX IF NOT EXISTS idx_calendar_events_type_fb
  ON calendar_events(event_type, training_feedback_id)
  WHERE event_type = 'treino';

-- Para filtrar retroactivos no pipeline card
CREATE INDEX IF NOT EXISTS idx_training_feedback_retroactive
  ON training_feedback(player_id, is_retroactive, created_at DESC);

/* ───────────── calendar_events ← training_feedback ───────────── */

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS training_feedback_id BIGINT
    REFERENCES training_feedback(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_calendar_events_training_fb
  ON calendar_events(training_feedback_id);

/* ───────────── user_tasks: unicidade por sessão ───────────── */

ALTER TABLE user_tasks
  ADD COLUMN IF NOT EXISTS training_feedback_id BIGINT
    REFERENCES training_feedback(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_user_tasks_auto_unique;

CREATE UNIQUE INDEX idx_user_tasks_auto_unique
  ON user_tasks(user_id, player_id, source, COALESCE(training_feedback_id, 0))
  WHERE source != 'manual' AND completed = false;

/* ───────────── RLS: excluir scouts do INSERT/UPDATE ───────────── */

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

-- DELETE mantém migration 097 (author + admin) — recruiter não pode apagar
```

**Deprecated pós-migração (não remover, manter compat):**
- `presence` — mantém para leitura de histórico, mas `status` é a fonte de verdade
- `rating` (já deprecated pre-migration 093)
- `players.training_date` / `training_escalao` — mantidos. Server actualiza `training_date` como espelho do próximo agendado (sync em scheduleTraining/reschedule/cancel)

---

## 7. Edge cases — cobertura

| # | Caso | Tratamento |
|---|---|---|
| 1 | Duplicate agendamento (double-click) | Server rejeita insert se já existe `(player_id, author_id, training_date, session_time)` criado em < 10s |
| 2 | Coach abre link após treino cancelado | Endpoint `/api/feedback/[token]` verifica status; se `cancelado`/`faltou` → 410 + msg "contacta o clube" |
| 3 | Coach abre link após data mudada | Link continua válido; mostra a nova data/hora |
| 4 | Link expira sem submit | Stub permanece, pill "link expirou" + botão regenerar token |
| 5 | Sair de vir_treinar com agendados | Dialog "cancelar N treinos?" — user decide; se sim, batch cancel + emails |
| 6 | Criar treino com data passada pelo form de "agendar" | Server rejeita, sugere "usar registar treino passado" |
| 7 | Ciclo re-entry | `vir_treinar_entered_at` actualizado sempre que entra em vir_treinar → antigos filtrados |
| 8 | Multi-sessão mesmo dia | N linhas independentes; UI agrupa visualmente por (player, date) se necessário |
| 9 | Editar avaliação coach | Locked após submit (só admin pode) |
| 10 | Apagar treino c/ avaliação preenchida | Confirm "vais perder a avaliação" |
| 11 | Faltou em treino com link coach | Link auto-revogado |
| 12 | Retroactivo num player em vir_treinar | Criado apenas no perfil; `is_retroactive=true`; não aparece no pipeline card nem no calendar |
| 13 | Múltiplos treinos passados sem avaliação | Todos com badge "⚠️ realizado s/ avaliação"; transition automática `agendado → realizado` quando data < hoje (on-query filter ou nightly job — decidir em impl) |
| 14 | Scout tenta agendar via API | RLS bloqueia INSERT |
| 15 | Player apagado com treinos associados | CASCADE em `training_feedback.player_id` (já existe) |

---

## 8. Plano de implementação por fases

### Fase 1 — Schema + backfill
- **Migration 107** com colunas, índices, FKs, backfill de status, RLS
- Coluna `players.vir_treinar_entered_at` + backfill via `status_history`
- Testes: backfill correcto (realizado/faltou/cancelado), unique index permite multi-sessão, RLS bloqueia scouts

### Fase 2 — Server actions
- Novos: `scheduleTraining`, `rescheduleTraining`, `cancelTraining`, `markTrainingMissed`, `registerPastTraining` (retroactivo)
- `updateTrainingEvaluation` (staff preenche avaliação num treino existente)
- `createCoachFeedbackLink` — refactor: associar a treino existente se passado `trainingId`, senão comportamento actual
- Helper `updateVirTreinarEnteredAt` — chamado em mudanças de `recruitment_status`
- Helper `promptCancelPendingTrainings` — dispara dialog quando sair de vir_treinar com agendados
- Notificações: `notifyTrainingScheduled`, `notifyTrainingRescheduled`, `notifyTrainingCancelled` (reutilizam `sendTaskEmail` com subject variante)
- Sync `players.training_date` como espelho do próximo agendado (após create/reschedule/cancel)
- Dedupe server-side em `scheduleTraining` (10s window)
- Testes: auto-move pipeline, dedupe, skip self-email, RLS

### Fase 3 — UI perfil do atleta
- Renomear secção "Training Feedback" → "Treinos"
- Novo componente `TrainingSessionsList` (substitui `TrainingFeedbackList`)
- Dialog "Agendar treino" (futuro) e "Registar treino passado" (retroactivo) — 2 CTAs distintos
- **Helper "repetir N vezes"** no dialog de agendar — cria múltiplas linhas numa só acção (casos "vem 3 treinos esta semana")
- Cards por estado com pill + CTAs contextuais
- Form staff unificado com form coach (remove duplicação)
- Sem paginação (lista cronológica completa, tipicamente 3-4 treinos)
- Testes E2E smoke (perfil de atleta)

### Fase 4 — Pipeline card
- Query `getCurrentCycleTrainings(playerId, cycleEnteredAt)` → filtra por `created_at >= cycle_entered_at` + exclui `is_retroactive`
- Lista compacta com "+X mais"
- Pill por treino
- Botão "Pedir ao treinador" — popup se >1 agendado
- Dialog "cancelar N treinos?" ao sair de vir_treinar
- Testes: ciclo re-entry, filtragem correcta

### Fase 5 — Calendar
- Remover overwrite no `syncCalendarEvent` para type=treino
- Cada `training_feedback` agendado → 1 event com FK `training_feedback_id`
- Filtrar `status IN ('cancelado', 'faltou')` e `is_retroactive=true` das queries do calendar
- Update/delete propagados quando status muda

### Fase 6 — Notificações refinadas
- Subject prefixes: "Alterado:", "Cancelado:"
- Preferências granulares mantêm-se (`email_on_training`)
- Self-skip verificado em todos os triggers

### Fase 7 — Transição manual agendado → realizado
- **Sem auto-transição** (decisão user). Status só muda via acção explícita:
  - Preencher avaliação staff → status vira `realizado` automaticamente
  - Coach submete via link → status vira `realizado`
  - Botão "Marcar como realizado" (sem avaliação) — para o caso "treinou mas ninguém avaliou"
- Se data passou e status ainda é `agendado`: UI mostra variante visual "⚠️ agendado · data passou" com CTAs evidentes (avaliar / marcar realizado / marcar faltou / cancelar)

### Fase 8 (opcional, futuro) — Polish
- Lembrete dia-anterior (cron via Vercel Scheduled Functions)
- Listagem global `/treinos` (ou tab em `/calendario` filtrado)
- Audit log de alterações em treinos

---

## 9. Decisões fechadas (resumo)

| Tópico | Decisão |
|---|---|
| Avaliações por treino | 1 exclusiva (staff OU coach). Delete+regenerate para trocar |
| Estados top-level | `agendado` · `realizado` · `cancelado` · `faltou` |
| Form staff vs coach | **Unificado** — mesmos campos |
| Retroactivo | Apenas no perfil, sem calendar, sem pipeline card |
| Pipeline auto-move | Agendar futuro + player em por_tratar/em_contacto → move para vir_treinar |
| Sair de vir_treinar com agendados | Prompt "cancelar N treinos?" (não auto-cancela) |
| Email trigger | Agendar + mudar data + cancelar |
| Email destinatário | Agendador original (`author_id`) |
| Self-email | Skip (como hoje) |
| Scouts | Leitura sim; sem INSERT/UPDATE/DELETE |
| Recruiter | Pode agendar, cancelar, avaliar, gerar link |
| Cycle scoping | `players.vir_treinar_entered_at` — snapshot actualizado no `updateRecruitmentStatus` |
| Pipeline card | Lista compacta "+X mais"; só ciclo actual; retroactivos excluídos |
| Cancelar treino | Delete calendar event; revogar link coach; motivo opcional |
| Link coach expirado | Pill "expirou" + botão regenerar |
| Editar avaliação coach | Locked após submit (só admin) |
| Paginação perfil | Sem paginação (3-4 treinos típico) |
| Link multi-treino | 1 link = 1 treino; popup se >1 ao pedir do pipeline |
| Auto-transição status | **Não** (manual). Status muda só por acção explícita |
| Apagar user com treinos | Treinos ficam (author_id SET NULL) |
| Helper "repetir N vezes" | Incluído na Fase 3 (form de agendar) |

---

## 10. Ficheiros de referência rápida

```
supabase/migrations/
├── 011_calendar_events.sql
├── 050_tasks_and_pipeline_fields.sql
├── 052_training_feedback.sql
├── 069_user_notification_preferences.sql
├── 091_training_feedback_structured.sql
├── 092_feedback_share_tokens.sql
├── 093_training_feedback_refinements.sql
├── 094_add_duvidas_decision.sql
├── 095_coach_observed_position.sql
├── 097_training_feedback_delete_rls.sql
├── 099_training_feedback_seen_at.sql
├── 104_feedback_share_tokens_rls.sql
└── 107_training_sessions.sql        ← NOVA (a criar)

src/actions/
├── training-feedback.ts              ← refactor grande (novos actions)
├── pipeline.ts                       ← helper vir_treinar_entered_at + prompt cancel
├── notifications.ts                  ← novos templates
├── notification-preferences.ts
└── calendar.ts                       ← remover overwrite, FK training_feedback_id

src/components/players/
├── TrainingFeedback.tsx              ← renomear → TrainingSessionsList.tsx
└── TrainingSessionCard.tsx           ← NOVO (card por treino com pill + CTAs)

src/components/pipeline/
└── PipelineCard.tsx                  ← substituir botão single-date por lista

src/components/feedback/CoachFeedbackForm.tsx  (mantém, é form público)
src/app/feedback/[token]/page.tsx              (ajustar para mostrar status cancelado)
src/app/api/feedback/[token]/route.ts          (validar status antes de aceitar submit)
src/lib/email.ts                               (subject prefixes)
src/lib/types/index.ts                         (novos tipos: TrainingStatus)
src/lib/supabase/queries.ts                    (getCurrentCycleTrainings, etc.)
src/lib/supabase/mappers.ts                    (mapear novos campos)
```

---

**Estado:** Plano completo. Próximo passo = começar Fase 1 (migration 107).

---

## 11. AUDIT — revisão crítica antes de começar (2026-04-16)

Auditei §1-10 contra: performance Vercel, RLS/security Supabase, correctness do schema, consistência com padrões existentes, edge cases adicionais, gaps de especificação.

### 🔴 Críticos (corrigir antes de iniciar)

**C1. N+1 query no pipeline card.**
`getCurrentCycleTrainings(playerId)` chamado por card = 1 query extra por player em vir_treinar. Com 30 players, 30 queries extra.
**Correcção:** estender o RPC `get_pipeline_players()` (migration 087) para agregar treinos do ciclo actual em JSON por player. 1 roundtrip em vez de N.
```sql
-- Exemplo: JOIN agregado dentro do RPC
SELECT json_agg(tf.* ORDER BY tf.training_date ASC) FILTER (WHERE ...)
  FROM training_feedback tf
  WHERE tf.player_id = p.id
    AND tf.created_at >= p.vir_treinar_entered_at
    AND tf.is_retroactive = false
    AND tf.status IN ('agendado', 'realizado')
```

**C2. `vir_treinar_entered_at` backfill fallback em falta.**
Query `MAX(status_history.created_at)` retorna NULL se player não tem history. Resultado: card não mostra treinos desse player.
**Correcção:** `COALESCE(MAX(sh.created_at), p.created_at)`. Se ainda NULL, deixar player sem treinos visíveis (conservador — só users já em vir_treinar no momento da migration).

**C3. FK `training_feedback.author_id` é RESTRICT (default).**
Não permite apagar profile que tenha treinos. Em demo mode / cleanup, bloqueia.
**Correcção:** alterar para `ON DELETE SET NULL` + tornar `author_id` nullable. Treino preserva-se (histórico), autor perdido. Ou manter RESTRICT se preferências são "nunca apagar users" — decidir.

**C4. Calendar sync — 2 caminhos divergentes.**
Hoje `syncCalendarEvent` em `pipeline.ts:59-136` faz upsert por player+type (1 event). No novo modelo, cada treino tem o seu. Se alguém ainda tocar em `updateTrainingDate` (legacy), comportamento volta ao overwrite.
**Correcção:** deprecar completamente `updateTrainingDate` e remover chamadas. Fazer todas as mutações de data via `rescheduleTraining(training_feedback_id)`.

**C5. Sync `players.training_date` após mutações de treino.**
Doc diz "mantém-se como espelho do próximo agendado" mas não especifica a query. Sem isso, pipeline card legacy lê valor stale.
**Correcção:** helper `syncPlayerNextTraining(playerId)` chamado após schedule/reschedule/cancel:
```sql
UPDATE players SET training_date = (
  SELECT MIN(training_date + COALESCE(session_time, '00:00'))
  FROM training_feedback
  WHERE player_id = $1 AND status = 'agendado' AND is_retroactive = false
) WHERE id = $1;
```

### 🟡 Performance / Vercel CPU

**P1. Auto-transição `agendado → realizado` — escolher nightly cron.**
On-query filter adiciona CASE a cada query → CPU. Preferir Vercel Cron (1 UPDATE à meia-noite):
```sql
UPDATE training_feedback SET status = 'realizado'
WHERE status = 'agendado' AND training_date < CURRENT_DATE;
```
Colocar em `src/app/api/cron/auto-transition-trainings/route.ts` com header auth.

**P2. Index compostos em falta.**
Adicionar:
- `idx_calendar_events_type_fb` em `(event_type, training_feedback_id) WHERE event_type = 'treino'` — para filtrar cancelados eficientemente
- `idx_training_feedback_retroactive` em `(player_id, is_retroactive, created_at)` — filtro rápido do pipeline card

**P3. Broadcasts a validar.**
Cada mutation deve broadcast `training_feedback` (INSERT/UPDATE/DELETE), `calendar_events` (se toca), `user_tasks` (se toca), `players` (se sync training_date). Lista explícita por action:
- `scheduleTraining`: training_feedback INSERT, calendar_events INSERT, user_tasks INSERT, players UPDATE
- `rescheduleTraining`: training_feedback UPDATE, calendar_events UPDATE, players UPDATE
- `cancelTraining`: training_feedback UPDATE, calendar_events DELETE, user_tasks UPDATE, players UPDATE
- `markTrainingMissed`: idem cancelTraining
- `updateTrainingEvaluation`: training_feedback UPDATE (apenas)
- `registerPastTraining`: training_feedback INSERT (apenas — nem calendar nem pipeline)

**P4. Dedupe 10s window — implementação eficiente.**
Server query `SELECT id FROM training_feedback WHERE player_id=$1 AND author_id=$2 AND training_date=$3 AND COALESCE(session_time, '00:00') = $4 AND created_at > NOW() - INTERVAL '10 seconds' LIMIT 1`. Index `(player_id, created_at DESC)` já ajuda.

**P5. Paginação 20 é conservadora.**
Mobile-first, mas players com muito histórico podem querer scroll. Confirmar 20 ou 50. Recomendo 50 para desktop, 20 para mobile (via param opcional).

### 🟠 Security / RLS

**S1. Public coach endpoint deve rejeitar cancelado/faltou.**
Hoje valida revoked/used/expired. Falta: se `training_feedback.status IN ('cancelado', 'faltou')` → 410 com mensagem "treino foi cancelado, contacta o clube".

**S2. Link coach não-revogado em cascade de cancel.**
Quando `cancelTraining` é chamado, revogar todos os `feedback_share_tokens` WHERE feedback_id=$1 AND revoked_at IS NULL. Garante que link antigo não funciona.

**S3. `is_retroactive` não-tampering.**
Server actions definem explicitamente:
- `scheduleTraining`: is_retroactive=false, status='agendado'
- `registerPastTraining`: is_retroactive=true, status='realizado'
Nunca aceitar valor do client.

**S4. RLS UPDATE não cobre autor nulo.**
Se `author_id = NULL` (post-profile-delete), UPDATE policy `author_id = auth.uid()` falha sempre → só admin edita. Aceitável.

**S5. Cross-club check em todas as queries.**
Qualquer server action que aceite `trainingId` deve verificar `club_id = getActiveClub().clubId` — não confiar só no RLS.

**S6. `user_club_role()` confirmado existe (migration 032).**
Função reutilizável, usada em 11 migrations. OK para as novas policies.

### 🟢 Schema refinements

**Schema1. `DEFAULT 'realizado'` backfill redundante.**
PG 11+ faz fast default em ALTER TABLE ADD COLUMN — linhas existentes ficam virtualmente com 'realizado'. O `UPDATE training_feedback SET status = 'realizado' WHERE status IS NULL` é noop. Remover para migração mais limpa. MAS manter os UPDATEs para presence='missed'→faltou e presence='rescheduled'→cancelado.

**Schema2. `cancelled_at` set explícito na action, não DB default.**
Trigger não vale a pena. Server action set `cancelled_at = NOW()`, `cancelled_reason = text` atómico.

**Schema3. `session_time TIME` + `training_date DATE` é TZ-naive.**
Combinação = wall-clock local. Perfeito para contexto local (clube PT). Server actions devem tratar como tal (nunca converter para UTC).

**Schema4. `presence` field deprecação.**
Remover referências em UI mas NÃO drop da coluna (histórico compat). Backfill UPDATE lê presence para converter para status. Código novo só escreve status.

**Schema5. Types `TrainingFeedback` update necessário.**
Em `src/lib/types/index.ts` adicionar:
```ts
export type TrainingStatus = 'agendado' | 'realizado' | 'cancelado' | 'faltou';
```
Actualizar `TrainingFeedback` interface. Schemas Zod em `src/lib/validators.ts` também.

### 🔵 Edge cases adicionais encontrados

**E17. Agendar em estados terminais (`assinou`, `rejeitado`, `em_standby`).**
User disse: auto-move só de por_tratar/em_contacto. Outros estados: fica onde está (mas treino é criado). Edge: player em `assinou` agenda treino — faz sentido? Caso real: assinou mas ainda tem treino para fazer. Permitir mas sem auto-move.

**E18. Player move de `vir_treinar` para `vir_treinar` (no-op).**
Server action deve skip actualizar `vir_treinar_entered_at` se oldStatus === newStatus (evita overwrite inútil).

**E19. Coach submission race condition.**
Coach POSTs enquanto admin está a cancelar treino. Server verifica status antes do UPDATE (select + update sequencial). Resolver via `UPDATE ... WHERE status = 'agendado' OR status = 'realizado'` — transitive check. Se 0 rows afectadas → ignorar submit silenciosamente + marcar token usado.

**E20. Multiple coaches gerar link para o mesmo treino.**
User disse: 1 link = 1 treino. Se já existe link activo, gerar novo revoga o antigo automaticamente. Ou recusa? Recomendo revoga+regenera (UX mais fluida).

**E21. Editar data depois de coach ter submetido.**
Status = realizado. User edita data → válido? Sim, mas deve manter avaliação. Só alterar campo data.

**E22. Cancel de treino com task já completed.**
Se user já fez a task (completed=true) e depois cancelamos o treino: task fica completed. Não desfaz. Aceitável.

### 📋 Especificações que faltam no §1-10

**Spec1. Realtime — tabelas + handlers explícitos.**
Lista em §5.7 focou email. Adicionar:
```
Broadcasts:
- training_feedback: INSERT, UPDATE, DELETE
- calendar_events: indirecto (FK)
- user_tasks: indirecto (FK)
- players: UPDATE (training_date, vir_treinar_entered_at)

Handlers client-side:
- PlayerProfile: useRealtimeTable('training_feedback', { playerId })
- PipelineView: useRealtimeTable('training_feedback', { club-wide })
- CalendarView: useRealtimeTable('calendar_events', ...)
```

**Spec2. Cron job spec.**
- Path: `src/app/api/cron/auto-transition-trainings/route.ts`
- Schedule: `0 0 * * *` (meia-noite UTC) — via `vercel.json` `crons`
- Auth: `CRON_SECRET` env var no header
- Query: `UPDATE training_feedback SET status='realizado' WHERE status='agendado' AND training_date < CURRENT_DATE`
- Broadcast: bulk broadcast após update

**Spec3. Test matrix.**
- Unit (Jest): state transitions, dedupe, backfill idempotent, RLS por role × operação
- Integration: auto-move pipeline, email skip self, calendar sync, coach endpoint rejects cancelado
- E2E (Playwright): smoke do perfil do atleta (agendar + cancelar + avaliar), pipeline card com múltiplos treinos

**Spec4. Migration rollback (down script).**
Não obrigatório (padrão do repo), mas útil:
- DROP COLUMNs adicionadas (status, session_time, location, etc.)
- DROP INDEX novos
- Restaurar unique index antigo em user_tasks

**Spec5. Helper "repetir N vezes" — decidir fase.**
User disse no Q&A: multi-session combinado é caso real. Deferir para Fase 8 é tardio. Recomendo **incluir na Fase 3** como simples botão "+ repetir" no form que pré-enche uma segunda data (não loop infinito).

### ✅ O que está sólido

- Decisões fechadas (§9) cobrem todos os flows principais
- Schema SQL (§6) é coerente (após corrigir C1-C5)
- Estados top-level (agendado/realizado/cancelado/faltou) cobrem todos os casos do user
- RLS excludes scouts correctly usando helper existente
- Fase por fase é incremental e testável
- Edge cases (§7) são realistas e com tratamento claro
- Self-email skip reutiliza lógica existente (zero código novo)

### 🎯 Resumo executivo do audit

| Categoria | Severidade | Nº findings | Impacto se não corrigido |
|---|---|---|---|
| Críticos | 🔴 | 5 (C1-C5) | Perf issues sérios OU bugs de data |
| Performance | 🟡 | 5 (P1-P5) | CPU Vercel + latência |
| Security | 🟠 | 6 (S1-S6) | 2 são bugs, 4 são verificações |
| Schema | 🟢 | 5 (Schema1-5) | Limpeza e correctness |
| Edge cases | 🔵 | 6 (E17-E22) | UX inconsistência |
| Specs em falta | 📋 | 5 (Spec1-5) | Planning gaps |

**Não arrancar Fase 1 sem:**
1. Aplicar correcções C1-C5 no §6 (schema) e §8 (fases)
2. Adicionar Spec1-2 (realtime + cron) ao plano
3. Decidir paginação 20 vs 50 (P5)
4. Decidir FK author_id CASCADE vs SET NULL (C3)

Após essas 4 decisões, plano está pronto para implementação.

---

## 12. Pós-audit — decisões aplicadas (2026-04-16)

### Respostas do user às questões pendentes

| Questão | Decisão | Aplicado em |
|---|---|---|
| FK `author_id` ao apagar user | **SET NULL** — treinos ficam disponíveis, autor perdido | §6 (schema SQL) |
| Paginação no perfil | **Sem paginação** — carrega todos (tipicamente 3-4) | §5.4, §8 Fase 3, §9 |
| Helper "repetir N vezes" | **Fase 3** (não Fase 8) | §8 |
| Auto-transição agendado→realizado | **Não** — só manual, sem cron | §8 Fase 7 |

### Correcções aplicadas unilateralmente (fixes técnicos dos findings C1-C5)

- **C1** N+1 pipeline card — solução documentada em §11 (RPC extension). A implementar na Fase 4.
- **C2** `vir_treinar_entered_at` backfill agora usa `COALESCE(MAX(sh.created_at), p.created_at)` — aplicado no §6.
- **C3** `training_feedback.author_id` passa a nullable + `ON DELETE SET NULL` — aplicado no §6.
- **C4** `updateTrainingDate` legacy — deprecar totalmente, remover chamadas. Aplicado no plano de Fase 2 (§8): sync via `rescheduleTraining` apenas.
- **C5** Helper `syncPlayerNextTraining(playerId)` documentado em §11 — implementar na Fase 2.

### Indexes adicionais adicionados ao schema

- `idx_calendar_events_type_fb (event_type, training_feedback_id) WHERE event_type='treino'`
- `idx_training_feedback_retroactive (player_id, is_retroactive, created_at DESC)`

### Status final

✅ Plano pronto para implementação da Fase 1 (migration 107).

Próximo passo quando arrancares: criar branch `feat/training-sessions-fase1`, escrever `supabase/migrations/107_training_sessions.sql` conforme §6, correr `test-migrations.sh`, abrir PR da migration isolada (as fases 2+ noutros PRs).

---

## 13. Implementação — Fases 1-3 (2026-04-17)

Branch: `feat/training-sessions-fase1`.

### ✅ Fase 1 — Schema (migration 107 aplicada)
- `training_feedback` + 7 colunas novas (status, session_time, location, observed_position, cancelled_at, cancelled_reason, is_retroactive)
- `author_id` nullable + `ON DELETE SET NULL` (preserva treinos ao apagar users)
- Backfill `presence` → `status` (missed → faltou, rescheduled → cancelado)
- `players.vir_treinar_entered_at` + backfill com `COALESCE` fallback
- 5 indexes novos
- FK `calendar_events.training_feedback_id`
- FK `user_tasks.training_feedback_id` + rebuild do unique index
- RLS: exclui scouts de INSERT/UPDATE

### ✅ Fase 2 — Server actions
- Novos: `scheduleTraining`, `rescheduleTraining`, `cancelTraining`, `markTrainingMissed`, `markTrainingAttended`, `registerPastTraining`, `updateTrainingEvaluation`
- Helper `syncPlayerNextTraining` (`players.training_date` = próximo agendado)
- Dedupe 10s window no `scheduleTraining`
- `createCoachFeedbackLink` refactor: aceita `existingTrainingId` — attach a treino existente (revoga tokens antigos)
- POST `/api/feedback/[token]`: submit coach seta `status='realizado'`
- `pipeline.ts`: actualiza `vir_treinar_entered_at` ao entrar em vir_treinar

### ✅ Fase 3 — UI perfil do atleta
- `TrainingSessionsList.tsx` substitui `TrainingFeedback.tsx` (legacy orphan)
- CTAs: Registar treino (principal) + Agendar (compacto)
- Cards com header colorido por rating, dot com valor, pill de estado, badges contextuais
- Rendimento + Potencial lado a lado
- Dialog "Agendar": multi-data picker explícito (sem cron-style)
- Dialog "Registar" e "Editar avaliação": layout idêntico ao CoachFeedbackForm
- ⋮ menu contextual por estado

### ✅ Fase 4 — Pipeline card
- Migration 108: estende RPC `get_pipeline_players` para incluir `training_sessions` do ciclo actual por player (JSON agregado, evita N+1)
- `PipelineView` propaga `trainingSessionsMap` → `KanbanBoard` → `StatusColumn` → `PipelineCard`
- Novo componente `TrainingSessionChips` no card: chips compactos com data+hora, cores por estado (amber agendado · orange overdue · yellow sem avaliação · green realizado), max 2 + "+X" mais
- Single-date button legacy escondido para `vir_treinar` (mantém para reuniao/confirmado)
- `ScheduleTrainingDialog`: **obrigatório** ao mover para `vir_treinar` no pipeline, mesmo layout do agendar no perfil
- Card de realizado com rating mantém dot colorido com número; estados sem rating (agendado/cancelado/faltou/pendente) usam ícone temático (Calendar/XCircle/UserX/AlertTriangle)
- Countdown subtil: "hoje", "amanhã", "daqui a X dias", "ontem", "há X dias"
- Realtime em `training_feedback` para refetch quando há mudanças

### ⏳ Fase 5+ pendentes (próximos PRs)
- Fase 5: Calendar — remover `syncCalendarEvent` overwrite legacy; 1 event por training_feedback_id
- Fase 6: Notificações refinadas (subject prefixes "Alterado:", "Cancelado:")
- Fase 7-8: polish (lembrete dia-anterior via cron, /treinos listagem, audit log)

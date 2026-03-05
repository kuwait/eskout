-- 011_calendar_events.sql
-- Calendar events table for tracking meetings, training sessions, signings, and generic tasks
-- Supports optional player association and assignee (app user or free-text name)

CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  age_group_id INT REFERENCES age_groups(id) ON DELETE CASCADE,
  player_id INT REFERENCES players(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('treino', 'assinatura', 'reuniao', 'observacao', 'outro')),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME,
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  -- Assignee: either a user from the app or a free-text name
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_name TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast calendar queries by date range + age group
CREATE INDEX idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX idx_calendar_events_age_group ON calendar_events(age_group_id, event_date);
CREATE INDEX idx_calendar_events_player ON calendar_events(player_id);

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "calendar_events_select" ON calendar_events
  FOR SELECT USING (true);

-- Authenticated users can insert
CREATE POLICY "calendar_events_insert" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admins and event creator can update
CREATE POLICY "calendar_events_update" ON calendar_events
  FOR UPDATE USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins and event creator can delete
CREATE POLICY "calendar_events_delete" ON calendar_events
  FOR DELETE USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Migration 068: Contact purposes for pipeline approaches
-- Stores structured "Objetivo do Contacto" options per club
-- Appears when moving a player to em_contacto status

/* ───────────── Contact Purposes Table ───────────── */

CREATE TABLE contact_purposes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contact_purposes_club ON contact_purposes(club_id);

/* ───────────── New columns on status_history ───────────── */

ALTER TABLE status_history ADD COLUMN contact_purpose_id UUID REFERENCES contact_purposes(id) ON DELETE SET NULL;
ALTER TABLE status_history ADD COLUMN contact_purpose_custom TEXT;

/* ───────────── RLS Policies ───────────── */

ALTER TABLE contact_purposes ENABLE ROW LEVEL SECURITY;

-- Everyone in the club can read
CREATE POLICY "contact_purposes_select" ON contact_purposes
  FOR SELECT USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid())
  );

-- Admins can insert/update/delete
CREATE POLICY "contact_purposes_insert" ON contact_purposes
  FOR INSERT WITH CHECK (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "contact_purposes_update" ON contact_purposes
  FOR UPDATE USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "contact_purposes_delete" ON contact_purposes
  FOR DELETE USING (
    club_id IN (SELECT club_id FROM club_memberships WHERE user_id = auth.uid() AND role = 'admin')
  );

/* ───────────── Seed Function ───────────── */

CREATE OR REPLACE FUNCTION seed_contact_purposes(p_club_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_labels TEXT[] := ARRAY[
    'Vir Treinar',
    'Nova reunião',
    'Tirar dúvidas',
    'Proposta / Assinar',
    'Pedir informações',
    'Conseguir resposta',
    'Follow-up',
    'Apresentar o clube',
    'Conhecer o jogador / família',
    'Negociar condições',
    'Confirmar disponibilidade',
    'Marcar treino',
    'Pedir documentação',
    'Renovar interesse',
    'Agradecer',
    'Confirmar presença'
  ];
  i INT;
BEGIN
  -- Skip if club already has contact purposes
  IF EXISTS (SELECT 1 FROM contact_purposes WHERE club_id = p_club_id LIMIT 1) THEN
    RETURN;
  END IF;

  FOR i IN 1..array_length(v_labels, 1) LOOP
    INSERT INTO contact_purposes (club_id, label, sort_order)
    VALUES (p_club_id, v_labels[i], i);
  END LOOP;
END;
$$;

/* ───────────── Backfill existing clubs ───────────── */

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM clubs LOOP
    PERFORM seed_contact_purposes(r.id);
  END LOOP;
END;
$$;

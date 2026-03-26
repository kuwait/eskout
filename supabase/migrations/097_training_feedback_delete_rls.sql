-- Migration 097: Allow author OR admin to delete training feedback
-- Previously only admin could delete (RLS from migration 084)
-- RELEVANT FILES: src/actions/training-feedback.ts

DROP POLICY IF EXISTS "Admin delete training feedback" ON training_feedback;
CREATE POLICY "Author or admin delete training feedback"
  ON training_feedback FOR DELETE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM club_memberships
      WHERE club_memberships.club_id = training_feedback.club_id
        AND club_memberships.user_id = auth.uid()
        AND club_memberships.role = 'admin'
    )
  );

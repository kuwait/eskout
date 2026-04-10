-- Migration 104: Enable RLS on feedback_share_tokens
-- Fixes Supabase security advisory: table was publicly accessible without RLS
-- RELEVANT FILES: supabase/migrations/092_feedback_share_tokens.sql, src/actions/training-feedback.ts, src/app/api/feedback/[token]/route.ts

-- NOTE: The public /api/feedback/[token] route uses createServiceClient() (service role)
-- which bypasses RLS entirely — external coach access is unaffected.

-- Step 1: Enable RLS
ALTER TABLE feedback_share_tokens ENABLE ROW LEVEL SECURITY;

-- Step 2: Authenticated users can read tokens for their club
CREATE POLICY "Club members can read share tokens"
  ON feedback_share_tokens FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
  );

-- Step 3: Authenticated users can create tokens for their club
CREATE POLICY "Club members can create share tokens"
  ON feedback_share_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Step 4: Authenticated users can update tokens for their club (revoke, mark used)
CREATE POLICY "Club members can update share tokens"
  ON feedback_share_tokens FOR UPDATE
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM club_memberships WHERE user_id = auth.uid()
    )
  );

-- 113_user_tasks_reassign.sql
-- Allow owners to reassign their tasks to other club members + admin can reassign any task.
-- Original RLS policy "Users update own tasks" had WITH CHECK (user_id = auth.uid()),
-- which silently rejected setting user_id to a different user. Server appeared to update
-- successfully but the row stayed unchanged.

-- Drop and recreate the owner update policy with a relaxed WITH CHECK.
DROP POLICY IF EXISTS "Users update own tasks" ON user_tasks;

CREATE POLICY "Users update own tasks"
  ON user_tasks FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    -- Either keep owning the task (most updates: title/dueDate/playerId/completed/...)
    user_id = auth.uid()
    -- Or reassign it to another member of the same club (new: cross-user reassignment)
    OR user_id IN (
      SELECT cm.user_id
      FROM club_memberships cm
      WHERE cm.club_id = user_tasks.club_id
    )
  );

-- Admin can update any task in their club (for admin-driven reassignment / edits).
CREATE POLICY "Admin updates club tasks"
  ON user_tasks FOR UPDATE
  USING (user_club_role(auth.uid(), club_id) = 'admin')
  WITH CHECK (user_club_role(auth.uid(), club_id) = 'admin');

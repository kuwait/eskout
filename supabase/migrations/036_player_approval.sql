-- Migration 036: Player approval flow
-- Scouts need admin/editor approval for new players.
-- Recruiters/editors auto-approved but admin gets notified.

-- pending_approval: true = scout-created, needs explicit approval
ALTER TABLE players ADD COLUMN pending_approval BOOLEAN DEFAULT false;

-- admin_reviewed: false = admin hasn't seen this yet (recruiter/editor additions)
ALTER TABLE players ADD COLUMN admin_reviewed BOOLEAN DEFAULT true;

-- Index for quick count of pending/unreviewed players
CREATE INDEX idx_players_pending ON players (club_id, pending_approval) WHERE pending_approval = true;
CREATE INDEX idx_players_unreviewed ON players (club_id, admin_reviewed) WHERE admin_reviewed = false;

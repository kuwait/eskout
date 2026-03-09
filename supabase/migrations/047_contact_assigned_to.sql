-- Migration 047: Add contact_assigned_to field for recruitment contact responsibility
-- Stores which user is assigned to make the contact call for a player in recruitment pipeline

ALTER TABLE players ADD COLUMN contact_assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for quick lookups (e.g. "show me all players assigned to user X")
CREATE INDEX idx_players_contact_assigned_to ON players(contact_assigned_to) WHERE contact_assigned_to IS NOT NULL;

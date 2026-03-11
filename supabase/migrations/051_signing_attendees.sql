-- 051: Add signing_attendees array to players table
-- Tracks who is responsible for the signing day (confirmado status)
-- Same pattern as meeting_attendees for reuniao_marcada

ALTER TABLE players ADD COLUMN IF NOT EXISTS signing_attendees uuid[] DEFAULT '{}';

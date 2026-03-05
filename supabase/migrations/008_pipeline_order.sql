-- 008_pipeline_order.sql
-- Add ordering column for pipeline (abordagens) Kanban cards
-- Allows drag-and-drop reordering within each status column

ALTER TABLE players ADD COLUMN IF NOT EXISTS pipeline_order INT DEFAULT 0;

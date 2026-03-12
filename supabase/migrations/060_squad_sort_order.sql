-- 060_squad_sort_order.sql
-- Add sort_order to squads table for user-controlled ordering
-- Defaults to 0; lower values appear first

ALTER TABLE squads ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

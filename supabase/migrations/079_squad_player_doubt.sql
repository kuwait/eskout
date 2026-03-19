-- Migration 079: Add is_doubt flag to squad_players
-- Allows marking players as "Dúvida" within a squad (per-squad-per-player)
ALTER TABLE squad_players ADD COLUMN is_doubt BOOLEAN NOT NULL DEFAULT false;

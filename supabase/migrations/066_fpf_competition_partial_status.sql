-- Migration 066: Add 'partial' scrape status for interrupted scraping
-- When a user stops scraping mid-way, the competition should show 'partial' not 'complete'

ALTER TABLE fpf_competitions DROP CONSTRAINT IF EXISTS fpf_competitions_scrape_status_check;
ALTER TABLE fpf_competitions ADD CONSTRAINT fpf_competitions_scrape_status_check
  CHECK (scrape_status IN ('pending', 'scraping', 'complete', 'partial', 'error'));

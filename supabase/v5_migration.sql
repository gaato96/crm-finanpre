-- v5: Add email tracking columns to announcements table
-- Run this in Supabase SQL Editor

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_recipients_count INTEGER;

-- Index for ordering by email send date (optional)
CREATE INDEX IF NOT EXISTS idx_announcements_email_sent ON announcements(last_email_sent_at) WHERE last_email_sent_at IS NOT NULL;

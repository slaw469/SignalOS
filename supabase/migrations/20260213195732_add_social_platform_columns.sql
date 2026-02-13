-- Add multi-platform support columns to tweets table
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'x';
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS postiz_post_id TEXT;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS postiz_state TEXT;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS postiz_synced_at TIMESTAMPTZ;

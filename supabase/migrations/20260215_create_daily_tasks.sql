-- Daily non-negotiable task templates
CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily completion tracking (one row per task per day)
CREATE TABLE IF NOT EXISTS daily_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_task_id UUID NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(daily_task_id, completed_date)
);

-- Index for fast lookups by date
CREATE INDEX idx_daily_task_completions_date ON daily_task_completions(completed_date);

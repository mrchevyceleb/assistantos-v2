-- AssistantOS Cloud Tasks
-- Migration: Create sync_tasks table for cloud-based task storage

-- ============================================================================
-- SYNC TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id UUID NOT NULL,

  -- Core task fields
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
  project_name TEXT NOT NULL,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  due_date DATE,

  -- Document link (optional, relative workspace path)
  document_path TEXT,

  -- Kanban ordering within columns
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Flexible data for future extensions
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Prevent duplicate tasks per user
  UNIQUE(sync_id, project_name, title)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sync_tasks_sync_id ON sync_tasks(sync_id);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_status ON sync_tasks(sync_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_project ON sync_tasks(sync_id, project_name);
CREATE INDEX IF NOT EXISTS idx_sync_tasks_due_date ON sync_tasks(sync_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_tasks_updated ON sync_tasks(updated_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_sync_tasks_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();

  -- Set completed_at when status changes to done
  IF NEW.status = 'done' AND (OLD.status IS NULL OR OLD.status != 'done') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_tasks_timestamps ON sync_tasks;
CREATE TRIGGER sync_tasks_timestamps
  BEFORE UPDATE ON sync_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_sync_tasks_timestamps();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE sync_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations (security via sync_id at app level)
CREATE POLICY "Allow all on sync_tasks" ON sync_tasks
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE sync_tasks;

-- Additive: existing clients remain unscheduled. No production records are rewritten.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_completed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_notified_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_owner uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_follow_up_due_idx ON leads(follow_up_at,id)
  WHERE follow_up_at IS NOT NULL AND follow_up_completed_at IS NULL AND follow_up_notified_at IS NULL;

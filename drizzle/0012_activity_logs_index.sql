CREATE INDEX IF NOT EXISTS activity_logs_action_created_idx ON activity_logs(action, created_at DESC);

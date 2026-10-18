-- Durable read-only health for the local movie worker. It never grants publishing rights.
CREATE TABLE IF NOT EXISTS movie_worker_heartbeats (
  worker_id text PRIMARY KEY,
  last_poll_at timestamptz NOT NULL,
  last_success_at timestamptz,
  current_job_id uuid REFERENCES movie_jobs(id) ON DELETE SET NULL,
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movie_worker_heartbeats_poll_idx ON movie_worker_heartbeats(last_poll_at);

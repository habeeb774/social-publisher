-- Movie reels foundation: run after review, not automatically.
CREATE TABLE IF NOT EXISTS movie_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL,
 source_storage_key text,
 rights_status text NOT NULL DEFAULT 'pending' CHECK(rights_status IN ('pending','verified','rejected','revoked')),
 rights_basis text,
 rights_verified_by uuid REFERENCES users(id),
 rights_verified_at timestamptz,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS movie_clips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 movie_id uuid NOT NULL REFERENCES movie_assets(id),
 part_number integer NOT NULL CHECK(part_number>0),
 start_ms integer NOT NULL CHECK(start_ms>=0),
 duration_ms integer NOT NULL DEFAULT 30000 CHECK(duration_ms>0 AND duration_ms<=30000),
 output_storage_key text,
 subtitle_storage_key text,
 status text NOT NULL DEFAULT 'processing',
 approved_by uuid REFERENCES users(id),
 approved_at timestamptz,
 page_id uuid REFERENCES facebook_pages(id),
 scheduled_at timestamptz,
 remote_reel_id text,
 UNIQUE(movie_id,part_number)
);
CREATE TABLE IF NOT EXISTS movie_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 movie_id uuid NOT NULL REFERENCES movie_assets(id),
 status text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movie_clips_page_schedule_idx ON movie_clips(page_id,scheduled_at);
-- Publication worker must verify rights, explicit page, clip approval, and quota.
ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS rights_expires_at timestamptz;
ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS rights_evidence text;
ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS facebook_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS excerpts_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS movie_assets_owner_idx ON movie_assets(owner_user_id,created_at);
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS captions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS subtitle_reviewed boolean NOT NULL DEFAULT false;
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS remote_permalink text;
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'process';
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE;
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS movie_jobs_due_idx ON movie_jobs(status,lease_expires_at);
CREATE TABLE IF NOT EXISTS movie_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clip_id uuid NOT NULL REFERENCES movie_clips(id), revision integer NOT NULL,
 reviewer_id uuid NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('approved','rejected')), note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movie_approvals_clip_idx ON movie_approvals(clip_id,revision);
CREATE TABLE IF NOT EXISTS movie_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clip_id uuid NOT NULL UNIQUE REFERENCES movie_clips(id),
 page_id uuid NOT NULL REFERENCES facebook_pages(id), revision integer NOT NULL,
 scheduled_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','publishing','processing','published','failed','outcome_unknown','cancelled')),
 attempts integer NOT NULL DEFAULT 0,
 remote_reel_id text, remote_permalink text,
 lease_token uuid, lease_expires_at timestamptz, error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movie_publications_due_idx ON movie_publications(status,scheduled_at);
CREATE INDEX IF NOT EXISTS movie_publications_quota_idx ON movie_publications(page_id,scheduled_at);
-- Quota enforcement still requires an atomic per-page reservation transaction.
-- No migration runner or production feature flag is invoked by this file.

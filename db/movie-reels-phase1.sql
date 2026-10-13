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

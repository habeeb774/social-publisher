-- Movie pipeline: persisted upload sessions, worker job targets, clip base renders and publish retries.
-- Additive only. Apply after 0019/0020 on a disposable branch first; no publishing is enabled by this file.
CREATE TABLE IF NOT EXISTS movie_upload_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 movie_id uuid NOT NULL REFERENCES movie_assets(id),
 owner_user_id uuid NOT NULL REFERENCES users(id),
 storage_key text NOT NULL UNIQUE,
 provider_upload_id text NOT NULL,
 file_name text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>0),
 mime_type text NOT NULL CHECK(mime_type IN ('video/mp4','video/quicktime')),
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','completing','completed','aborted','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS movie_upload_sessions_active_idx ON movie_upload_sessions(movie_id) WHERE status IN ('uploading','completing');
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS clip_id uuid REFERENCES movie_clips(id);
ALTER TABLE movie_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE movie_clips ADD COLUMN IF NOT EXISTS base_storage_key text;
ALTER TABLE movie_publications ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE movie_publications ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

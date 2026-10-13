ALTER TABLE movie_assets ADD COLUMN IF NOT EXISTS rights_revision integer NOT NULL DEFAULT 1 CHECK(rights_revision>0);
CREATE TABLE IF NOT EXISTS movie_rights_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),movie_id uuid NOT NULL REFERENCES movie_assets(id),
 revision integer NOT NULL,reviewer_id uuid NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('verified','rejected','revoked')),note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(movie_id,revision)
);

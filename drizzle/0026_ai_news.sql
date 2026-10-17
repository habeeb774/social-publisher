CREATE TABLE IF NOT EXISTS ai_news_stories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint text NOT NULL UNIQUE,
 title text NOT NULL, status text NOT NULL DEFAULT 'pending_verification', arabic_post text,
 duplicate_of uuid REFERENCES ai_news_stories(id), breaking boolean NOT NULL DEFAULT false,
 verification jsonb NOT NULL DEFAULT '{}', published_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ai_story_status CHECK(status IN ('pending_verification','verified','rejected'))
);
CREATE INDEX IF NOT EXISTS ai_news_status_idx ON ai_news_stories(status,created_at);
CREATE TABLE IF NOT EXISTS ai_news_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), story_id uuid NOT NULL REFERENCES ai_news_stories(id),
 url text NOT NULL UNIQUE, source_id text NOT NULL, independence_group text NOT NULL,
 title text NOT NULL, excerpt text NOT NULL, sha256 text NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_news_reports_story_idx ON ai_news_reports(story_id);
CREATE TABLE IF NOT EXISTS ai_news_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), story_id uuid NOT NULL REFERENCES ai_news_stories(id),
 page_id uuid NOT NULL REFERENCES facebook_pages(id), status text NOT NULL DEFAULT 'queued',
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 reserved_at timestamptz, facebook_post_id text, published_at timestamptz, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT ai_attempts_range CHECK(attempts BETWEEN 0 AND 5),
 CONSTRAINT ai_publication_status CHECK(status IN ('queued','preflight','publishing','published','failed','uncertain'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_news_one_publication_per_story ON ai_news_publications(story_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_news_facebook_id_unique ON ai_news_publications(facebook_post_id);
CREATE INDEX IF NOT EXISTS ai_news_due_idx ON ai_news_publications(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS ai_news_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), story_id uuid, code text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_news_events_time_idx ON ai_news_events(created_at);

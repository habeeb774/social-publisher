CREATE TABLE IF NOT EXISTS facebook_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), page_id uuid NOT NULL REFERENCES facebook_pages(id), post_id text, facebook_comment_id text NOT NULL UNIQUE, parent_facebook_comment_id text,
 author_id text, author_name text, author_avatar text, message text NOT NULL, created_time timestamptz NOT NULL, permalink text,
 status text NOT NULL DEFAULT 'unread' CHECK(status IN ('new','unread','needs_reply','replied','resolved','important','spam','hidden','failed')), sentiment text NOT NULL DEFAULT 'neutral', is_from_page boolean NOT NULL DEFAULT false, is_hidden boolean NOT NULL DEFAULT false, needs_reply boolean NOT NULL DEFAULT true, assigned_to uuid REFERENCES users(id),
 first_seen_at timestamptz NOT NULL DEFAULT now(), last_synced_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facebook_comments_page_idx ON facebook_comments(page_id,created_time DESC);
CREATE INDEX IF NOT EXISTS facebook_comments_post_idx ON facebook_comments(post_id);
CREATE INDEX IF NOT EXISTS facebook_comments_status_idx ON facebook_comments(status,created_time DESC);
CREATE INDEX IF NOT EXISTS facebook_comments_needs_reply_idx ON facebook_comments(needs_reply,created_time DESC);
CREATE INDEX IF NOT EXISTS facebook_comments_parent_idx ON facebook_comments(parent_facebook_comment_id);
CREATE TABLE IF NOT EXISTS quick_replies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, content text NOT NULL, category text NOT NULL DEFAULT 'عام', active boolean NOT NULL DEFAULT true, usage_count integer NOT NULL DEFAULT 0, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS comment_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, active boolean NOT NULL DEFAULT false, priority integer NOT NULL DEFAULT 100, config jsonb NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS comment_replies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES facebook_comments(id), facebook_reply_id text UNIQUE, content text NOT NULL, reply_type text NOT NULL CHECK(reply_type IN ('manual','template','automation','ai_assisted')), status text NOT NULL DEFAULT 'draft', provider text NOT NULL DEFAULT 'windsor_mcp', sent_by text, approved_by text, template_id uuid REFERENCES quick_replies(id), rule_id uuid REFERENCES comment_rules(id), due_at timestamptz, sent_at timestamptz, failed_at timestamptz, error_code text, error_message text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_automated_reply_per_comment ON comment_replies(comment_id) WHERE reply_type='automation';
CREATE INDEX IF NOT EXISTS comment_replies_comment_idx ON comment_replies(comment_id,created_at);
CREATE TABLE IF NOT EXISTS comment_tags(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS comment_tag_links(comment_id uuid NOT NULL REFERENCES facebook_comments(id), tag_id uuid NOT NULL REFERENCES comment_tags(id), PRIMARY KEY(comment_id,tag_id));
CREATE TABLE IF NOT EXISTS comment_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES facebook_comments(id), body text NOT NULL, author text NOT NULL, mentions text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS comment_automation_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), comment_id uuid NOT NULL REFERENCES facebook_comments(id), rule_id uuid REFERENCES comment_rules(id), status text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS comment_rule_once ON comment_automation_events(comment_id,rule_id) WHERE rule_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS comments_sync_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL, imported integer NOT NULL DEFAULT 0, error_code text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE TABLE IF NOT EXISTS comment_api_limits(key text PRIMARY KEY, window_at timestamptz NOT NULL DEFAULT now(), count integer NOT NULL DEFAULT 0);

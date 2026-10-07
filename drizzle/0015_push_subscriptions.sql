CREATE TABLE IF NOT EXISTS push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 endpoint text NOT NULL UNIQUE,
 p256dh text NOT NULL,
 auth text NOT NULL,
 user_agent text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_updated_idx ON push_subscriptions(updated_at DESC);

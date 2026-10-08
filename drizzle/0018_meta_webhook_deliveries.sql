-- Internal ingress queue; never expose payloads through dashboard/audit APIs.
CREATE TABLE meta_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest text NOT NULL UNIQUE CHECK (digest ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','needs_review')),
  claim_token uuid,
  claimed_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'processing') = (claim_token IS NOT NULL AND claimed_at IS NOT NULL))
);
CREATE INDEX meta_webhook_pending_idx ON meta_webhook_deliveries(created_at,id) WHERE status = 'pending';
CREATE INDEX meta_webhook_processing_idx ON meta_webhook_deliveries(claimed_at) WHERE status = 'processing';

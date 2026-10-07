CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES facebook_pages(id),
  messenger_conversation_id uuid REFERENCES messenger_conversations(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'new',
  notes text,
  assigned_to uuid REFERENCES users(id),
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_messenger_conversation_uidx ON leads(messenger_conversation_id) WHERE messenger_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS leads_page_idx ON leads(page_id, updated_at DESC);

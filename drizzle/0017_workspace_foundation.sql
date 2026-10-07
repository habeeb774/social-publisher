-- Foundation only. Existing data is not reassigned and multi-workspace UI stays disabled.
CREATE TABLE workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_members (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK (role IN ('owner','admin','manager','editor','publisher','support','viewer')),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace_id,user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id,workspace_id);
CREATE TABLE workspace_pages (
 page_id uuid PRIMARY KEY REFERENCES facebook_pages(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_pages_workspace_idx ON workspace_pages(workspace_id,page_id);

CREATE TABLE "comment_team_members" (
 "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),
 "password_hash" text NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "session_version" integer DEFAULT 0 NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL
);

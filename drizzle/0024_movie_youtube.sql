-- Additive and opt-in. Facebook tables and publication state remain unchanged.
CREATE TABLE youtube_channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL REFERENCES users(id),
 channel_id text NOT NULL, title text NOT NULL, refresh_token_enc text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(channel_id)
);
CREATE TABLE youtube_oauth_states (
 state_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), verifier_enc text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE movie_youtube_rights (
 movie_id uuid PRIMARY KEY REFERENCES movie_assets(id) ON DELETE CASCADE,
 rights_revision integer NOT NULL, verified_by uuid NOT NULL REFERENCES users(id),
 evidence text NOT NULL CHECK(length(btrim(evidence))>=10), verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE movie_youtube_rights_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movie_id uuid NOT NULL REFERENCES movie_assets(id) ON DELETE CASCADE,
 reviewer_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL CHECK(decision IN ('verified','revoked')),
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE movie_youtube_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movie_id uuid NOT NULL REFERENCES movie_assets(id) ON DELETE CASCADE,
 clip_id uuid NOT NULL REFERENCES movie_clips(id) ON DELETE CASCADE, channel_id uuid NOT NULL REFERENCES youtube_channels(id),
 revision integer NOT NULL, rights_revision integer NOT NULL, scheduled_at timestamptz NOT NULL,
 privacy text NOT NULL CHECK(privacy IN ('private','unlisted','public')),
 made_for_kids boolean NOT NULL, synthetic_media boolean NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','uploading','processing','published','private','unlisted','failed','outcome_unknown','cancelled')),
 remote_video_id text, error_code text, lease_token uuid, lease_expires_at timestamptz, started_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(clip_id,channel_id)
);
CREATE INDEX movie_youtube_due ON movie_youtube_publications(status,scheduled_at);
CREATE INDEX movie_youtube_quota ON movie_youtube_publications(channel_id,scheduled_at);
-- Pending uploads are invalidated even when an older Facebook route edits/revokes a clip.
CREATE FUNCTION movie_youtube_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='movie_assets' THEN
  IF NEW.rights_revision<>OLD.rights_revision OR NEW.rights_status<>'verified' OR NEW.status='deleting' THEN
   DELETE FROM movie_youtube_rights WHERE movie_id=NEW.id;
   UPDATE movie_youtube_publications SET status='cancelled',updated_at=now()
     WHERE movie_id=NEW.id AND status='scheduled';
  END IF;
 ELSE
  IF NEW.revision<>OLD.revision OR NEW.approved_by IS NULL OR NOT NEW.subtitle_reviewed OR NEW.status IN ('rejected','excluded','rendering') THEN
   UPDATE movie_youtube_publications SET status='cancelled',updated_at=now()
     WHERE clip_id=NEW.id AND status='scheduled';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER movie_youtube_movie_changed AFTER UPDATE ON movie_assets FOR EACH ROW EXECUTE FUNCTION movie_youtube_invalidate();
CREATE TRIGGER movie_youtube_clip_changed AFTER UPDATE ON movie_clips FOR EACH ROW EXECUTE FUNCTION movie_youtube_invalidate();
-- Do not allow the existing delete workflow to destroy source files for an active/possibly published upload.
CREATE FUNCTION movie_youtube_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='deleting' AND EXISTS(SELECT 1 FROM movie_youtube_publications WHERE movie_id=NEW.id
   AND (status IN ('uploading','processing','outcome_unknown') OR remote_video_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'MOVIE_YOUTUBE_DELETE_NOT_ALLOWED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER movie_youtube_before_delete BEFORE UPDATE OF status ON movie_assets FOR EACH ROW EXECUTE FUNCTION movie_youtube_delete_guard();

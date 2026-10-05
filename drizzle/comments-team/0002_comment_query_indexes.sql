CREATE INDEX "comments_seek_idx" ON "facebook_comments" ("created_time" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "comments_author_history_idx" ON "facebook_comments" ("page_id","author_id","created_time" DESC);
--> statement-breakpoint
CREATE INDEX "comments_assigned_idx" ON "facebook_comments" ("assigned_to","created_time" DESC);

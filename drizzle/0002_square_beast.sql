CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_scheduled_at_idx" ON "posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_page_id_idx" ON "posts" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "publication_attempts_post_id_idx" ON "publication_attempts" USING btree ("post_id");

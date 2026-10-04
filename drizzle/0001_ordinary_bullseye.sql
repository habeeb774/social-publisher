ALTER TABLE "facebook_pages" ADD COLUMN "mcp_connection_reference" text;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD COLUMN "provider" text DEFAULT 'facebook_mcp' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD COLUMN "facebook_post_id" text;
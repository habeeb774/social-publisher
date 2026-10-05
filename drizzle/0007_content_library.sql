CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"media_url" text,
	"status" text DEFAULT 'new' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"converted_post_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_converted_post_id_posts_id_fk" FOREIGN KEY ("converted_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "library_items_kind_idx" ON "library_items" USING btree ("kind","status");

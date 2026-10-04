CREATE TABLE "scheduler_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"published_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"status" text NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE INDEX "scheduler_runs_triggered_at_idx" ON "scheduler_runs" USING btree ("triggered_at");
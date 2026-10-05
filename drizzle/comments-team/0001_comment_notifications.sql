CREATE TABLE "comment_notification_reads" (
 "notification_id" uuid NOT NULL REFERENCES "notifications"("id"),
 "owner" text NOT NULL,
 "read_at" timestamptz DEFAULT now() NOT NULL,
 PRIMARY KEY ("notification_id","owner")
);

import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users, facebookPages } from "./schema";

export const movieAssets = pgTable("movie_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  pageId: uuid("page_id").references(() => facebookPages.id),
  title: text("title").notNull(), sourceStorageKey: text("source_storage_key"),
  rightsStatus: text("rights_status").notNull().default("pending"), rightsBasis: text("rights_basis"),
  rightsRevision: integer("rights_revision").notNull().default(1),
  rightsVerifiedBy: uuid("rights_verified_by").references(() => users.id),
  rightsVerifiedAt: timestamp("rights_verified_at", {withTimezone:true}),
  rightsExpiresAt: timestamp("rights_expires_at", {withTimezone:true}),
  rightsEvidence: text("rights_evidence"), facebookAllowed: boolean("facebook_allowed").notNull().default(false),
  excerptsAllowed: boolean("excerpts_allowed").notNull().default(false),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {withTimezone:true}).notNull().defaultNow(),
}, t => [index("movie_assets_owner_idx").on(t.ownerUserId,t.createdAt), check("movie_assets_rights_check", sql`${t.rightsStatus} IN ('pending','verified','rejected','revoked')`)]);

export const movieClips = pgTable("movie_clips", {
  id: uuid("id").primaryKey().defaultRandom(), movieId: uuid("movie_id").notNull().references(() => movieAssets.id),
  partNumber: integer("part_number").notNull(), startMs: integer("start_ms").notNull(),
  durationMs: integer("duration_ms").notNull().default(30000),
  title: text("title").notNull().default(""), description: text("description").notNull().default(""),
  outputStorageKey: text("output_storage_key"), subtitleStorageKey: text("subtitle_storage_key"),
  captions: jsonb("captions").notNull().default([]), revision: integer("revision").notNull().default(1),
  subtitleReviewed: boolean("subtitle_reviewed").notNull().default(false),
  status: text("status").notNull().default("processing"),
  approvedBy: uuid("approved_by").references(() => users.id), approvedAt: timestamp("approved_at", {withTimezone:true}),
  pageId: uuid("page_id").references(() => facebookPages.id), scheduledAt: timestamp("scheduled_at", {withTimezone:true}),
  remoteReelId: text("remote_reel_id"), remotePermalink: text("remote_permalink"),
  updatedAt: timestamp("updated_at", {withTimezone:true}).notNull().defaultNow(),
}, t => [uniqueIndex("movie_clips_movie_part_unique").on(t.movieId,t.partNumber), index("movie_clips_page_schedule_idx").on(t.pageId,t.scheduledAt), check("movie_clips_interval_check",sql`${t.partNumber}>0 AND ${t.startMs}>=0 AND ${t.durationMs}>0 AND ${t.durationMs}<=30000`)]);

export const movieJobs = pgTable("movie_jobs", {
  id: uuid("id").primaryKey().defaultRandom(), movieId: uuid("movie_id").notNull().references(() => movieAssets.id),
  status: text("status").notNull().default("queued"), attempts: integer("attempts").notNull().default(0),
  kind: text("kind").notNull().default("process"), idempotencyKey: text("idempotency_key").unique(),
  leaseToken: uuid("lease_token"), leaseExpiresAt: timestamp("lease_expires_at", {withTimezone:true}),
  progress: integer("progress").notNull().default(0), errorMessage: text("error_message"),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
}, t => [index("movie_jobs_due_idx").on(t.status,t.leaseExpiresAt),check("movie_jobs_progress_check",sql`${t.progress} BETWEEN 0 AND 100 AND ${t.attempts}>=0`)]);

export const movieApprovals = pgTable("movie_approvals", {
  id: uuid("id").primaryKey().defaultRandom(), clipId: uuid("clip_id").notNull().references(() => movieClips.id),
  revision: integer("revision").notNull(), reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
  decision: text("decision").notNull(), note: text("note"),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
},t=>[index("movie_approvals_clip_idx").on(t.clipId,t.revision),check("movie_approvals_decision_check",sql`${t.decision} IN ('approved','rejected')`)]);

export const movieRightsReviews=pgTable("movie_rights_reviews",{
  id:uuid("id").primaryKey().defaultRandom(),movieId:uuid("movie_id").notNull().references(()=>movieAssets.id),
  revision:integer("revision").notNull(),reviewerId:uuid("reviewer_id").notNull().references(()=>users.id),
  decision:text("decision").notNull(),note:text("note").notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("movie_rights_reviews_revision_idx").on(t.movieId,t.revision),check("movie_rights_reviews_decision_check",sql`${t.decision} IN ('verified','rejected','revoked')`)]);

export const moviePublications = pgTable("movie_publications", {
  id: uuid("id").primaryKey().defaultRandom(),clipId: uuid("clip_id").notNull().unique().references(() => movieClips.id),
  pageId: uuid("page_id").notNull().references(() => facebookPages.id), revision: integer("revision").notNull(),
  scheduledAt: timestamp("scheduled_at", {withTimezone:true}).notNull(),
  status: text("status").notNull().default("scheduled"), attempts: integer("attempts").notNull().default(0),
  remoteReelId: text("remote_reel_id"), remotePermalink: text("remote_permalink"),
  leaseToken: uuid("lease_token"), leaseExpiresAt: timestamp("lease_expires_at", {withTimezone:true}),
  errorCode: text("error_code"), createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
},t=>[index("movie_publications_due_idx").on(t.status,t.scheduledAt),index("movie_publications_quota_idx").on(t.pageId,t.scheduledAt), check("movie_publications_status_check",sql`${t.status} IN ('scheduled','publishing','processing','published','failed','outcome_unknown','cancelled')`)]);

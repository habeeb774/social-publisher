import {pgTable, uuid, text, timestamp, integer, boolean, jsonb, index, uniqueIndex,foreignKey,check} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {facebookPages} from './schema';

export const aiStories = pgTable('ai_news_stories', {
  id: uuid('id').defaultRandom().primaryKey(),
  fingerprint: text('fingerprint').notNull().unique(),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending_verification'),
  arabicPost: text('arabic_post'),
  duplicateOf: uuid('duplicate_of'),
  breaking: boolean('breaking').notNull().default(false),
  verification: jsonb('verification').notNull().default({}),
  publishedAt: timestamp('published_at', {withTimezone:true}).notNull(),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(),
}, t=>[index('ai_news_status_idx').on(t.status,t.createdAt),foreignKey({columns:[t.duplicateOf],foreignColumns:[t.id]}),check('ai_story_status',sql`${t.status} IN ('pending_verification','verified','rejected')`)]);
export const aiReports = pgTable('ai_news_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  storyId: uuid('story_id').notNull().references(()=>aiStories.id),
  url: text('url').notNull().unique(),
  sourceId: text('source_id').notNull(),
  independenceGroup: text('independence_group').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull(),
  sha256: text('sha256').notNull(),
  fetchedAt: timestamp('fetched_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[index('ai_news_reports_story_idx').on(t.storyId)]);
export const aiPublications = pgTable('ai_news_publications', {
  id: uuid('id').defaultRandom().primaryKey(),
  storyId: uuid('story_id').notNull().references(()=>aiStories.id),
  pageId: uuid('page_id').notNull().references(()=>facebookPages.id),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at',{withTimezone:true}).defaultNow().notNull(),
  reservedAt: timestamp('reserved_at',{withTimezone:true}),
  facebookPostId: text('facebook_post_id'),
  publishedAt: timestamp('published_at',{withTimezone:true}),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[uniqueIndex('ai_news_one_publication_per_story').on(t.storyId),
       uniqueIndex('ai_news_facebook_id_unique').on(t.facebookPostId),
       index('ai_news_due_idx').on(t.status,t.nextAttemptAt),check('ai_attempts_range',sql`${t.attempts} BETWEEN 0 AND 5`),check('ai_publication_status',sql`${t.status} IN ('queued','preflight','publishing','published','failed','uncertain')`)]);
export const aiEvents = pgTable('ai_news_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  storyId: uuid('story_id'),
  code: text('code').notNull(),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
},t=>[index('ai_news_events_time_idx').on(t.createdAt)]);

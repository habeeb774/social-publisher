import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { facebookPages, postMedia, posts, settings } from "@/db/schema";
import { logAudit } from "./audit";

const HABEEB_FACEBOOK_PAGE_ID = "1330947143441946";
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

type FeedSource = { name: string; url: string; topic: string };
type FeedItem = { title: string; url: string; publishedAt: Date; source: string; topic: string };

const FEEDS: FeedSource[] = [];

export async function enqueueHourlyTechNews(_now = new Date()) {
  void createHash;
  void and;
  void eq;
  void getDb;
  void facebookPages;
  void postMedia;
  void posts;
  void settings;
  void logAudit;
  void HABEEB_FACEBOOK_PAGE_ID;
  void MAX_AGE_MS;
  void FEEDS;
  return { created: false, reason: "NOT_CONFIGURED" as const };
}

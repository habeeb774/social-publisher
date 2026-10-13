export const REEL_DURATION_MS = 30_000;
export const DAILY_REEL_LIMIT = 5;
export const REEL_TIME_ZONE = "Asia/Riyadh";

export type Rights = {
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  facebookAllowed: boolean;
  excerptsAllowed: boolean;
};
export type ReviewedClip = {
  id: string; part: number; durationMs: number;
  approvedBy: string | null; approvedAt: string | null;
  status: string; outputKey: string | null; subtitleReviewed: boolean;
};
const validDate = (value: string | null) => value ? Number.isFinite(Date.parse(value)) : false;
export function assertMovieRights(rights: Rights, now = new Date()) {
  if (rights.status !== "verified" || !rights.verifiedBy || !validDate(rights.verifiedAt)) throw new Error("MOVIE_RIGHTS_NOT_VERIFIED");
  if (!rights.facebookAllowed || !rights.excerptsAllowed) throw new Error("MOVIE_LICENSE_SCOPE_DENIED");
  if (rights.expiresAt && (!validDate(rights.expiresAt) || Date.parse(rights.expiresAt) <= now.getTime())) throw new Error("MOVIE_LICENSE_EXPIRED");
}
export function assertClipReview(clip: ReviewedClip) {
  if (!clip.approvedBy || !validDate(clip.approvedAt) || !clip.subtitleReviewed) throw new Error("MOVIE_CLIP_REVIEW_REQUIRED");
  if (!clip.outputKey || clip.durationMs !== REEL_DURATION_MS || !Number.isInteger(clip.part) || clip.part < 1) throw new Error("MOVIE_CLIP_INVALID");
  if (!["approved", "scheduled"].includes(clip.status)) throw new Error("MOVIE_CLIP_NOT_PUBLISHABLE");
}
export function riyadhDay(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error("MOVIE_SCHEDULE_INVALID");
  return new Intl.DateTimeFormat("en-CA", { timeZone: REEL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export type Reservation = { clipId: string; pageId: string; scheduledAt: Date };
/** Pure planning only. The persistence layer must reserve the resulting slots atomically. */
export function planReelSchedule(input: {
  rights: Rights; clips: ReviewedClip[]; pageId: string;
  allowedPages: ReadonlySet<string> | null; start: Date;
  reservations: Reservation[]; now?: Date;
}): Reservation[] {
  const now = input.now ?? new Date();
  assertMovieRights(input.rights, now);
  if (!input.pageId || (input.allowedPages !== null && !input.allowedPages.has(input.pageId))) throw new Error("MOVIE_PAGE_ACCESS_DENIED");
  if (!Number.isFinite(input.start.getTime()) || input.start.getTime() <= now.getTime()) throw new Error("MOVIE_SCHEDULE_INVALID");
  const ids = new Set(input.reservations.map(slot => slot.clipId));
  const parts = new Set<number>();
  const counts = new Map<string, number>();
  const occupied = new Set<number>();
  for (const slot of input.reservations.filter(slot => slot.pageId === input.pageId)) {
    const day = riyadhDay(slot.scheduledAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
    occupied.add(slot.scheduledAt.getTime());
  }
  let cursor = new Date(input.start);
  const planned: Reservation[] = [];
  for (const clip of [...input.clips].sort((a, b) => a.part - b.part)) {
    assertClipReview(clip);
    if (ids.has(clip.id) || parts.has(clip.part)) throw new Error("MOVIE_DUPLICATE_CLIP");
    // Five evenly spaced slots per Riyadh day; never exceed the page quota.
    while ((counts.get(riyadhDay(cursor)) ?? 0) >= DAILY_REEL_LIMIT || occupied.has(cursor.getTime())) cursor = new Date(cursor.getTime() + 86_400_000 / DAILY_REEL_LIMIT);
    assertMovieRights(input.rights, cursor);
    const day = riyadhDay(cursor);
    planned.push({ clipId: clip.id, pageId: input.pageId, scheduledAt: new Date(cursor) });
    counts.set(day, (counts.get(day) ?? 0) + 1);
    ids.add(clip.id); parts.add(clip.part); occupied.add(cursor.getTime());
    cursor = new Date(cursor.getTime() + 86_400_000 / DAILY_REEL_LIMIT);
  }
  return planned;
}

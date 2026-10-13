import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { movieAssets, movieClips, movieJobs, movieApprovals, moviePublications } from "../src/db/movie-schema";

test("movie schema defaults to unverified rights and unreviewed clips", () => {
  assert.equal(movieAssets.rightsStatus.default,"pending");
  assert.equal(movieAssets.facebookAllowed.default,false);
  assert.equal(movieAssets.excerptsAllowed.default,false);
  assert.equal(movieClips.subtitleReviewed.default,false);
  assert.equal(movieClips.durationMs.default,30000);
});
test("jobs, approvals and publications retain identity and lease fields", () => {
  assert.ok(movieJobs.leaseToken);
  assert.ok(movieJobs.leaseExpiresAt);
  assert.ok(movieApprovals.revision.notNull);
  assert.ok(movieApprovals.reviewerId.notNull);
  assert.ok(moviePublications.clipId.isUnique);
  assert.ok(moviePublications.pageId.notNull);
  assert.ok(moviePublications.remoteReelId);
  assert.ok(moviePublications.remotePermalink);
  assert.ok(getTableConfig(moviePublications).checks.some(c=>c.name==="movie_publications_status_check"));
});

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolveMediaUrl } from "../src/services/media-url";

test("retired campaign image links use the live domain and preserve index/version", () => {
  for (let index = 1; index <= 180; index++) {
    assert.equal(resolveMediaUrl(`https://social-publisher-gamma.vercel.app/api/campaign-image/${index}?v=v4`), `https://sp.leanpix.site/api/campaign-image/${index}?v=v4`);
  }
});
test("news images are repaired without rewriting unrelated or unsafe URLs", () => {
  assert.equal(resolveMediaUrl("https://social-publisher-gamma.vercel.app/api/tech-news-image/abc-123"), "https://sp.leanpix.site/api/tech-news-image/abc-123");
  for (const value of ["", "not a url", "https://example.com/api/campaign-image/98", "https://social-publisher-gamma.vercel.app/video.mp4", "https://social-publisher-gamma.vercel.app.evil.test/api/campaign-image/98", "https://user:secret@social-publisher-gamma.vercel.app/api/campaign-image/98", "http://social-publisher-gamma.vercel.app/api/campaign-image/98"]) assert.equal(resolveMediaUrl(value), value);
});

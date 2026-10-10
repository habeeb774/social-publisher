import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hourly news checks the existing claim before fetching feeds and retains atomic claiming", async () => {
  const source = await readFile("src/services/tech-news.ts", "utf8");
  assert.ok(source.indexOf("if (existingClaim)") < source.indexOf("await Promise.all(FEEDS.map(readFeed))"));
  assert.match(source, /insert\(settings\)[\s\S]*onConflictDoNothing\(\)/);
});

test("inbox background polling is bounded to once per minute and skips hidden tabs", async () => {
  for (const path of ["src/app/inbox/inbox-client.tsx", "src/app/inbox/unified-inbox-client.tsx", "src/app/inbox/messages/messages-client.tsx"]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /setInterval\([\s\S]*?!document.hidden[\s\S]*?60000\)/);
    assert.doesNotMatch(source, /}, 15000\)/);
  }
});

test("news image responses retain a full day CDN cache", async () => {
  const source = await readFile("src/services/tech-news-card.tsx", "utf8");
  assert.match(source, /s-maxage=86400, stale-while-revalidate=604800/);
});

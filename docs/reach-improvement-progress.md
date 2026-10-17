# Reach improvement and shared discovery

User target: every post reaches at least 1,000 real views within 24 hours
(confirmed by the user). This target is NOT
achieved or guaranteed. Never substitute fake engagement, fabricated analytics,
paid promotion without approval, or a small passing test for the real outcome.

Baseline inspected 2026-10-17 Asia/Riyadh: the latest 15 ordinary posts returned
zero post_media_view; an older Rasdooq post returned one view and one unique
viewer. Repeated identical news appeared on the same Page in consecutive hours.

Implemented in this iteration:

- Correct the former-politics destination's mismatched seen-record namespace;
  retain checks against legacy shared records to prevent replay of old stories.
- Page-scoped canonical URL and normalized title claims are durable unique keys.
  Claims, post, attachment and seen record are written in one SQL statement.
  Retries and conflicting workers cannot recreate the same article/headline.
- Batch seen-key reads rather than running one database query for every article.
- Automated Arabic Pages accept Arabic headlines only; English remains available
  in discovery for human review, not silently passed off as Arabic. A translator
  is still required for automatic foreign-source coverage.
- Habeeb's ordinary technology feed now requires AI, automation, work-tool,
  software or security relevance, rather than brand-name-only general news.
- Remove repetitive generic hooks and unrelated automation hashtags; retain
  source attribution without inventing benefits or unsupported facts.
- One request-scoped public-news fetch cycle serves technology, AI, Elon and
  politics workers. Each distinct URL is fetched at most once within that cycle,
  including failures. Both technology destinations also share parsed results.
  Discovery remains lazy and respects existing per-feature schedules and leases.
- Shared fetches refuse credentials/writes, redirects and oversized source bodies.
  Publication credentials, quotas, permissions and destinations are NOT shared.
- Analytics shows a 1,000-view/24-hour target for its explicitly bounded sample.
  Timely milestones reuse existing Graph reads and are recorded once under
  `reach_24h:<post UUID>` in settings. Late lifetime totals are marked as timing
  unknown without matching earlier evidence. Missing data is not a failed target.
  Sampling occurs on analytics visits, not a background first-day census.

Still needed before claiming the reach target:

- Observe and compare real post-level views after content changes have run.
- Investigate Meta account/Page distribution eligibility if low reach persists;
  no restriction has been verified so far.
- Address duplicate/low-quality content already queued if any, without deleting
  published content or silently changing unrelated campaigns.
- Configure an approved Arabic translation service for foreign sources, if wanted.
- Broaden measurement beyond the latest-post sample, with explicit sample coverage
  and unavailable metrics distinguished from actual zero.

Tests cover request coalescing across the actual readers, cycle-local retries,
bounded bodies, editorial eligibility, URL/title dedup, durable restart behavior,
and rollback on attachment failure. They do not prove organic reach of 1,000.

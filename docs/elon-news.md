# أخبار إيلون ماسك

## Scope and deployment

`/elon-news` and `/api/elon-news` are administrator-only. Both monitoring and automatic public publishing default to **off**. No Facebook Page is selected by default. Apply `drizzle/0025_elon_news.sql` with the existing migration process before opening the section. The Drizzle definitions are in `src/db/elon-news-schema.ts`. No runtime request applies migrations.

The project was inspected on **2026-10-15**: Vercel team `team_drYIlw4Nxktcnm5pIUUHiUW4`, project `social-publisher`, plan **Hobby**. The repository already delegates recurring execution to cron-job.org and keeps GitHub Actions as a manual diagnostic. This feature reuses `/api/cron/publish`, with its existing bearer authentication and general system/automation controls. **No minute-level Vercel cron has been added.** Actual execution is subject to scheduler delivery, serverless duration and account usage limits. The configurable polling interval is a minimum; a 10-minute external tick cannot provide minute-precise delivery.

Official cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby: daily Vercel cron only). If that plan or scheduler changes, verify the live account before changing schedules. Do not add a second scheduler calling the same tick unnecessarily.

## Administrator configuration

Select an active Facebook Page, approve source outlets, choose a polling interval (10–1440 minutes), daily maximum (1–30), and minimum publication interval (10–1440 minutes), then save. Enabling publishing validates the selected Page's own encrypted OAuth token. Runtime revalidates the active administrator owner, Page, policy revision, general switches, required token scopes and target binding immediately before sending.

Source management deliberately selects from fixed HTTPS RSS endpoints (AITNews, Ars Technica, TechCrunch, The Verge). Arbitrary URL fetching is not exposed to administrators or feed content. Adding a new outlet requires a reviewed change to the source catalogue, including its article host and editorial-independence group. No scraping behind logins or paywalls. Fetches reject redirects, time out, and cap bodies at 1 MiB.

## Discovery, evidence and Arabic generation

Only titles explicitly mentioning Elon Musk/إيلون ماسك, dated within 48 hours, enter discovery. Feed headlines/excerpts, canonical source URL, retrieval time and SHA-256 are retained. Speculative language, potential duplicates, or insufficient evidence stay pending, not automatically published.

The deliberately conservative automatic verification policy requires **matching normalized headlines from at least two approved independence groups**. It is **source corroboration, not proof of truth or a claim that a human fact-checker reviewed the story**. Syndication and misleading reporting remain editorial risks; an administrator must review ambiguous/conflicting cases. This is not a general-purpose misinformation detector. Most differently worded/cross-language reports will require manual verification rather than guessing a match.

Arabic headlines are retained without embellishment. Non-Arabic headlines use the application's existing optional Anthropic writing provider; no new AI account/key is provisioned. With no configured translator, the item stays pending for a human Arabic draft. Generated text is checked for Arabic predominance, new numeric claims, unexpected links and markup; those checks **cannot guarantee translation or factual accuracy**. All posts carry approved source links. The provider never decides verification, permissions or publishing. No article instructions can change administrator settings.

An administrator may mark a verified item as breaking. Breaking items lead the queue but **never bypass quotas, spacing, permissions or verification**. Search, source/status filters, sorting and 20-item pagination cover the news list; article details show evidence, draft, review notes, attempts, Facebook ID and activity. UI labels are RTL Arabic and use the existing application tokens. Activity lists are bounded (30 recent global events, 100 per article).

## Idempotency and recovery

- Canonical URLs strip tracking identifiers. Globally unique normalized headline fingerprints prevent rediscovery of the same title; **one publication per story**, even if the destination changes. Near-duplicate headlines and Arabic translations are held for a human to establish that they represent distinct events. Semantic matching is heuristic and cannot mathematically identify every paraphrase of a real-world story.
- A persistent, expiring, fenced database lease serializes scheduler runs and editorial reviews. Every send checks the current lease, policy revision, active owner, active Page and immutable verification state.
- The `publishing` marker and quota reservation are committed **before** contacting Meta. Both daily quota (database time, `Asia/Riyadh`) and minimum spacing count possible sends, including unknown outcomes. Quotas are conservative, not an entitlement to fill all slots.
- There is no reliable generic idempotency key for a Page feed POST. Exactly-once external delivery cannot be promised across arbitrary network crashes. A timeout, malformed/missing ID, 5xx, or crash after the durable marker becomes **uncertain**, and is **never automatically re-posted**. This prioritizes avoiding duplicates over guaranteed eventual delivery.
- Definitive rate-limit rejections and failures before sending use persistent exponential backoff (60s, 120s, 240s, …, capped at 6h), honor bounded `Retry-After`, and stop after five attempts. Permissions/auth failures fail closed; after reconnection an administrator may retry a definitively failed job only. Unknown outcomes cannot use that action.
- To recover an unknown result, inspect Facebook, supply the existing `pageId_postId`, and reconcile. The server rechecks Page permissions, verifies that ID belongs to the selected Page and that Meta's message exactly matches the stored draft, then records the ID/timestamp. If no matching post is proven, the unknown record stays quarantined. Never simply clear its status or reset attempts.
- Publication errors expose stable, allowlisted codes, not token-bearing exception messages or raw Graph bodies. Tokens are decrypted only on the server. Graph writes use an Authorization header. The documented debug-token read requires `input_token` server-side; it uses a bounded native HTTPS read outside Next's fetch URL instrumentation and must never be added to request-URL telemetry.

## Verification

`npx tsx --test tests/elon-news.test.ts` exercises canonicalization, Arabic validation, token scopes/expiry/Page identity, Graph outcome classification, database leases, restart fencing, quota and pause gates in PGlite. No real Facebook publishing is used.

`scripts/test-elon-news-branch.ts` refuses any database except the dedicated expiring test branch host. It applies the tracked migration there, seeds explicitly synthetic news and a non-production login, and exercises the real API handlers (anonymous denial, cross-origin denial, detail loading, 20+3 pagination and manual verification). It then runs the complete discovery → corroboration → Arabic → queue → permission boundary → publish → returned-ID path against real Postgres with injected **synthetic feed and Meta edges**, invokes the scheduler again, and asserts one simulated publication, no duplicate sends and **zero live publications**. It leaves monitoring/publishing disabled. Pass a temporary `DATABASE_URL`, `AUTH_SECRET` and `ELON_QA_PASSWORD` in process environment; do not overwrite local environment files or point this fixture at production. The temporary branch expires on **2026-10-16 23:00 UTC**.

Recorded QA on 2026-10-15: TypeScript and scoped ESLint pass; the new six test groups pass; the isolated migration/API/full-pipeline test passes; desktop and 390×844 browser checks confirm list search, evidence details, review-note validation and persisted rejection. The complete repository suite reports 344 passed, 15 skipped and one pre-existing movie-pipeline assertion failure: it expects `FOR UPDATE OF j SKIP LOCKED`, while committed `HEAD` already uses `FOR UPDATE OF j,m SKIP LOCKED`. Neither that worker nor its test was changed by this feature.

Production rollout still requires the additive migration, deployment, an administrator's selected destination/source approvals and a valid Page token. The QA fixture, account, sources and consent must never be copied into production.

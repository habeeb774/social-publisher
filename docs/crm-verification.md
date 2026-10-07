# CRM verification

## Evidence from the 2026-10-07 implementation batch

- Full test suite against an explicitly designated schema-only Neon QA branch: 122 passed, 0 failed, 0 skipped.
- TypeScript, targeted ESLint, whitespace checks and production build passed.
- Actual HTTP checks against the built Next.js application and the same isolated database passed (`scripts/verify-crm-http.ts`).
- Concurrent manual creation returned 201 and 200 for the same request UUID, with one lead and one creation audit.
- Overlapping reminder SQL executions inserted one notification and marked the reminder once.
- Page scope, inactive recipient, stale due time and closed-stage checks prevented reminder delivery without consuming it.
- Existing queue, approvals, recurrence, library and trash database tests ran successfully. These do not constitute real Meta publishing verification.

## Manual creation flow

## Scoped discovery security verification

- Full isolated database suite: 125 passed, 0 failed, 0 skipped; the updated UUID comparison unit tests also passed after the schema correction.
- Production build passed after that correction. Actual local HTTP checks passed for search, dashboard activity and system logs using a restricted editor account.
- Search retained accessible posts, pages, linked media and campaigns, while excluding outside-page fixtures. Restricted accounts cannot search unscoped templates or system audit records.
- Dashboard activity is filtered before pagination and includes only accessible post/lead entities for non-administrators. Missing entity IDs do not disclose orphan activity.
- System logs require the current database administrator role. This does not establish complete workspace isolation across other routes or verify production browser interactions.

## Manual creation flow

`/leads` → `/leads/new` → `POST /api/leads` → scoped insert → `/leads/:id`.

- `leads.create` is enforced by both the page and the API using current database roles.
- A currently active, accessible page is required. No page-less record is created.
- Only name, contact, stage and notes are accepted; source is always `manual`.
- Request UUID is retained for retries within the form. Changed data under an already-used UUID returns a conflict rather than overwriting the existing lead.
- Reopening the form starts a new creation request; this is not fuzzy duplicate detection by name/contact.
- Creation does not send a Messenger message, schedule follow-up or dispatch email/push.
- Creation audit metadata contains the source, not contact data or notes.
- Page choices are bounded to 200; larger sets offer name search before entering customer data.

## Safe test execution

Use a temporary **schema-only** branch with the production schema, not production data. Set an expiration when creating it. Do not overwrite application `.env` files.

Inject `TEST_DATABASE_URL` and the explicitly approved branch's hostname as `DISPOSABLE_TEST_DATABASE_HOST` into the test process. Keep credentials out of logs, commands, Git and exported reports. The test guard rejects missing/mismatched hostnames and a supplied production URL with the same pooled/direct compute hostname.

With those variables injected:

```text
npx tsx scripts/seed-disposable-tests.ts
npx tsx --test --test-concurrency=1 tests/**/*.test.ts
npm run build
npx tsx scripts/verify-crm-http.ts
```

The seed contains a synthetic active page and draft. Tests intentionally mutate shared tables, so run the database suites sequentially and never target an application database. Test fixtures left in the ephemeral branch disappear with its expiration.

The HTTP script generates a temporary signing secret, starts a local server on `localhost:3217`, supplies only QA database/configuration and essential OS variables, and stops the server in `finally`. It exercises real authorization, API handlers and server rendering, without Meta, Blob, Resend or push credentials. Next's local request origin is `localhost`; the test uses that same origin instead of weakening the application's origin check.

## Remaining verification boundaries

- Browser interaction, visual mobile/RTL layout, actual form submission by browser and client navigation have not been verified by these HTTP checks.
- Production browser behavior must be verified separately when browser access is available.
- Actual Meta events/publishing and real push delivery require separate provider/account verification.
- The full CRM scope still includes unfinished functionality such as tags, bulk actions and source/conversion analytics; this batch does not declare CRM or the overall product complete.

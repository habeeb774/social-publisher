# Lead bulk stage changes

The existing lead list now supports selecting up to its 50 visible rows, selecting/deselecting the current page, choosing any of the seven stages and confirming a bulk stage change. Pagination and filters stay server-side. The selection component resets on filter/cursor navigation and has loading/disabled, success, safe error and reload states. Uncertain network outcomes require a reload rather than a blind retry. It does not delete leads or trigger Messenger/email/push delivery. Existing read-only users have no selection or mutation controls.

`PATCH /api/leads/bulk` uses the current database role, `leads.edit`, same-origin write guard and strict Zod validation. It rejects empty/over-50 batches, case-insensitive duplicate UUIDs, invalid stage/version inputs and extra fields. No migration is required. Each selected row submits the exact six-digit database timestamp used by the existing list cursor, avoiding JavaScript date precision loss.

A parameterized SQL statement takes authorized row locks in stable UUID order. A shared decision gates the entire update on every requested row being accessible and every expected version matching. Mixed outside/missing or stale batches change nothing. Changes and per-lead `lead.updated` audits are in the same database statement; audits only contain actor, stage, field names and a bulk flag, never contact or notes. Audit failure therefore cannot leave unaudited committed updates.

## Evidence

- Three focused tests passed with zero skipped: validation, bound SQL/locking/gating structure, and an actual isolated database test for outside-page and stale all-or-none rejection, overlapping reversed-order batches, and one audit per changed row.
- The built Next application passed real loopback HTTP requests using synthetic scoped editor/viewer users on the schema-only QA branch. Checks covered no-session 401, viewer/cross-origin 403, duplicate-input 400, mixed outside-page 404 without partial writes, stale-input 409 without partial writes, concurrent requests producing exactly one 200 and one 409, two audit entries for two changes, stale retry rejection, and loss of permission after role downgrade with the old cookie.
- HTTP server rendering showed the bulk control to the editor and omitted it for the viewer. This is not an interactive browser test.
- TypeScript, targeted ESLint and production build passed.

Interactive checkbox/confirmation, RTL/mobile touch behavior and actual production-account operations remain unverified. Bulk assignment and tagging remain unfinished; this batch implements bulk stage changes, not the entire CRM or multi-workspace scope.

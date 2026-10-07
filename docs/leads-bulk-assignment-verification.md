# Bulk lead assignment verification

Implemented and verified with isolated database and actual local HTTP requests. Interactive browser and production-account verification remain pending.

- GET `/api/leads/bulk/assignment` accepts 1–50 unique selected lead IDs, validates scoped access to every row, and searches active admin/editor candidates in bounded cursor pages. Candidate eligibility is the intersection of all selected lead pages. No emails or authorization settings are returned.
- PATCH uses the separate `leads.assign` permission, same-origin guard, strict body validation and exact database versions. Explicit `assignedTo: null` clears assignment. A single statement checks every scoped row/version, rechecks the active member's role and raw authorization-setting snapshots, updates all rows or none, and writes corresponding audit events atomically.
- Account-based permissions require a currently active page with a matching remote ID; restricted members cannot receive a lead without a page. Null SQL eligibility is explicitly converted to false.
- UI supports search, cursor loading, explicit member/clear selection, confirmation, disabled/pending states, bounded requests, cancellation on selection changes/unmount, safe Arabic errors and mandatory reload after an uncertain write result. Selection is limited to the visible list page.

Fourteen focused tests passed without skips on the explicitly allowed schema-only Neon QA branch. Database tests verified inaccessible rows, recipient scope restrictions, leads with no page, stale versions, changed scope settings, inactive/read-only recipients, concurrent requests, clearing, stale retries and exactly one audit per successful changed row. TypeScript and targeted ESLint passed.

Actual requests to the built Next.js server passed: lookup and write authentication/permission gates, same-origin rejection, forged-field rejection, hidden lead rejection, recipient page eligibility, scope revocation after lookup, overlapping assignments, explicit clearing, stale retries and four atomic assignment audit entries. Lookup responses contain names and IDs, not email addresses or authorization settings. A stale editor cookie loses both lookup and write permission after a database role downgrade. The test server uses only a synthetic signing secret and the explicitly allowed QA database; no Meta, publishing, email or push calls run.

Production build passed, including the new assignment API route. TypeScript, targeted ESLint and diff whitespace checks passed. Pending: interactive browser/RTL/mobile checks and production-account operations. Deployment READY is a release gate, not proof of these user interactions. This does not claim the entire CRM, workspace isolation or production-account workflow is complete.

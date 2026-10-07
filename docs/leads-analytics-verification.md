# Lead source and conversion reporting

The `/leads/analytics` report aggregates existing leads without a schema migration. It uses the current database role, `leads.read`, and query-level page scope before grouping. Only aggregated counts are returned to the page.

Date filters support 7/30/90 calendar days and a custom inclusive range of at most 366 days. Boundaries use Riyadh midnight and an exclusive end instant. Counts describe the creation cohort's current statuses, not historical closing events. Conversion is current won / cohort total; no cohort yields unavailable, not 0%.

Three focused tests passed for calendar boundaries and invalid ranges, bound SQL scope and private-field exclusion, and conversion/no-data behavior. Production build and targeted ESLint passed. Isolated database/HTTP checks confirmed an outside-page won lead does not inflate scoped counts, empty scope yields no cohort, report server rendering succeeds, and invalid dates show an Arabic validation state.

Page/platform selectors now intersect the existing authorization scope. Page choices are bounded to 200, with a literal name search for larger sets; period shortcuts and retry links preserve selected filters. Invalid platform/page identifiers are rejected before report queries.

Five focused tests passed after adding filters. Updated isolated SQL/HTTP checks confirmed Facebook totals, exclusion under Instagram, zero rows for an inaccessible selected page, a safe permission state in the rendered report, and absence of hidden page names in choices. Build and targeted ESLint passed.

## Aggregate CSV export

`/api/leads/analytics/export` uses the existing server-side `data.export` guard (currently admin only), current-role authorization, and the same scoped aggregate SQL and Riyadh date/platform/page filters as the report. The download control is only shown to roles with that permission. An inaccessible selected page is rejected before metrics are queried. Arabic CSV contains totals and source counts, current cohort conversion and its definition; names, contact details and notes are never serialized. Empty cohorts export zero counts and explicitly unavailable conversion. Existing UTF-8 BOM, CSV escaping, formula protection and no-store response are reused. Successful generation records a safe export audit entry. No migration is needed.

Fourteen focused tests passed (five report, six export handler and three download transport tests), covering authorization short-circuit, invalid input before database access, page-scope rejection, range/filter forwarding, private-field exclusion, empty cohort, safe retryable database errors, cancellation, safe filenames and rejection of error/login HTML instead of saving it as CSV. TypeScript, targeted ESLint and production build passed.

Isolated HTTP checks use a synthetic database admin and actual signed sessions against the built Next server. They verify 401 without login, 403 for editor/viewer, role-based server rendering of the export control, exact selected-page Facebook totals, no-data Instagram conversion, UTF-8 BOM bytes and CSV download/no-store headers, private-field exclusion, safe audit metadata, invalid-filter 400 responses, and loss of export access and control after downgrading the admin while its old cookie remains valid. Existing CRM/search/dashboard HTTP checks still pass. These are HTTP/SSR checks, not interactive browser verification.

The download is initiated by a client button with loading/disabled, Arabic error/retry and download-started states. Requests have a bounded timeout and abort on unmount; filter changes remount the button. No automatic download or external provider call is made. Browser save-dialog, interaction/mobile behavior and production account checks remain unverified.

Browser/mobile layout, production account behavior, historical conversion trends, charts and PDF exports remain unverified or unfinished. This batch does not claim the entire Analytics or CRM scope complete.

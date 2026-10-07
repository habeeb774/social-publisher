# Lead source and conversion reporting

The `/leads/analytics` report aggregates existing leads without a schema migration. It uses the current database role, `leads.read`, and query-level page scope before grouping. Only aggregated counts are returned to the page.

Date filters support 7/30/90 calendar days and a custom inclusive range of at most 366 days. Boundaries use Riyadh midnight and an exclusive end instant. Counts describe the creation cohort's current statuses, not historical closing events. Conversion is current won / cohort total; no cohort yields unavailable, not 0%.

Three focused tests passed for calendar boundaries and invalid ranges, bound SQL scope and private-field exclusion, and conversion/no-data behavior. Production build and targeted ESLint passed. Isolated database/HTTP checks confirmed an outside-page won lead does not inflate scoped counts, empty scope yields no cohort, report server rendering succeeds, and invalid dates show an Arabic validation state.

Browser/mobile layout, production account behavior, page/platform selectors, historical conversion trends, charts and report exports remain unverified or unfinished. This batch does not claim the entire Analytics or CRM scope complete.

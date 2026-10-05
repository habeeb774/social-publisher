# Facebook Comments Inbox — implementation and capability evidence

Verified 2026-10-05 using Windsor MCP, connector `facebook_organic` (not Ads).
Connected page: `1330947143441946`.
`list_actions` returned only `create_post` and `create_photo_post`. No reply/hide/unhide/delete actions are mapped or guessed.
`get_fields` exposed comment ID, text, timestamp, parent ID, hidden flag and post ID. No comment author ID/name/avatar or comment permalink fields were exposed. Parent IDs permit representing replies in read data; completeness of nested replies is not proven by an empty result.
Read-only `get_data` for 2026-10-04 through 2026-10-05 completed with zero rows. Do not interpret that as no historical comments or proof of a populated conversation.
Webhook and polling rate limits are unverified. `/api/cron/comments-sync` authenticates with CRON_SECRET and returns a precise blocked state; it is NOT scheduled. Explicit manual reads are available to the authenticated admin.

## Implemented

- Additive transactional migration with a separate version/hash ledger; production publishing tables unchanged.
- Inbox, internal status/bulk status, notes, assignments, tags, drafts and approval without sending.
- Reply template create/update/disable and rule create/enable/disable.
- Rule classification, OR matching, priority, stop-after-match, delay metadata, Riyadh business hours, sensitive review and conservative unknown-author exclusion.
- Unique remote comments; a partial unique index reserves at most one automated draft per comment.
- Independent flags default false. Unsupported write methods fail closed regardless of flags. No direct Graph API fallback in this module.
- Real DB-backed analytics, notifications for new/sensitive comments and audit records.
- Admin/Editor/Viewer authorization with DB-validated, revocable team sessions; team accounts are scoped to comments, not publishing administration. Same-origin mutation checks, Zod validation and DB-backed request rate limits.
- Private saved views, date/page/post/assignment/tag/reply-type/rule filters and microsecond-safe cursor pagination.
- Full rule editing with page/post/campaign/author conditions, exclusions and configurable Riyadh business hours.
- DB-backed keyword/post/rule analytics, author history when an actual author ID exists, searchable quick replies and per-user notification read markers.
- Optional AI provider interface fails closed until an actual provider is configured. Comments onboarding and dedicated team-management/login pages.

## Additive team migrations

Run `node scripts/migrate-comment-team.mjs` with DATABASE_URL scoped to the intended branch. Drizzle uses a separate `comment_team_migrations` ledger; migrations add team credentials, notification read markers and query indexes without modifying publishing tables.

Validation includes role matrix, revocation, private views, draft/approval attribution and cursor pagination across 52 comments with identical microsecond timestamps. Synthetic fixtures are confined to an isolated Neon test branch and removed after tests.

## Still required before full acceptance

- Windsor-supported reply/hide mappings and credentials; actual populated read/reply-thread verification.
- Known polling limits and persistent pending-job continuation before enabling a sync scheduler. Manual pending reads return COMMENTS_READ_PENDING, not a successful empty sync.
- Actual AI suggestions, optional email alerts and future @mentions are not enabled. Bulk tagging/assignment is supported by the internal API; the current bulk toolbar exposes status changes only.
- Pending approvals and delay values are persisted, but there is no live reply dispatcher. Automation always creates pending drafts, even if approval is unchecked: conservative safety override.
- No real reply, hiding or deletion was executed. UI send button stays disabled.

Set production flags independently to false:
`COMMENT_AUTOMATION_ENABLED=false`, `FACEBOOK_COMMENT_REPLIES_ENABLED=false`, `AUTO_COMMENT_REPLIES_ENABLED=false`.
Do not change PUBLISHING_ENABLED as part of this module.

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
- Admin-only authenticated APIs, same-origin mutation checks, Zod validation, DB-backed request rate limits.

## Still required before full acceptance

- Windsor-supported reply/hide mappings and credentials; actual populated read/reply-thread verification.
- Known polling limits and persistent pending-job continuation before enabling a sync scheduler. Manual pending reads return COMMENTS_READ_PENDING, not a successful empty sync.
- Existing app authenticates one admin; Editor/Viewer identities and scoped authorization are not implemented here. Do not claim multi-role support.
- Rich saved views/filter builder, author history, template search, AI assistance, full rule editing/page/campaign targeting and analytics by keyword/post remain follow-up scope.
- Pending approvals and delay values are persisted, but there is no live reply dispatcher. Automation always creates pending drafts, even if approval is unchecked: conservative safety override.
- No real reply, hiding or deletion was executed. UI send button stays disabled.

Set production flags independently to false:
`COMMENT_AUTOMATION_ENABLED=false`, `FACEBOOK_COMMENT_REPLIES_ENABLED=false`, `AUTO_COMMENT_REPLIES_ENABLED=false`.
Do not change PUBLISHING_ENABLED as part of this module.

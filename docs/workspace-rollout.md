# Workspace isolation rollout

## Current boundary

The existing product remains single-workspace. Do not expose creation, invitation,
switching or multi-client onboarding until all paths below enforce tenant scope.
Global `admin` and the bootstrap `env-admin` are not workspace memberships.

Migration `0017_workspace_foundation.sql` adds only workspaces, memberships and
exclusive page ownership. It does not move existing production data. The foundation
queries recheck active workspace, membership and user in SQL; an empty page scope
must never be converted into unrestricted (`null`) scope.

Seven workspace roles are separate from the legacy four global session roles.
Do not widen existing session roles as a substitute for database membership.
Editor authoring does not grant publishing; Support replies do not grant publishing
or team management. Workspace permissions still require route-level enforcement.

## Remaining activation gates

1. Record a default workspace and explicitly authorized memberships for existing
   users. Resolve the bootstrap administrator identity without automatically
   granting every global administrator access to every workspace.
2. Resolve selected workspace on the server from the authenticated user and current
   membership. Never trust a browser-selected ID or cookie role as authorization.
3. Scope page-owned posts, comments, conversations and leads at SQL level. Enforce
   the same boundary for detail IDs, writes, assignment targets, bulk actions,
   exports, search, analytics, notifications and audits. Leads without pages need
   explicit tenant ownership, not an implicit unrestricted fallback.
4. Add tenant ownership to campaigns, media, templates, rules, queue slots, saved
   views, Brand Kit and settings. Prevent cross-tenant foreign-key/reference writes.
5. Scope Meta OAuth discovery and reconnect, webhook ingestion, scheduler jobs,
   retries, automation and notification delivery. Background workers must not rely
   on a browser's selected workspace.
6. Add audited membership management with last-owner protection, workspace
   switching, Arabic empty/permission/error states and mobile verification.
7. Test two complete synthetic customers against real SQL and HTTP routes, including
   guessed IDs, changed memberships, concurrent writes and cross-tenant references.
   Verify production migration, deployment and real UI before enabling onboarding.

## Verified foundation tests

`workspace-access.test.ts` checks role separation and invalid identifiers.
`workspace-database.test.ts` uses an explicitly disposable database, applies the
additive migration there, and verifies SQL membership/page isolation, immediate
revocation and database ownership constraints including overlapping page claims.
These tests do not prove isolation of the legacy API routes or production data.

## Server access check

`GET /api/workspaces/[id]/access` uses the existing signed session and current
database user, then the SQL membership query. It returns only the authorized
workspace ID, current tenant role and permission names. Caller role headers have
no authority. Anonymous requests get 401; invalid IDs get 400; unavailable
membership gets 403. Lookup outages/malformed database results get a safe 503,
never global access. Every response is private and uncached.

`authorizeWorkspace` is the shared request-scoped guard for the subsequent rollout.
It does not yet change legacy routes and is not a replacement for SQL membership
checks inside writes. The real-database test also covers signed sessions, forged
cookies, a global administrator without membership and role downgrades.
Production still needs migration 0017 and explicit bootstrap membership before
real workspace access is available. No multi-client UI is enabled by this endpoint.

## Posts list transition

The existing `GET /api/posts?workspace=<uuid>` now uses current workspace
membership and returns `{items,nextCursor}`. The workspace path checks active
membership again inside the posts query, joins exclusive page ownership before
pagination, excludes deleted posts, and never returns raw provider failures.
Page size is 1–100 (default 50); the shared cursor format preserves microseconds
and the UUID ordering tie-breaker. Requests and responses are validated.

Legacy unscoped requests retain their current behavior while migration remains
incomplete. `WORKSPACE_ISOLATION_ENABLED=true` makes a workspace mandatory for
this GET route and removes its legacy fallback. Do not enable the cutover flag
until clients, POST/detail/write routes and all remaining activation gates are
ready. The flag is not a system-wide isolation switch yet.

Real-database tests exercise the existing GET route with signed sessions, missing
workspace under cutover, unauthorized tenants, and SQL paging with newer foreign
posts, equal timestamps, microseconds and membership revocation before the read.
No browser rendering or production multi-customer readiness is implied.

The existing PATCH post route also accepts the transition workspace parameter.
It adds `posts.edit` membership checks to the initial read and to the final
compare-and-update SQL. Legacy global permissions and page scopes still apply
as additional restrictions; this is not the final workspace-only authorization
model. Non-null campaign attachments are rejected until campaign ownership is
migrated. Other post mutations, media writes, scheduling settings, alerts and
audit visibility still require the full workspace migration. Do not enable
multi-customer access based on this route alone.

POST `/api/posts?workspace=<uuid>` now additionally checks `posts.create` and
uses an INSERT SELECT joined to current active membership and exclusive page
ownership. Scheduling requires both author and publisher permission inside the
INSERT, including when the legacy approval setting changes scheduled status to
pending approval. The authenticated database user is stored as creator.
Non-null campaign references remain rejected. The cutover flag makes workspace
mandatory on this POST route as well, but must still remain disabled until every
activation gate is complete. Real SQL and signed-session route tests cover own
and foreign pages, role downgrades, inactive memberships and unauthorized
scheduling. Media registration, alerts and settings are still legacy boundaries;
this change does not enable multi-client onboarding or prove browser QA.

Reschedule and publish-now transition routes now require workspace permissions
and recheck active membership/page ownership in the final SQL update. Publishing
is separate from editing: publish-now allows Publisher, while editing a schedule
requires both edit and publish permissions. Both updates compare the previously
read version so a concurrent save cannot be overwritten. Reschedule versions are
recorded only after a successful write. Workspace-aware conflict counts and
duplicate checks apply to these paths and scoped composer writes; global settings,
scheduler operational health and remaining mutation routes are not migrated yet.

Retry now checks `posts.publish` and compares the previously read version in the
final update. Unknown publishing outcomes still require explicit confirmation.
The duplicate transition path requires both read and create permissions in SQL;
one statement creates a fresh draft and copies its attached media atomically.
Creator attribution uses the authenticated workspace user. Provider identifiers,
scheduled times, publishing state and queue membership do not carry over.
Campaign-linked sources are rejected with 422 until campaign ownership is migrated;
legacy duplication remains unchanged. The response read rechecks current ownership.
Real disposable-database tests verify attached media, foreign-source rejection,
missing creation permission and membership revocation inside the copy statement.
These transition routes do not enable multi-client UI, migrate production data,
scope shared media-library ownership, or verify browser/real Meta publishing.

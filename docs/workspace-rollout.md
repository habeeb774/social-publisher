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

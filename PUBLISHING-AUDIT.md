# Publishing readiness audit

Production: https://social-publisher-gamma.vercel.app

## Verified

- GitHub repository CRON_SECRET synchronized with Vercel using a random secret and GitHub sealed-box encryption; no secret recorded here.
- Dedicated production AUTH_SECRET configured and deployed.
- Production rejects the old forged `sp_admin=authenticated` cookie (HTTP 401).
- Server-side Windsor MCP machine authentication succeeds.
- Facebook Organic account/page 1330947143441946 available; create_post and create_photo_post discovered.
- Production Safe Mode test reached MCP without invoking execute_action.
- Two simultaneous worker requests processed test post cf5f4da2-7311-48fc-a795-900ee5a2dc30 exactly once; Neon records one DRY_RUN_SUCCESS and draft state.

## Blocking evidence

GitHub Actions run https://github.com/habeeb774/social-publisher/actions/runs/37238856822 completed with failure before executing any steps.

GitHub check annotation: account locked due to a billing issue. This is not a CRON_SECRET or application HTTP failure.

PUBLISHING_ENABLED was explicitly activated by the user and verified true in production. No real test post has been scheduled in this audit; schedule the ten-minute test relative to a verified scheduler activation time.

Another session restored a once-per-minute Vercel Cron in commit 962ff5a. Vercel rejected deployment on the Hobby plan. That change has been preserved pending scheduler coordination. Later local changes must not be described as deployed until a deployment succeeds.

Production verification now covers actual dashboard/calendar/log views, saved draft content, successful editing, concurrent-edit conflict rejection, login protection for logs, and required future scheduling dates. The full system is still not verified ready.

## Remaining gates

- Resolve GitHub account billing lock (requires account owner).
- Successful manual Workflow and subsequent scheduled Workflow invocation, verified in scheduler_runs.
- After scheduler verification, schedule exactly one “مرحبا” post ten minutes ahead under the user's authorization.
- Verify actual Facebook post ID/permalink and no duplicate subsequent publication.
- Complete full-project audit, including storage, imports, recovery and real Facebook write results. This report does not claim full readiness.

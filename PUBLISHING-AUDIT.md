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

PUBLISHING_ENABLED remains false. No real test scheduled; the requested ten-minute test must be scheduled relative to a new verified activation time after resolving GitHub Actions access.

## Remaining gates

- Resolve GitHub account billing lock (requires account owner).
- Successful manual Workflow and subsequent scheduled Workflow invocation, verified in scheduler_runs.
- Activate production publishing only after scheduler verification, then schedule exactly one “مرحبا” post ten minutes ahead under the user's authorization.
- Verify actual Facebook post ID/permalink and no duplicate subsequent publication.
- Complete full-project audit: dashboard, calendar, details, logs and other routes still need evidence-backed end-to-end verification. This report does not claim full readiness.

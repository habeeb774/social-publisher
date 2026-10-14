# Fixed licensed-film autopilot

The user-approved catalogue contains **only Big Buck Bunny and Tears of Steel**. No YouTube scraping, arbitrary URLs, DRM bypass, new subscription or extra cloud service is provisioned.

## Operation

Admin → `/movies` → licensed-film policy: pick the existing Facebook Page, the linked YouTube channel, and an explicit children-audience declaration. Approve the fixed two-film policy. Destination changes after registration are refused. Platform publishing switches remain independent.

The policy is recorded in the existing `settings` table (`movie_autopilot_policy`, unique catalogue mappings, per-asset state and per-film license snapshots). No schema migration is needed. An authorized active admin must continue to own the channel. Disabling/downgrading the owner or disconnecting the channel prevents progress.

1. Worker leases one registered import with a 30-minute lease and heartbeat. Fetching the official license fails closed on unavailable/changed evidence. Snapshot, SHA-256, source and CC BY 3.0 link are saved.
2. The worker downloads **exact** allowlisted HTTPS files from `download.blender.org`; no redirects, cookies or arbitrary user input. Enforce 800 MB limit, exact Content-Length, bounded archive extraction and 2 GB free working space. Extract to a fixed destination, then remux to private MP4.
3. Worker uploads via server-derived private multipart sessions. Completed media is verified before an idempotent process job is queued. Movie-source hash binds later render quality reports.
4. Existing private scene/highlight model selects scenes; at most five 30-second reels per film. Big Buck Bunny has no dialogue. Tears of Steel uses the official English SRT with locally generated Arabic translation; malformed translations stop for review. Model is the configured local Ollama instance, not a new external provider.
5. Worker validates 1080×1920 H.264 output, ~30s duration, Arabic cues and source-bound SHA-256. The app records **automated policy approval**, not a purported human examination. It never approves unrelated movies. Manual edits/rejections or rights changes stop automatic progress for that item.
6. Existing per-page/channel locked reservation functions schedule up to five per Riyadh day. Both platforms have separate statuses, right revisions and quotas. YouTube uses public visibility, the user's children-audience choice, and synthetic-media false (ordinary animation/VFX is not represented as real-world footage).

Attribution is mandatory for these assets at lease time and immediately before YouTube media transmission. No reuse of Blender/sponsor logos or promotion as an original film is authorized. Film excerpts retain the credit required by the producer and disclose cropping/translations. Full-film reposting is not part of this policy.

## Boundaries

- The catalogue runs once. Existing registration mappings prevent redownload/repost on re-enabling; no infinite reuse of the same two movies.
- Jobs run while the PC, Docker and local model are online. This does not promise cloud-only uptime.
- Failed imports become `blocked` and require operator review. Incomplete upload sessions remain recorded for inspection; no automatic destructive cleanup or blind external-send retry.
- Technical subtitle checks are not a guarantee of translation accuracy. The UI and audit notes identify automated review.
- Policy pause blocks new catalogue publishing. Existing platform switches control all movie reels. Already-started uploads cannot be withdrawn, and external videos are not deleted.

## Verification

`tests/movie-catalog.test.ts` checks catalogue/rights/quality guards. `workers/movie-reels/test_catalog_import.py` checks URL, download-size, ZIP and subtitle parsing guards. Existing SQL/YouTube publisher suites check review, quota and ambiguous outcomes. `scripts/test-movie-autopilot-branch.ts` refuses production and runs an end-to-end reservation test on the dedicated expiring Neon branch: 2 imports, 10 Facebook and 10 YouTube reservations, no live uploads, no duplicates and no >5/day.

Official sources: https://peach.blender.org/about/ , https://mango.blender.org/sharing/ , https://creativecommons.org/licenses/by/3.0/ .

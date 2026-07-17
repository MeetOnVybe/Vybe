# VYBE Phase 5 Matchmaking Root-Cause Fix — Build Report

## Scope

This update patches the existing Phase 5 Supabase/LiveKit implementation in place. It does not replace the UI or duplicate authentication, profiles, friends, matches, chat, moderation, notifications, themes, or video-session systems.

## Exact root cause

The Solo Match client already invoked `join_video_queue` once before beginning `get_video_queue_status` polling. The join request was easy to miss in DevTools because it occurred only once while the status RPC repeated.

The actual production blocker was the database repeat-prevention predicate. With the normal account default `repeat_prevention = true`, the pairing query rejected two users if *any* prior `video_sessions` row for that pair existed in the previous 12 hours. That included abandoned `connecting` sessions that never reached LiveKit and sessions later closed as `stale_timeout`.

For a two-account local test, one failed or interrupted attempt could therefore make the only eligible pair unavailable for 12 hours. Both users remained valid waiting queue members and continued receiving successful 200 responses from `get_video_queue_status`, but the eligibility query always rejected the other account and no new shared session was created.

The previous automated pairing test failed to catch this because it explicitly changed both test accounts to `repeat_prevention = false`, unlike real production accounts.

## Correction

Migration 9 changes repeat prevention so the 12-hour pair cooldown applies only to sessions where `video_sessions.connected_at IS NOT NULL`. That value is written only after both session participants successfully connect. Failed permission flows, abandoned token handoffs, unconnected previews, and stale `connecting` rows no longer count as completed encounters.

All original safeguards remain enforced:

- server-derived age-bracket isolation
- self-match prevention
- bilateral gender preferences
- bilateral coarse-location rules
- block checks in both directions
- account and video restrictions
- active-session uniqueness
- serialized session creation
- repeat prevention after a real connected call
- private queue/session Realtime authorization
- room-scoped LiveKit tokens

The client also gains an idempotent recovery path. If a stale queue cleanup returns `idle` or `cancelled` while the user is still actively searching, it retries the existing `join_video_queue` RPC with a strict three-attempt ceiling. It does not insert queue rows directly or bypass eligibility logic.

## Observability added

Structured lifecycle logs now cover:

- Start/queue-entry action
- `join_video_queue` request and result
- eligibility scan reason counts
- session creation
- both queue rows leaving `waiting`
- stale-session closure
- polling delivery
- Realtime delivery
- LiveKit token request and issuance
- queue departure

Database logs are stored in the RLS-protected `video_matchmaking_logs` table. Users can read only their own diagnostics; administrators retain existing moderation access. Logs never contain tokens, secrets, IP addresses, GPS coordinates, exact addresses, ZIP codes, schools, raw audio, or video frames.

## Files changed

Application/runtime:

- `.env.example`
- `src/components/video/LiveVideoMatch.tsx`
- `src/services/supabase/video.ts`
- `src/app/api/video/token/route.ts`

Database:

- `supabase/migrations/202607160009_hotfix_video_matchmaking_root_cause.sql` — new forward-only migration

Tests:

- `tests/integration/supabase-video-pairing.mjs`
- `tests/sql-security.test.mjs`

Documentation:

- `README.md`
- `SUPABASE_SETUP.md`
- `VYBE_PHASE_5_MATCHMAKING_ROOT_CAUSE_FIX_BUILD_REPORT.md`
- `VYBE_PHASE_5_MATCHMAKING_ROOT_CAUSE_FIX_TEST_REPORT.md`

## Build verification

Completed against the corrected source:

- `npm ci` — passed
- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm run test:security` — passed
- `npm run build` — passed
- `npm run build:demo` — passed
- `npm audit --omit=dev` — zero vulnerabilities

The optimized application builds in both normal Supabase mode and explicit development-only demo mode. No existing Phase 5 route or feature was removed.

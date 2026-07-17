# VYBE Phase 5 Matchmaking Hotfix — Build Report

## Scope

This release fixes real two-account Solo Match pairing and removes unintended demo-mode presentation from configured Supabase environments. It does not redesign the UI or replace any Phase 5 system.

## Root cause

The original `join_video_queue` RPC inserted the caller's queue row and immediately searched for another waiting row in the same transaction.

When User A and User B entered at nearly the same time, each transaction could search before the other user's queue insert committed. Both RPCs returned `waiting`, both rows later committed, and neither client reran the pairing transaction. Polling only read status, so the two users remained stranded in the queue.

## Database correction

Migration:

```text
supabase/migrations/202607160008_hotfix_video_matchmaking_pairing.sql
```

The migration adds `try_pair_video_queue(uuid)`, an internal `SECURITY DEFINER` helper that:

- Uses a transaction-scoped PostgreSQL advisory lock around only the short candidate-selection/session-creation section.
- Preserves age-bracket, gender, location, block, account-enforcement, restriction and repeat-prevention checks.
- Reuses an existing active session idempotently.
- Excludes stale queue rows and users already in an active session.
- Creates one normalized session and two participant records.
- Updates both users' queue rows to the same `matched` session.
- Creates the existing safety events and notifications once.

`join_video_queue`, `get_video_queue_status`, and `heartbeat_video_queue` now all use the same idempotent helper. This means polling or a heartbeat can recover pairing even if a Realtime event is delayed.

The stale-session cleanup also ends a never-connected `connecting` session after the recovery window so a crashed permission/setup attempt cannot block later two-browser testing indefinitely.

## Client correction

`LiveVideoMatch` now subscribes to the authenticated user's own `video_match_queue` row while matching. It retains deterministic polling as a fallback.

A shared `connectingSessionIdRef` prevents polling and Realtime from both starting the same LiveKit connection or requesting duplicate tokens.

## Token verification support

The existing `/api/video/token` route still uses cookie-based Next.js authentication in normal browsers. It now also accepts a verified Supabase bearer access token for deterministic integration testing and future trusted clients.

The route still:

- Uses only the Supabase publishable key for user-scoped access.
- Verifies the JWT with Supabase Auth.
- Calls `get_video_session_state` under that user's RLS identity.
- Issues a short-lived token for the one authorized LiveKit room.
- Never exposes the LiveKit secret or Supabase service-role key.

## Demo-mode correction

`getDataMode()` now selects Supabase automatically whenever both public Supabase browser variables are configured, unless demo mode is explicitly requested:

```dotenv
NEXT_PUBLIC_VYBE_DATA_MODE=demo
```

This prevents local Supabase installations from showing prefilled demo credentials simply because `NODE_ENV=development`.

## Build results

- Package version: `0.1.1`
- TypeScript: passed
- ESLint: passed
- Supabase production build: passed
- Explicit demo production build: passed
- Next.js routes compiled: 28 generated pages plus protected dynamic/API routes
- Dependency audit: zero vulnerabilities
- SQL/RLS contract: passed across 8 migrations and 38 RLS-protected tables

## Preserved functionality

No existing authentication, onboarding, profiles, friends, matches, discovery, search, chat, voice messages, Stories, groups, Storage, notifications, moderation, admin routes, RLS, light/dark themes, video safety, LiveKit controls or mobile behavior was removed.

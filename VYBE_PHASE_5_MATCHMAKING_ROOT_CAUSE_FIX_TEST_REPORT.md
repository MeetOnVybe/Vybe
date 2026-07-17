# VYBE Phase 5 Matchmaking Root-Cause Fix — Test Report

## Static database and authorization verification

`npm run test:security` passed across:

- 9 ordered Supabase migrations
- 39 RLS-protected public tables
- queue ownership policies
- private video-session membership policies
- Realtime topic authorization
- block and restriction enforcement
- age and preference eligibility helpers
- connected-session-only repeat prevention
- diagnostics ownership
- absence of any `DISABLE ROW LEVEL SECURITY` statement

## Deterministic two-user cloud test

File:

```text
tests/integration/supabase-video-pairing.mjs
```

The test no longer reuses potentially contaminated accounts and no longer disables repeat prevention. With server-only test credentials it:

1. Creates two temporary email-confirmed Auth users.
2. Creates same-bracket profiles through the normal database path.
3. Confirms both accounts have `repeat_prevention = true`.
4. Configures compatible gender and hidden-location preferences.
5. Subscribes to each user's private queue row before joining.
6. Calls `join_video_queue` concurrently for A and B.
7. Requires exactly one shared video session.
8. Requires both private Realtime subscriptions and polling to report the same session ID.
9. Requires both queue rows to leave `waiting` and become `matched`.
10. Requests both protected `/api/video/token` responses with each user's bearer session.
11. Cryptographically verifies both LiveKit JWTs, identities, room names, and room-join grants.
12. Rejoins concurrently and verifies both calls return the existing session rather than creating a second active session.
13. Confirms the database has exactly one active session for the pair.
14. Confirms matchmaking logs contain the shared `match_created` event.
15. Cleans up channels, sessions, and temporary Auth users.

Run it with:

```bash
npm run test:cloud:video-pairing
```

## Credential-dependent status

The cloud test was not executed from this build workspace because it did not have access to the target Supabase project, a server-only test service-role key, the deployed application URL, or LiveKit credentials. It exits with a clear skip when those values are absent; it does not simulate a passing cloud result.

Required server-only test variables:

```dotenv
TEST_APP_URL=http://localhost:3000
TEST_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
TEST_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Never expose the service-role key or LiveKit API secret through a `NEXT_PUBLIC_` variable.

## Manual two-browser acceptance test

- Apply migration 9 and restart Next.js.
- Use two verified accounts in different browser profiles.
- Confirm both accounts are in the same age bracket and have compatible gender/location preferences.
- Open Solo Match on both and press Start.
- Confirm each console contains `[VYBE video] queue join request` and `queue join result`.
- Confirm one shared session ID appears for both accounts through Realtime or polling.
- Confirm both enter the same LiveKit room.
- End the call, then immediately retry. The connected-call repeat rule should prevent an instant rematch when repeat prevention is enabled.

# VYBE Phase 5 — Supabase and Deployment Setup

This guide configures the existing Phase 5 platform: authentication, profiles, friends, discovery, matches, direct and group chat, voice messages, Stories, notifications, private Storage, moderation, administration, age-safe one-to-one video queueing, and Row Level Security.

Supabase remains the normal production data path. Explicit demo mode is for local UI development only.

## 1. Create a Supabase project

1. Create a project in Supabase.
2. Save the database password securely.
3. Open **Project Settings → API**.
4. Copy the Project URL and publishable key. Some existing projects may display an anon key instead.

The browser receives only the public URL and publishable/anon key. Never expose the service-role key in client code or a `NEXT_PUBLIC_` variable.

## 2. Configure authentication URLs

In **Authentication → URL Configuration**, add:

- `http://localhost:3000`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/confirm`
- `http://localhost:3000/reset-password`
- matching Preview and Production URLs for Vercel

Keep email/password enabled. Enable email confirmation for production. VYBE refreshes authenticated sessions through the existing Next.js `proxy.ts` server pattern and redirects logged-out users away from protected routes.

## 3. Apply migrations in order

Run all migration files, in this exact order:

1. `supabase/migrations/202607160001_phase2_schema.sql`
2. `supabase/migrations/202607160002_phase2_rls.sql`
3. `supabase/migrations/202607160003_security_hardening.sql`
4. `supabase/migrations/202607160004_phase3_discovery_matches_theme.sql`
5. `supabase/migrations/202607160005_phase4_communication_safety.sql`
6. `supabase/migrations/202607160006_phase5_live_video_matching.sql`
7. `supabase/migrations/202607160007_hotfix_conversation_participants_rls_recursion.sql`

Using the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

For a clean local stack:

```bash
supabase start
supabase db reset
```

The complete schema contains 38 RLS-protected application tables after all seven migrations.


### Existing Phase 5 projects: required RLS hotfix

If migrations 1–6 are already installed and login/private chat fails with `infinite recursion detected in policy for relation "conversation_participants"`, apply migration 7 only:

```bash
supabase db push
```

Or run `supabase/migrations/202607160007_hotfix_conversation_participants_rls_recursion.sql` in the Supabase SQL Editor. The migration does **not** disable RLS. It replaces the recursive SELECT policy with a narrowly scoped `SECURITY DEFINER` helper that checks only the current authenticated user's active or invited conversation access.

## 4. Phase 5 database layer

Migration 6 extends the existing profile, settings, block, notification, moderation, and Realtime systems. It adds:

- server-owned video identity and coarse-location fields on `profiles`
- `video_match_preferences`
- `video_match_queue`
- `video_sessions`
- `video_session_participants`
- `video_session_events`
- `video_moderation_events`
- `video_restrictions`

The database derives age brackets from date of birth. Queue functions enforce:

- same-bracket eligibility
- blocks in either direction
- mutual Girls/Boys/Everyone preferences
- bilateral Country/State/City filters
- city matching only when both users explicitly share city
- duplicate active-call prevention
- repeat prevention
- queue and skip rate limits
- stale entry/session cleanup
- temporary safety restrictions
- row locking during pair creation

Clients cannot directly create sessions, impersonate participants, or modify another user's queue/session rows.

## 5. Verify private Storage

Confirm these buckets remain private:

- `profile-avatars`
- `profile-banners`
- `voice-messages`
- `chat-media`
- `stories`
- `group-icons`

Uploads use the authenticated user ID as the first path segment. Signed URLs are used for authorized playback and display.

Phase 5 does not create a call-recording bucket. Video sessions are not recorded by default.

## 6. Deploy the moderation Edge Function

```bash
supabase functions deploy moderate-content
```

The function keeps existing message, Story, and profile moderation and adds ephemeral visual-frame checks for active video sessions. Frame data is evaluated in memory and is never inserted into Storage or Postgres.

Optional server-only model enrichment:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

Deterministic teen-safety rules remain available when the optional provider is absent.

## 7. Configure Realtime

The migrations add the required tables to `supabase_realtime` and protect private topics through authorization policies.

VYBE uses:

- database-change subscriptions for queue, sessions, participants, messages, receipts, reactions, notifications, Stories, groups, requests, matches, restrictions, and presence
- authenticated private `conversation:<uuid>` topics for typing
- authenticated private video session topics

Do not make these channels public. Presence and video metadata must never publish IP addresses, GPS, street addresses, ZIP codes, device identifiers, or exact distance.

## 8. Configure `.env.local`

```bash
cp .env.example .env.local
```

Public browser-safe values:

```dotenv
NEXT_PUBLIC_VYBE_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_VIDEO_MODERATION_ENABLED=false
```

Server-only values:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VIDEO_MODERATION_AGENT_SECRET=
OPENAI_API_KEY=
```

Never prefix the server-only values with `NEXT_PUBLIC_`.

Complete [LIVEKIT_SETUP.md](./LIVEKIT_SETUP.md) before real call testing.

## 9. Create an administrator

Create and verify a normal account, complete its VYBE profile, then assign a database role through SQL Editor:

```sql
insert into public.admin_roles (user_id, role)
select id, 'admin'
from public.profiles
where username = 'YOUR_ADMIN_USERNAME'
on conflict (user_id)
do update set role = excluded.role;
```

Valid roles are `moderator`, `admin`, and `super_admin`. The `/admin` route performs a server-side role check, and RLS/RPC authorization protects every moderation action again at the database boundary.

## 10. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production-style local run:

```bash
npm run build
npm start
```

Explicit UI-only demo mode:

```bash
npm run dev:demo
```

Demo data never mixes into authenticated Supabase accounts.

## 11. Create three verified test accounts

Create:

- User A: age 13–15
- User B: same bracket as A
- User C: age 16–17

Complete each profile with a unique username, date of birth, video identity, and any optional coarse location. A and B should be eligible; C must remain isolated.

Keep credentials in uncommitted `.env.local` values:

```dotenv
TEST_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
TEST_USER_A_EMAIL=
TEST_USER_A_PASSWORD=
TEST_USER_B_EMAIL=
TEST_USER_B_PASSWORD=
TEST_USER_C_EMAIL=
TEST_USER_C_PASSWORD=
```

## 12. Required real Phase 5 test

Use separate browser profiles or separate browsers.

1. Sign in as A, B, and C.
2. Confirm A and B see only their database-derived age bracket.
3. Join Live Solo Match as A and C. They must never pair.
4. Leave C waiting, then join as B. A and B may pair.
5. Confirm the session is created once and both receive only room-scoped tokens.
6. Verify camera, microphone, timer, quality, reconnect, Next, Report, Block, and End.
7. During the call, view profile, send friend request, Like, create a match, and open the existing chat when permitted.
8. Confirm remote video remains blurred until the connection completes.
9. Test Hidden, Country, State, and City visibility. Same City must require both users to share city.
10. End and rejoin. Confirm stale sessions and duplicate calls are not left behind.
11. Trigger repeated fast skips and confirm temporary restriction behavior.
12. Report or block the peer and confirm active/future video and messaging access is revoked appropriately.
13. Confirm the administrator dashboard receives video reports and moderation flags.
14. Confirm no video recording or raw speech transcript exists in Storage or Postgres.

Automated cloud authorization test:

```bash
npm run test:cloud
```

It validates same-bracket pairing, cross-bracket exclusion, unique session creation, participant-only reads, bilateral city visibility, direct-write denial, session ending, rematch behavior, and block enforcement.

## 13. Local quality checks

```bash
npm run lint
npm run typecheck
npm run test:security
npm run build
npm run build:demo
npm run test:e2e
npm audit --omit=dev
```

## 14. Vercel deployment

In **Vercel → Project → Settings → Environment Variables**, configure separate Development, Preview, and Production values. Browser-visible variables are limited to the public Supabase URL/key, site URL, explicit data mode, and the visual-moderation feature flag.

Keep all service-role, LiveKit, worker, test-account, and optional model credentials server-only. Redeploy after changing environment variables.

The Supabase Edge Function and optional LiveKit safety worker are deployed separately from the Next.js application.

## 15. Security guarantees and remaining launch work

Implemented technical protections include:

- server-derived age brackets
- bidirectional block enforcement
- RLS on all exposed private tables
- room-scoped short-lived LiveKit tokens
- authenticated session membership
- no room listing, administration, or recording grants
- queue/session write functions instead of direct client writes
- private Realtime authorization
- coarse location only
- moderation review and restrictions
- no raw audio/transcript persistence by the included safety worker

Before a public teen launch, obtain professional legal/privacy review, production age-assurance and parental-consent operations, trained human moderation coverage, incident-response procedures, data-retention policies, and jurisdiction-specific child-safety compliance review. Existing age-assurance and parental-consent entities are architectural placeholders, not legal guarantees.

## Phase 5 two-browser matchmaking hotfix

For a database where Phase 5 is already installed, apply migration 8:

```bash
supabase db push
```

The forward-only migration is:

```text
supabase/migrations/202607160008_hotfix_video_matchmaking_pairing.sql
```

It fixes a PostgreSQL transaction race where two nearly simultaneous queue joins could each miss the other user's uncommitted row and both remain waiting. It does **not** weaken age-bracket, gender, location, blocking, restriction, or repeat-match rules.

### Deterministic two-user verification

Add these server/test values to `.env.local` without a `NEXT_PUBLIC_` prefix for passwords or LiveKit secrets:

```dotenv
TEST_APP_URL=http://localhost:3000
TEST_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
TEST_USER_A_EMAIL=verified-a@example.com
TEST_USER_A_PASSWORD=...
TEST_USER_B_EMAIL=verified-b@example.com
TEST_USER_B_PASSWORD=...
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Users A and B must have completed onboarding and must be in the same supported age bracket. Use an isolated test project or make sure no third eligible account is waiting in the video queue.

Build and start the app:

```bash
npm run build
npm start
```

In another terminal:

```bash
npm run test:cloud:video-pairing
```

The test proves:

- A and B join at the same time.
- Exactly one session and one LiveKit room are created.
- Both private queue subscriptions receive the matched session.
- Both queue rows become `matched`, not `waiting`.
- Both users receive cryptographically verified, room-scoped participant tokens.
- Rejoining while active returns the same session instead of creating another call.

### Demo-mode cleanup

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured, VYBE now selects Supabase mode automatically unless `NEXT_PUBLIC_VYBE_DATA_MODE=demo` is explicitly set. Remove any stale explicit `demo` value from `.env.local` and restart the Next.js process if demo wording still appears.

## Phase 5 matchmaking root-cause hotfix (migration 9)

Databases that already installed Phase 5 and migrations 7–8 must also apply:

```text
supabase/migrations/202607160009_hotfix_video_matchmaking_root_cause.sql
```

Run:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The exact production root cause was the old repeat-prevention predicate. It rejected a pair when **any** `video_sessions` row existed for those users in the previous 12 hours, including a `connecting` room that never reached LiveKit and later ended as `stale_timeout`. The prior automated pairing test also set `repeat_prevention=false`, so it bypassed the rule that real accounts use.

Migration 9 keeps repeat prevention enabled but requires `video_sessions.connected_at IS NOT NULL`, which is written only after both participants connect. Age brackets, mutual gender preferences, bilateral coarse-location filters, blocks, account restrictions, active-session checks, self-match prevention, and the 12-hour repeat window for real calls are unchanged.

Migration 9 also adds:

- `video_matchmaking_logs` with RLS
- `get_video_matchmaking_diagnostics()` for the signed-in user's own queue/logs
- staged eligibility reason codes
- queue join, match creation, queue exit, stale cleanup, and token issuance logs
- Realtime publication re-assertion for queue, sessions, and participants

### Inspect one browser's queue diagnostics

While logged in, call this from the browser's Supabase client or the Supabase API inspector:

```ts
const { data, error } = await supabase.rpc("get_video_matchmaking_diagnostics");
console.log({ data, error });
```

Common reason codes include:

- `no_waiting_candidates`
- `age_bracket`
- `blocked`
- `requester_gender_preference`
- `candidate_gender_preference`
- `requester_location_preference`
- `candidate_location_preference`
- `candidate_active_session`
- `recent_connected_repeat`
- `eligible`

No IP, GPS, ZIP code, school, exact location, raw audio, video frame, token, or secret is written to these logs.

### Deterministic clean-account test

The test now creates and deletes two temporary **verified** users through a server-only test service-role key. It does not disable repeat prevention.

Add to `.env.local`:

```dotenv
TEST_APP_URL=http://localhost:3000
TEST_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
TEST_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Never prefix the service-role key or LiveKit secrets with `NEXT_PUBLIC_`.

Start the app:

```bash
npm run build
npm start
```

In a second terminal:

```bash
npm run test:cloud:video-pairing
```

The test proves:

1. Two fresh verified users have the same server-derived age bracket.
2. Repeat prevention remains enabled for both.
3. A and B join concurrently.
4. Exactly one shared session is created.
5. Polling and both private Realtime subscriptions deliver the same session ID.
6. Both queue rows leave `waiting` and become `matched` with that session.
7. Both users receive cryptographically valid, room-scoped LiveKit tokens.
8. Concurrent rejoin attempts return the existing session and cannot create a duplicate.
9. Temporary users are deleted after the run.

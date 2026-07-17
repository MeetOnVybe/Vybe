# VYBE — Phase 5 Complete

VYBE Phase 5 extends the working Phase 4 Supabase platform with secure one-to-one live video matching. It preserves the existing UI, authentication, onboarding, profiles, friends, discovery, matches, direct and group chat, voice messages, Stories, notifications, moderation, administrator tools, Storage, RLS, light/dark themes, and responsive layouts.

## Phase 5 additions

### Live one-to-one video

- camera and microphone permission setup only inside Live Solo Match
- secure one-to-one WebRTC rooms through LiveKit
- random same-age-bracket queueing through Supabase
- animated matching, remote-video blur until connection, timer, connection quality, reconnect, Next, Skip, and End
- camera and microphone controls with accessible labels and pressed states
- mobile-first stacked layout and desktop side-by-side layout
- no group video, livestreaming, recording, public feed, or anonymous public room directory

### Matching preferences and coarse location

- Girls, Boys, or Everyone preference matching
- preferences are mutual and never override server-derived age-bracket isolation
- optional location visibility: Hidden, Country, State, or City
- matching filters: Anywhere, Same Country, Same State, or Same City
- city matching succeeds only when both users explicitly share city
- no GPS, address, ZIP code, school, exact distance, or live location

### Safety and moderation

- Report, Block, Next, and End stay visible during every call
- duplicate-session protection, authenticated room membership, stale-session cleanup, repeat prevention, queue limits, and skip-abuse restrictions
- visual safety sampling is ephemeral and never stored
- optional named server-side speech-safety worker transcribes in memory and stores only moderation categories and severity
- severe safety signals hide the remote session pending human review
- existing moderation reports, restrictions, notifications, review queue, administrator dashboard, appeals, and logs are reused
- LiveKit tokens are issued only after Supabase confirms the authenticated user belongs to the exact session
- browser tokens cannot list rooms, administer rooms, record, or publish arbitrary data

### Existing social systems reused during calls

- view the matched profile
- send a friend request
- Like and create an existing VYBE match
- open the existing private chat when friendship or match authorization permits
- continue chatting after the call
- block and report through the existing systems

### Theme refresh

The original dark theme remains intact. The light theme now uses the Phase 5 VYBE palette:

- main background `#EEF7FF`
- secondary surface `#E3F1FF`
- card background `#F8FBFF`
- border `#D6E9FF`
- accent `#64A9FA`
- hover `#4F9AF8`
- primary text `#102A43`
- secondary text `#486581`

## Start here

Read [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) and [LIVEKIT_SETUP.md](./LIVEKIT_SETUP.md).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The production path uses Supabase and LiveKit. Explicit UI-only demo mode remains available:

```bash
npm run dev:demo
```

Demo mode never mixes fake calls, relationships, Stories, groups, or messages into authenticated Supabase accounts.

## Validation commands

```bash
npm run lint
npm run typecheck
npm run test:security
npm run build
npm run build:demo
npm run test:e2e
npm run test:cloud
npm audit --omit=dev
```

`npm run test:cloud` requires a configured Supabase project and three verified test accounts. Live media transport additionally requires LiveKit credentials. The test skips safely when credentials are absent.

## Important Phase 5 files

- `src/app/solo/page.tsx` — Suspense-safe Solo route
- `src/components/video/LiveVideoMatch.tsx` — permission, queue, connection, controls, recovery, and in-call social UI
- `src/components/video/DemoSoloMatch.tsx` — preserved development-only legacy matching flow
- `src/services/video.ts` — stable video service boundary
- `src/services/supabase/video.ts` — production queue/session implementation
- `src/app/api/video/token/route.ts` — authenticated, room-scoped LiveKit token issuance
- `src/app/api/video/end/route.ts` — keepalive-compatible secure call ending
- `src/app/api/livekit/webhook/route.ts` — verified LiveKit lifecycle events
- `src/app/api/video/moderation/transcript/route.ts` — server-secret speech moderation gateway
- `workers/video-safety-agent` — optional non-recording server-side STT safety worker
- `supabase/migrations/202607160006_phase5_live_video_matching.sql` — queue, sessions, RLS, preferences, restrictions, moderation, Realtime, and indexes
- `supabase/migrations/202607160007_hotfix_conversation_participants_rls_recursion.sql` — non-recursive participant/conversation SELECT policies for existing and new Phase 5 databases
- `supabase/functions/moderate-content` — text, story, message, and ephemeral visual moderation
- `tests/phase5.spec.ts` — camera, controls, privacy, theme, and mobile browser checks
- `tests/integration/supabase-phase5.mjs` — credentialed three-account cloud authorization test
- `VYBE_PHASE_5_BUILD_REPORT.md` — architecture and build details
- `VYBE_PHASE_5_TEST_REPORT.md` — executed checks and credential-gated limitations

## Production

```bash
npm run build
npm start
```

Only browser-safe Supabase values may use `NEXT_PUBLIC_`. Supabase service-role credentials, LiveKit API secrets, the moderation-agent secret, and optional moderation-provider keys are server-only.

## Phase 5 conversation RLS hotfix

Projects that installed Phase 5 before this corrected package must apply migration `202607160007_hotfix_conversation_participants_rls_recursion.sql`. It keeps RLS enabled and replaces the self-referencing `conversation_participants` SELECT policy with a current-user-only `SECURITY DEFINER` helper. No application UI or chat behavior changes are required.

## Phase 5 matchmaking concurrency hotfix

Databases that already installed Phase 5 must also apply:

```text
supabase/migrations/202607160008_hotfix_video_matchmaking_pairing.sql
```

The hotfix serializes only the short queue-pairing transaction, retries pairing from queue status and heartbeat calls, restores a client Realtime queue listener, and prevents a configured Supabase development environment from silently displaying demo credentials.

After applying the migration, start the production app and run the deterministic two-account test:

```bash
npm run test:cloud:video-pairing
```

The test enters both accounts concurrently, requires one shared session, waits for both private Realtime queue updates, cryptographically verifies both LiveKit room tokens, confirms both queue rows leave the waiting state, and proves retries cannot create a duplicate active call.

## Phase 5 real matchmaking root-cause correction

Apply migration `202607160009_hotfix_video_matchmaking_root_cause.sql` after the existing Phase 5 migrations.

The Solo Match handler already called `join_video_queue` before polling. The real production blocker was the database repeat-prevention filter: it counted never-connected and stale session attempts as recent matches. The previous cloud test hid that bug by setting `repeat_prevention` to false.

The corrected path now:

- logs the Start button and actual queue-join RPC in the browser console
- writes an RLS-protected `queue_join_requested` event in Postgres
- retries pairing through join, status polling, and queue heartbeat
- returns staged eligibility diagnostics when no candidate qualifies
- creates one serialized shared session
- updates both queue rows with the same session ID
- delivers through private Realtime with polling fallback
- logs token requests and issuance without logging tokens
- keeps repeat prevention for calls where both people truly connected

Validation:

```bash
npm run lint
npm run typecheck
npm run test:security
npm run build
npm run build:demo
npm run test:cloud:video-pairing
```

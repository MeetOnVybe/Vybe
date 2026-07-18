# VYBE — Final Production Source

VYBE is a Supabase-backed teen social and live-video platform built with Next.js, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage/Realtime, and LiveKit.

This source tree contains one production runtime. It does **not** include demo accounts, simulated profiles, mock social data, preview matchmaking, or a fake backend.

## Production features

- Email/password authentication, verification, recovery, persistent sessions, and protected routes
- Database-derived 13–15 and 16–17 age brackets
- Editable profiles, private profile media, interests, preferences, privacy, and presence
- Discovery, user search, Likes, mutual matches, friends, blocks, reports, and notifications
- Direct and group chat, typing, receipts, reactions, replies, forwarding, pins, images, and voice messages
- Private 24-hour Stories with views, reactions, and replies
- Administrator-only reports, moderation flags, enforcement, appeals, and immutable logs
- Real one-to-one and group video matchmaking through Supabase queues and LiveKit rooms
- Mutual gender and coarse-location preferences without GPS, distance, school, address, ZIP code, or live location
- Queue race protection, stale-session recovery, repeat prevention, skip abuse controls, restrictions, and lifecycle logs
- Ephemeral visual and speech-safety moderation without recording calls by default
- Complete dark and light themes with mobile-first layouts

## Architecture

Supabase is authoritative for identity, eligibility, relationships, conversations, content, queues, sessions, moderation, and access control. LiveKit carries encrypted realtime audio/video only after a protected Next.js token route confirms that the authenticated Supabase user belongs to the exact room.

The browser never receives the Supabase service-role key, LiveKit API secret, moderation worker secret, or model-provider key.

## Local setup

Read [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) and [LIVEKIT_SETUP.md](./LIVEKIT_SETUP.md), then:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Required production checks

```bash
npm run lint
npm run typecheck
npm run test:source
npm run test:security
npm run build
npm audit --omit=dev
```

Credentialed cloud tests:

```bash
npm run test:cloud:friends
npm run test:cloud:phase3
npm run test:cloud
npm run test:cloud:video-pairing
npm run test:cloud:group-video
```

These tests intentionally skip when the required Supabase and LiveKit test credentials are absent. They never silently substitute fake data.

## Deployment order

1. Configure the Supabase project and authentication URLs.
2. Apply all migrations with `supabase db push`.
3. Deploy `moderate-content` and set its server-only secrets.
4. Configure LiveKit keys and the signed webhook.
5. Deploy the optional named safety worker used by production speech moderation.
6. Add Vercel Development, Preview, and Production environment variables.
7. Deploy the Next.js project.
8. Run the two-user Solo test and three-user Group test against the deployed URL.

See [FINAL_DEPLOYMENT_CHECKLIST.md](./FINAL_DEPLOYMENT_CHECKLIST.md) for exact commands.

## Important production files

- `src/lib/supabase/proxy.ts` — session refresh and protected page routing
- `src/services/supabase/platform.ts` — profiles, friends, chat, Stories, notifications, moderation, and Realtime
- `src/services/supabase/video.ts` — one-to-one queue/session service
- `src/services/supabase/group-video.ts` — group queue/session service
- `src/components/video/LiveVideoMatch.tsx` — Solo Match lifecycle and controls
- `src/components/video/LiveGroupVideoMatch.tsx` — Group Match lifecycle and controls
- `src/app/api/video/token/route.ts` — participant-scoped Solo LiveKit tokens
- `src/app/api/video/group-token/route.ts` — participant-scoped Group LiveKit tokens
- `src/app/api/livekit/webhook/route.ts` — signed room/participant lifecycle updates
- `supabase/functions/moderate-content/index.ts` — authenticated content and visual moderation gateway
- `workers/video-safety-agent/agent.py` — non-recording speech-safety worker
- `supabase/migrations/` — the complete ordered production database history

## Release documentation

- [FINAL_PRODUCTION_BUILD_REPORT.md](./FINAL_PRODUCTION_BUILD_REPORT.md)
- [FINAL_PRODUCTION_TEST_REPORT.md](./FINAL_PRODUCTION_TEST_REPORT.md)
- [FINAL_CHANGED_FILES.md](./FINAL_CHANGED_FILES.md)
- [FINAL_DEPLOYMENT_CHECKLIST.md](./FINAL_DEPLOYMENT_CHECKLIST.md)

# VYBE Final Production Deployment Checklist

Production target: `https://vybe-taupe-zeta.vercel.app`

Deploy in this order. Do not redeploy Vercel before the database and Edge Function are ready.

## A. Local source verification

```bash
npm ci
npm run lint
npm run typecheck
npm run test:source
npm run test:security
npm run build
npm audit --omit=dev
python -m py_compile workers/video-safety-agent/agent.py
```

Install the Playwright browser once on a machine with internet access, then run the public UI suite:

```bash
npx playwright install chromium
npm run test:e2e
```

## B. Supabase database

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Confirm the remote migration history contains all ten migration timestamps through:

```text
202607170010
```

Do not disable RLS. The final contract expects 45 RLS-enabled application tables.

## C. Supabase Auth

Set the Site URL:

```text
https://vybe-taupe-zeta.vercel.app
```

Add redirect URLs:

```text
https://vybe-taupe-zeta.vercel.app/auth/callback
https://vybe-taupe-zeta.vercel.app/auth/confirm
https://vybe-taupe-zeta.vercel.app/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
http://localhost:3000/reset-password
```

Keep email confirmation enabled.

## D. Supabase Edge Function

```bash
npx supabase functions deploy moderate-content --no-verify-jwt
npx supabase secrets set \
  VYBE_ALLOWED_ORIGINS=https://vybe-taupe-zeta.vercel.app \
  OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

Inspect deployment logs:

```bash
npx supabase functions logs moderate-content
```

The function intentionally performs its own `auth.getUser()` verification. Do not make an anonymous bypass in the handler.

## E. Generate the shared moderation-worker secret

Cross-platform Node command:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the same output for:

```text
VIDEO_MODERATION_AGENT_SECRET
```

in Vercel and the private LiveKit worker environment.

## F. LiveKit

Vercel server variables:

```dotenv
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VIDEO_MODERATION_AGENT_SECRET=THE_SHARED_RANDOM_SECRET
```

Create a signed webhook in LiveKit Cloud:

```text
https://vybe-taupe-zeta.vercel.app/api/livekit/webhook
```

Select a project API key as the webhook signing key and send a test event.

Deploy the worker:

```bash
cd workers/video-safety-agent
lk cloud auth
lk project set-default "YOUR LIVEKIT PROJECT NAME"
lk agent create --secrets-file .env.production .
```

Later worker releases:

```bash
lk agent deploy --secrets-file .env.production .
lk agent status
lk agent logs --log-type deploy
```

## G. Vercel environment variables

Add these to **Production** and appropriate Preview/Development environments.

Browser-safe:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_SITE_URL=https://vybe-taupe-zeta.vercel.app
NEXT_PUBLIC_VIDEO_DEBUG_LOGS=false
NEXT_PUBLIC_VIDEO_MODERATION_ENABLED=true
```

Server-only:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VIDEO_MODERATION_AGENT_SECRET=THE_SHARED_RANDOM_SECRET
OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

There is no demo-mode environment variable in the final source.

Vercel CLI option:

```bash
npx vercel@latest link
npx vercel@latest env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel@latest env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel@latest env add NEXT_PUBLIC_SITE_URL production
npx vercel@latest env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel@latest env add LIVEKIT_URL production
npx vercel@latest env add LIVEKIT_API_KEY production
npx vercel@latest env add LIVEKIT_API_SECRET production
npx vercel@latest env add VIDEO_SAFETY_AGENT_NAME production
npx vercel@latest env add VIDEO_MODERATION_AGENT_SECRET production
npx vercel@latest env add OPENAI_API_KEY production
```

Enter secret values interactively; do not commit or echo them into logs.

## H. Deploy Vercel

If using Git integration, push the final source to the Production branch and confirm the Vercel project root is this Next.js folder.

CLI deployment:

```bash
npx vercel@latest --prod
```

After deployment, confirm the landing page no longer says “Phase 2,” “preview,” or “no real camera.”

## I. Automated cloud tests

Set these only in an uncommitted test environment:

```dotenv
TEST_APP_URL=https://vybe-taupe-zeta.vercel.app
TEST_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
TEST_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
```

Run:

```bash
npm run test:cloud:video-pairing
npm run test:cloud:group-video
```

The scripts create and remove temporary verified users. Never expose the service-role key to a browser.

For friends/chat/Stories tests, configure the three test-user values shown in `.env.example` and run:

```bash
npm run test:cloud:friends
npm run test:cloud:phase3
npm run test:cloud
```

## J. Manual production release test

Use separate browser profiles and real verified accounts.

1. Sign up, verify email, complete DOB onboarding, interests, and profile media.
2. Confirm logged-out access to Home, Solo, Group, Stories, DMs, and Admin redirects to Login.
3. A sends B a friend request; B receives it in Realtime and accepts.
4. A and B exchange DMs, image and voice messages, typing, reactions, delivered/read states, and notifications.
5. Upload a Story; verify authorized viewing, reply/reaction, signed media access, and expiry behavior.
6. A and B join Solo Match; confirm one shared session, one LiveKit room, audio/video, controls, webhook state, and cleanup.
7. Confirm an account in the other age bracket never joins their Solo or Group room.
8. Join Group Match with three eligible accounts; confirm one shared room and correct leave/end behavior.
9. Test Skip, reconnect, duplicate tab/queue attempts, stale room recovery, block, report, restriction, and repeat prevention.
10. Confirm moderator/admin reports, flags, enforcement, appeals, and logs.
11. Confirm both dark/light themes and 390×844 mobile layout.
12. Inspect browser, Vercel, Supabase Function, Supabase Postgres, Realtime, and LiveKit logs for errors.

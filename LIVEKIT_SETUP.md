# VYBE — LiveKit Production Setup

LiveKit transports encrypted media for authenticated VYBE Solo and Group sessions. Supabase decides who may enter each room. Browsers never receive the LiveKit API secret.

## 1. Create/select a LiveKit project

Collect:

```dotenv
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
```

Add those values to Vercel Development, Preview, and Production environments as server-only variables.

## 2. How VYBE authorizes rooms

For Solo Match, `/api/video/token`:

1. verifies the Supabase browser session or bearer token;
2. reads the exact session through RLS;
3. confirms the caller is a participant;
4. creates a short-lived token scoped to one two-person room;
5. grants publish/subscribe only.

Group Match uses `/api/video/group-token` with the same model and checks membership in the exact group session.

Tokens do not grant room listing, room administration, recording, or arbitrary data publishing.

## 3. Configure the signed webhook

In LiveKit Cloud open **Settings → Webhooks**, create a webhook, and use:

```text
https://vybe-taupe-zeta.vercel.app/api/livekit/webhook
```

Select the same project API key as the signing key. Send a test event after the Vercel deployment.

The route verifies the signed authorization header before updating participant connection timestamps, session state, queue cleanup, and lifecycle logs.

## 4. Deploy the non-recording safety worker

The worker transcribes final speech segments in memory and sends them to VYBE’s protected server endpoint. It does not save audio or raw transcripts.

Create a private secrets file outside Git:

```dotenv
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_API_KEY
LIVEKIT_API_SECRET=YOUR_API_SECRET
VYBE_SITE_URL=https://vybe-taupe-zeta.vercel.app
VIDEO_MODERATION_AGENT_SECRET=THE_SAME_LONG_RANDOM_SECRET_USED_BY_VERCEL
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VYBE_STT_MODEL=deepgram/nova-3-general
```

Authenticate and deploy:

```bash
cd workers/video-safety-agent
lk cloud auth
lk project set-default "YOUR LIVEKIT PROJECT NAME"
lk agent create --secrets-file .env.production .
```

For later releases:

```bash
lk agent deploy --secrets-file .env.production .
lk agent status
lk agent logs --log-type deploy
```

Keep `VIDEO_SAFETY_AGENT_NAME` identical in Vercel and the worker.

## 5. Visual moderation

Set in Vercel:

```dotenv
NEXT_PUBLIC_VIDEO_MODERATION_ENABLED=true
OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

Frames are sampled only while a session is active, sent through the authenticated Supabase Edge Function, evaluated in memory, and not stored as images or video.

## 6. Required media tests

Use HTTPS in production and two separate browser profiles.

### Solo

1. A and B join with compatible same-bracket settings.
2. Both receive the same Supabase session ID.
3. Both token responses decode to the same room and correct user identity.
4. Both see/hear each other.
5. Mute, camera toggle, quality, timer, reconnect, Next, Report, Block, and End work.
6. Ending clears active queue/session state.
7. A connected pair is protected from immediate repeat; a never-connected stale attempt is not counted as a completed encounter.

### Group

1. At least two eligible same-bracket accounts join.
2. They receive the same group session and room.
3. Up to four authorized participants can join.
4. A different age bracket cannot enter.
5. Leaving removes that participant without authorizing outsiders.
6. The room ends/cleans up when the session is no longer viable.

## 7. Troubleshooting

**Token route returns 503** — LiveKit server variables are missing in the current Vercel environment.  
**Token route returns 401** — the Supabase session expired or is missing.  
**Token route returns 403** — the user is not a member, the session ended, the profile is incomplete, or an enforcement rule denies access.  
**Room connects but Supabase stays `connecting`** — verify the LiveKit webhook URL and signing key.  
**Safety worker never joins** — verify its deployed status, dispatch name, and project.  
**Camera works locally but not on a domain** — confirm HTTPS, browser/OS permissions, and that another application is not holding the device.

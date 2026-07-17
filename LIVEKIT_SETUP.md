# VYBE Phase 5 — LiveKit Setup

VYBE uses LiveKit only as the encrypted WebRTC transport for private one-to-one rooms. Supabase remains the source of truth for authentication, age eligibility, queueing, preferences, blocks, session membership, restrictions, moderation state, and audit events.

## 1. Create a LiveKit project

Create a LiveKit Cloud project or deploy a compatible self-hosted LiveKit server. Collect:

- WebSocket server URL, such as `wss://YOUR_PROJECT.livekit.cloud`
- API key
- API secret

The API key and secret are server-only. Never add them to a `NEXT_PUBLIC_` variable or browser bundle.

## 2. Add server environment variables

In `.env.local` and your Vercel project:

```dotenv
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_SERVER_KEY
LIVEKIT_API_SECRET=YOUR_SERVER_SECRET
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SUPABASE_SERVICE_ROLE_KEY
```

Vercel should have separate Development, Preview, and Production values. Redeploy after changing production variables.

## 3. Configure the verified webhook

Add this HTTPS endpoint in the LiveKit project webhook configuration:

```text
https://YOUR_VYBE_DOMAIN/api/livekit/webhook
```

For local webhook testing, expose the local server through a trusted HTTPS tunnel and temporarily configure the tunnel URL.

The route verifies the LiveKit webhook signature before updating participant connection state, session state, queue state, and moderation-safe lifecycle events. Unverified requests are rejected.

## 4. Token authorization model

The browser requests `/api/video/token?sessionId=...` using its authenticated VYBE session. The server then:

1. validates the Supabase user session;
2. calls `get_video_session_state` through the user's RLS context;
3. confirms the user belongs to that exact active video session;
4. creates a short-lived token scoped to the exact LiveKit room;
5. allows publish/subscribe only;
6. denies room listing, room administration, arbitrary data publishing, and recording.

A token cannot be used to join another VYBE room.

## 5. Optional visual moderation

Visual moderation uses low-resolution, ephemeral frame samples while a call is active. Enable the client request path only after deploying the `moderate-content` Supabase Edge Function:

```dotenv
NEXT_PUBLIC_VIDEO_MODERATION_ENABLED=true
```

Frames are evaluated in memory and are not uploaded to Storage or inserted into Postgres. Keep it `false` until the trusted moderation function is configured.

## 6. Optional speech-safety worker

The worker in `workers/video-safety-agent` transcribes authorized participants in memory and sends final text segments to a protected VYBE server route. It never records calls, saves audio, or stores raw transcripts.

Generate a long random secret and configure the same value only on VYBE's server and the worker:

```dotenv
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VIDEO_MODERATION_AGENT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
VYBE_STT_MODEL=deepgram/nova-3-general
VYBE_SITE_URL=https://YOUR_VYBE_DOMAIN
```

The VYBE server also accepts an optional server-only moderation key:

```dotenv
OPENAI_API_KEY=OPTIONAL_SERVER_ONLY_KEY
```

The deterministic teen-safety rules remain active without the optional provider.

### Local worker

```bash
cd workers/video-safety-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python agent.py dev
```

On Windows PowerShell, activate with `.venv\\Scripts\\Activate.ps1`.

### Production worker

Run it as a private long-lived worker process:

```bash
python agent.py start
```

A Dockerfile is included. The worker must use the same LiveKit project and `VIDEO_SAFETY_AGENT_NAME` as VYBE. The room token contains only the session ID and authorized participant IDs; it never contains the moderation secret.

## 7. Media behavior

VYBE requests camera and microphone permissions only after the user presses **Start Video Match**. During a call users can independently disable camera or mute microphone. Tracks stop when the session ends or the user leaves.

The room is configured for two human participants. VYBE does not create group video calls, livestreams, public rooms, recordings, or an anonymous public room directory.

## 8. Network and browser checks

Test on current Chrome, Edge, Safari, and mobile browsers over HTTPS. Camera and microphone APIs require a secure context in production. Confirm:

- permission denial shows a recovery message;
- camera and microphone start promptly after permission;
- reconnect appears after a network interruption;
- Next ends the prior Supabase session before requeueing;
- End stops local tracks and clears queue/session state;
- remote video stays blurred until the secure connection is established;
- no call is possible between different age brackets or blocked users.

## 9. Troubleshooting

- **503 from token route:** LiveKit server variables are missing.
- **403 from token route:** the user is not an authorized participant, the profile is incomplete, or the session ended.
- **Room connects but state does not update:** verify the webhook URL and LiveKit credentials.
- **Safety worker does not join:** verify the named worker is running and `VIDEO_SAFETY_AGENT_NAME` matches.
- **Visual moderation does nothing:** deploy the Supabase Edge Function and enable `NEXT_PUBLIC_VIDEO_MODERATION_ENABLED`.
- **Camera unavailable:** use HTTPS, verify OS/browser permissions, and close other applications holding the camera.

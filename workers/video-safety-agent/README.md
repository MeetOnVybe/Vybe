# VYBE Video Safety Agent

This optional server-side LiveKit worker transcribes authorized room participants
in memory and forwards final transcript segments to VYBE's protected moderation
gateway. It does **not** record calls, save audio, or persist raw transcripts.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python agent.py dev
```

Deploy it as a private worker process with the same LiveKit project credentials
as VYBE. Set the same `VIDEO_SAFETY_AGENT_NAME` in VYBE and the worker, and set
`VIDEO_MODERATION_AGENT_SECRET` to the same long random server-only value.

The token endpoint dispatches this named worker only after Supabase confirms both
participants belong to the exact age-safe VYBE video session. The secret is never
placed in a room token or browser bundle.

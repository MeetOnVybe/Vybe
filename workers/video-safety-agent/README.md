# VYBE Video Safety Worker

This private LiveKit worker listens only in rooms authorized and dispatched by VYBE. It transcribes final speech segments in memory and sends them to the protected VYBE moderation gateway. It does not record calls, save audio, or persist raw transcripts.

## Local development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python agent.py dev
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`.

## LiveKit Cloud deployment

Create an uncommitted `.env.production` from `.env.example`, then:

```bash
lk cloud auth
lk project set-default "YOUR LIVEKIT PROJECT NAME"
lk agent create --secrets-file .env.production .
```

Subsequent deployments:

```bash
lk agent deploy --secrets-file .env.production .
lk agent status
lk agent logs --log-type deploy
```

The worker’s `VIDEO_SAFETY_AGENT_NAME` and `VIDEO_MODERATION_AGENT_SECRET` must match the Vercel values. Never put the secret in a browser variable, room metadata, or repository file.

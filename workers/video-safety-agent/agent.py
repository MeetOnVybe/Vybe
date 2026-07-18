"""VYBE live-video speech safety worker.

The worker dynamically attaches an in-memory STT session to every authorized
human participant in a VYBE one-to-one or group room. It never records, uploads,
or persists call audio or raw transcripts.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx
from livekit.agents import Agent, AgentSession, JobContext, UserInputTranscribedEvent, WorkerOptions, cli, inference, room_io


SITE_URL = os.environ.get("VYBE_SITE_URL", "").rstrip("/")
MODERATION_SECRET = os.environ.get("VIDEO_MODERATION_AGENT_SECRET", "")
STT_MODEL = os.environ.get("VYBE_STT_MODEL", "deepgram/nova-3-general")
AGENT_NAME = os.environ.get("VIDEO_SAFETY_AGENT_NAME", "vybe-video-safety")


async def submit_transcript(
    client: httpx.AsyncClient,
    *,
    room_name: str,
    session_id: str,
    speaker_id: str,
    transcript: str,
) -> None:
    text = transcript.strip()
    if not text or not SITE_URL or not MODERATION_SECRET:
        return
    try:
        await client.post(
            f"{SITE_URL}/api/video/moderation/transcript",
            headers={"Authorization": f"Bearer {MODERATION_SECRET}"},
            json={
                "roomName": room_name,
                "sessionId": session_id,
                "speakerId": speaker_id,
                "transcript": text[:2000],
            },
            timeout=8.0,
        )
    except httpx.HTTPError:
        # Do not print transcript content or fail the active call.
        return


async def entrypoint(ctx: JobContext) -> None:
    try:
        metadata: dict[str, Any] = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        metadata = {}

    session_id = str(metadata.get("sessionId", ""))
    if not session_id:
        return

    await ctx.connect()
    client = httpx.AsyncClient()
    sessions: dict[str, AgentSession] = {}
    lock = asyncio.Lock()

    async def start_for_participant(participant_id: str) -> None:
        if not participant_id:
            return
        async with lock:
            if participant_id in sessions:
                return
            session = AgentSession(stt=inference.STT(model=STT_MODEL))

            @session.on("user_input_transcribed")
            def on_transcript(
                event: UserInputTranscribedEvent,
                speaker_id: str = participant_id,
            ) -> None:
                if not event.is_final:
                    return
                asyncio.create_task(
                    submit_transcript(
                        client,
                        room_name=ctx.room.name,
                        session_id=session_id,
                        speaker_id=speaker_id,
                        transcript=event.transcript,
                    )
                )

            await session.start(
                agent=Agent(
                    instructions=(
                        "Transcribe the assigned participant for automated teen-safety "
                        "classification only. Never speak, respond, or publish text."
                    )
                ),
                room=ctx.room,
                room_options=room_io.RoomOptions(
                    participant_identity=participant_id,
                    audio_input=True,
                    audio_output=False,
                    text_input=False,
                    text_output=False,
                    close_on_disconnect=False,
                ),
            )
            sessions[participant_id] = session

    async def stop_for_participant(participant_id: str) -> None:
        async with lock:
            session = sessions.pop(participant_id, None)
        if session is not None:
            await session.aclose()

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: Any) -> None:
        asyncio.create_task(start_for_participant(str(participant.identity)))

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: Any) -> None:
        asyncio.create_task(stop_for_participant(str(participant.identity)))

    for participant in list(ctx.room.remote_participants.values()):
        await start_for_participant(str(participant.identity))

    try:
        await asyncio.Event().wait()
    finally:
        await client.aclose()
        await asyncio.gather(
            *(session.aclose() for session in list(sessions.values())),
            return_exceptions=True,
        )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name=AGENT_NAME))

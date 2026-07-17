import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret)
      return NextResponse.json(
        { error: "LiveKit webhook is not configured" },
        { status: 503 },
      );

    const rawBody = await request.text();
    const event = await new WebhookReceiver(apiKey, apiSecret).receive(
      rawBody,
      request.headers.get("authorization") || undefined,
    );
    const roomName = event.room?.name;
    if (!roomName?.startsWith("vybe_")) return NextResponse.json({ ok: true });

    const admin = createAdminClient();
    const { data: session } = await admin
      .from("video_sessions")
      .select("id,status,user_a,user_b")
      .eq("room_name", roomName)
      .maybeSingle();
    if (!session) return NextResponse.json({ ok: true });

    const participantId = event.participant?.identity || null;
    const metadata: Record<string, unknown> = {
      livekitEvent: event.event,
      participantIdentity: participantId,
      trackSource: event.track?.source || null,
    };

    if (event.event === "participant_joined" && participantId) {
      await admin
        .from("video_session_participants")
        .update({
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("session_id", session.id)
        .eq("user_id", participantId);
      const { count } = await admin
        .from("video_session_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .not("connected_at", "is", null)
        .is("disconnected_at", null);
      if ((count || 0) >= 2) {
        await admin
          .from("video_sessions")
          .update({
            status: "active",
            connected_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .neq("status", "ended");
      }
    }

    if (
      (event.event === "participant_left" ||
        event.event === "participant_connection_aborted") &&
      participantId
    ) {
      await admin
        .from("video_session_participants")
        .update({
          disconnected_at: new Date().toISOString(),
          connection_quality: "lost",
        })
        .eq("session_id", session.id)
        .eq("user_id", participantId);
      await admin
        .from("video_sessions")
        .update({
          status: session.status === "active" ? "reconnecting" : session.status,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .neq("status", "ended");
    }

    if (event.event === "room_finished") {
      const endedAt = new Date().toISOString();
      await admin
        .from("video_sessions")
        .update({
          status: "ended",
          ended_at: endedAt,
          end_reason: "room_finished",
          last_activity_at: endedAt,
        })
        .eq("id", session.id)
        .neq("status", "ended");
      await admin
        .from("video_session_participants")
        .update({ disconnected_at: endedAt, connection_quality: "lost" })
        .eq("session_id", session.id);
      await admin
        .from("video_match_queue")
        .update({ status: "cancelled", session_id: null, updated_at: endedAt })
        .eq("session_id", session.id);
    }

    await admin.from("video_session_events").insert({
      session_id: session.id,
      user_id: participantId,
      event_type: `livekit_${event.event || "event"}`,
      metadata,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 401 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/data-mode";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthenticatedSupabase = {
  supabase: SupabaseClient;
  user: User;
};

async function getAuthenticatedSupabase(request: NextRequest): Promise<AuthenticatedSupabase | null> {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  // Cookie auth remains the normal Next.js browser path. Bearer support is also
  // safe and useful for deterministic integration tests and future trusted native
  // clients: the publishable key is used, the JWT is verified by Supabase Auth,
  // and every RPC still executes under that exact user's RLS identity.
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;

    const supabase = createSupabaseClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return null;
    return { supabase, user: data.user };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv())
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const authenticated = await getAuthenticatedSupabase(request);
    if (!authenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { supabase, user } = authenticated;
    console.info("[VYBE video token] request", {
      sessionId,
      userId: user.id,
    });

    const [
      { data: session, error: sessionError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase.rpc("get_video_session_state", { target_session: sessionId }),
      supabase
        .from("profiles")
        .select("username,display_name,age_bracket")
        .eq("id", user.id)
        .single(),
    ]);

    if (sessionError || !session) {
      console.warn("[VYBE video token] session denied", {
        sessionId,
        userId: user.id,
        message: sessionError?.message || "Video session access required",
      });
      return NextResponse.json(
        { error: sessionError?.message || "Video session access required" },
        { status: 403 },
      );
    }
    if (profileError || !profile?.age_bracket) {
      return NextResponse.json(
        { error: "Complete your age-protected profile first" },
        { status: 403 },
      );
    }

    await supabase
      .rpc("log_video_token_event", {
        target_session: sessionId,
        token_event: "token_requested",
      })
      .then(({ error }) => {
        if (error) console.warn("[VYBE video token] request log failed", { sessionId, message: error.message });
      });

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !serverUrl) {
      return NextResponse.json(
        { error: "LiveKit is not configured on the server" },
        { status: 503 },
      );
    }

    const row = session as Record<string, unknown>;
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: String(profile.display_name || profile.username),
      ttl: "10m",
      metadata: JSON.stringify({
        vybeSessionId: sessionId,
        ageBracket: profile.age_bracket,
      }),
      attributes: {
        "vybe.session_id": sessionId,
        "vybe.age_bracket": String(profile.age_bracket),
      },
    });
    token.addGrant({
      roomJoin: true,
      room: String(row.roomName),
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      roomList: false,
      roomRecord: false,
      roomAdmin: false,
    });

    const agentName = process.env.VIDEO_SAFETY_AGENT_NAME;
    const peer = (row.peer || {}) as Record<string, unknown>;
    const peerId = peer.id ? String(peer.id) : "";
    if (agentName && peerId) {
      token.roomConfig = new RoomConfiguration({
        maxParticipants: 2,
        emptyTimeout: 45,
        departureTimeout: 20,
        metadata: JSON.stringify({ vybeSessionId: sessionId }),
        tags: { product: "vybe", surface: "one-to-one-video" },
        agents: [
          new RoomAgentDispatch({
            agentName,
            metadata: JSON.stringify({ sessionId, group: false }),
          }),
        ],
      });
    }

    const participantToken = await token.toJwt();
    await supabase
      .rpc("log_video_token_event", {
        target_session: sessionId,
        token_event: "token_issued",
      })
      .then(({ error }) => {
        if (error) console.warn("[VYBE video token] issued log failed", { sessionId, message: error.message });
      });
    console.info("[VYBE video token] issued", {
      sessionId,
      userId: user.id,
      roomName: String(row.roomName),
    });

    return NextResponse.json(
      {
        server_url: serverUrl,
        participant_token: participantToken,
        session,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  } catch (error) {
    console.error("[VYBE video token] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to authorize video session",
      },
      { status: 500 },
    );
  }
}

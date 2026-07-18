import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/data-mode";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv())
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const { sessionId, reason = "disconnect" } = await request.json();
    if (!sessionId)
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user)
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    const safeReason = [
      "skip",
      "end",
      "disconnect",
      "block",
      "report",
    ].includes(String(reason))
      ? String(reason)
      : "disconnect";
    const { error } = await supabase.rpc("end_video_session", {
      target_session: sessionId,
      end_value: safeReason,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to end session",
      },
      { status: 400 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/data-mode";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv())
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const { sessionId, reason } = (await request.json()) as {
      sessionId?: string;
      reason?: string;
    };
    if (!sessionId)
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    const supabase = await createServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user)
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { error } = await supabase.rpc("leave_group_video_session", {
      target_session: sessionId,
      end_value: ["leave", "skip", "disconnect", "block", "report"].includes(
        String(reason),
      )
        ? reason
        : "disconnect",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to leave group video" },
      { status: 500 },
    );
  }
}

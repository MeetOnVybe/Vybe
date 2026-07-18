import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  roomName: z.string().min(1).max(180),
  sessionId: z.string().uuid().optional(),
  speakerId: z.string().uuid(),
  transcript: z.string().trim().min(1).max(2_000),
});

type Severity = "low" | "medium" | "high" | "critical";
type ModerationResult = {
  categories: string[];
  severity: Severity;
  hidden: boolean;
  provider: string;
  summary: string;
  scores: Record<string, number>;
};

const severityRank: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function secretMatches(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function ruleModeration(input: string): ModerationResult {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  const detections: Array<{
    category: string;
    severity: Severity;
    patterns: RegExp[];
  }> = [
    {
      category: "threats",
      severity: "critical",
      patterns: [
        /\b(i(?:'| a)?m going to|i will|gonna) (kill|hurt|attack|shoot|stab) (you|your)/i,
        /\byou(?:'re| are) dead\b/i,
        /\bfind you and (hurt|kill|attack)\b/i,
      ],
    },
    {
      category: "predatory_behavior",
      severity: "critical",
      patterns: [
        /\bkeep (this|it|us) (a )?secret\b/i,
        /\bdon't tell (your )?(parents?|mom|dad|guardian|anyone)\b/i,
        /\bmeet (me )?(alone|in private|without telling)\b/i,
        /\b(send|show) (me )?(a )?(private|nude|sexy|body) (pic|photo|video)\b/i,
        /\bhow old are you\b.{0,80}\b(alone|hotel|house|secret|meet)\b/i,
        /\b(gift|money|cash|game card)\b.{0,80}\b(secret|meet|photo|video)\b/i,
      ],
    },
    {
      category: "sexual_content",
      severity: "high",
      patterns: [
        /\b(send|show) (me )?(nudes?|explicit|sexual)\b/i,
        /\b(get naked|take (your )?clothes off)\b/i,
        /\bsexual (picture|photo|video|stuff)\b/i,
      ],
    },
    {
      category: "hate_speech",
      severity: "high",
      patterns: [
        /\b(all|those) (people|girls|boys|immigrants|gay people|trans people) (are|should) (die|burn|be killed|disappear)\b/i,
        /\b(hate|attack) (you|them) because (you are|they are)\b/i,
      ],
    },
    {
      category: "harassment",
      severity: "medium",
      patterns: [
        /\b(nobody likes you|everyone hates you|you should disappear)\b/i,
        /\b(ugly|stupid|worthless|loser)\b.{0,50}\b(again|always|forever)\b/i,
        /\bshut up\b.{0,40}\b(idiot|loser|freak)\b/i,
      ],
    },
    {
      category: "bullying",
      severity: "medium",
      patterns: [
        /\bwe(?:'re| are) going to (embarrass|expose|humiliate) you\b/i,
        /\beveryone at (school|class) (hates|laughs at) you\b/i,
      ],
    },
    {
      category: "spam",
      severity: "medium",
      patterns: [
        /\b(?:https?:\/\/|www\.)\S+/i,
        /\b(follow|subscribe|cash app|send money|promo code)\b.{0,60}\b(now|fast|today)\b/i,
        /(.)\1{12,}/,
      ],
    },
  ];

  const categories: string[] = [];
  let severity: Severity = "low";
  for (const detection of detections) {
    if (!detection.patterns.some((pattern) => pattern.test(text))) continue;
    categories.push(detection.category);
    if (severityRank[detection.severity] > severityRank[severity]) {
      severity = detection.severity;
    }
  }
  return {
    categories: [...new Set(categories)],
    severity,
    hidden: severity === "high" || severity === "critical",
    provider: "vybe-live-speech-rules-v1",
    summary: categories.length
      ? `Live speech safety categories: ${[...new Set(categories)].join(", ")}`
      : "No rule-based live speech safety flags",
    scores: {},
  };
}

async function openAiModeration(text: string): Promise<ModerationResult | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }>;
    };
    const result = payload.results?.[0];
    if (!result) return null;
    const categories = Object.entries(result.categories || {})
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);
    const critical = categories.some(
      (category) =>
        category.includes("sexual/minors") ||
        category.includes("violence/graphic"),
    );
    const high = categories.some(
      (category) =>
        category.includes("hate/threatening") ||
        category.includes("harassment/threatening") ||
        category === "sexual",
    );
    const severity: Severity = critical
      ? "critical"
      : high
        ? "high"
        : categories.length
          ? "medium"
          : "low";
    return {
      categories,
      severity,
      hidden: severity === "high" || severity === "critical",
      provider: "openai-omni-moderation-latest",
      summary: categories.length
        ? `Model safety categories: ${categories.join(", ")}`
        : "No model live speech safety flags",
      scores: result.category_scores || {},
    };
  } catch {
    return null;
  }
}

function mergeModeration(
  rules: ModerationResult,
  model: ModerationResult | null,
): ModerationResult {
  if (!model) return rules;
  const severity =
    severityRank[model.severity] > severityRank[rules.severity]
      ? model.severity
      : rules.severity;
  return {
    categories: [...new Set([...rules.categories, ...model.categories])],
    severity,
    hidden: rules.hidden || model.hidden,
    provider: `${rules.provider}+${model.provider}`,
    summary: [...new Set([rules.summary, model.summary])].join(" · "),
    scores: model.scores,
  };
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.VIDEO_MODERATION_AGENT_SECRET;
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !expectedSecret
    ) {
      return NextResponse.json(
        { error: "Speech moderation is not configured" },
        { status: 503 },
      );
    }
    const authorization = request.headers.get("authorization") || "";
    const receivedSecret = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (
      !expectedSecret ||
      !receivedSecret ||
      !secretMatches(receivedSecret, expectedSecret)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 12_000) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid moderation event" }, { status: 400 });
    }

    const admin = createAdminClient();
    const isGroup = parsed.data.roomName.startsWith("vybe_group_");
    let sessionId = "";
    let sessionStatus = "";
    let otherParticipantIds: string[] = [];
    let eventTable = "video_session_events";
    let moderationEventTable = "video_moderation_events";
    let sessionTable = "video_sessions";
    let sourceType = "video_session";

    if (isGroup) {
      let query = admin
        .from("group_video_sessions")
        .select("id,room_name,status")
        .eq("room_name", parsed.data.roomName);
      if (parsed.data.sessionId) query = query.eq("id", parsed.data.sessionId);
      const { data: session, error: sessionError } = await query.maybeSingle();
      if (
        sessionError ||
        !session ||
        !["forming", "connecting", "active", "reconnecting", "flagged"].includes(session.status)
      ) {
        return NextResponse.json({ error: "Active group session access required" }, { status: 403 });
      }
      const { data: participants, error: participantError } = await admin
        .from("group_video_session_participants")
        .select("user_id,membership_status")
        .eq("session_id", session.id)
        .eq("membership_status", "active");
      if (
        participantError ||
        !(participants || []).some((participant) => participant.user_id === parsed.data.speakerId)
      ) {
        return NextResponse.json({ error: "Active group participant required" }, { status: 403 });
      }
      sessionId = session.id;
      sessionStatus = session.status;
      otherParticipantIds = (participants || [])
        .map((participant) => String(participant.user_id))
        .filter((userId) => userId !== parsed.data.speakerId);
      eventTable = "group_video_session_events";
      moderationEventTable = "group_video_moderation_events";
      sessionTable = "group_video_sessions";
      sourceType = "group_video_session";
    } else {
      let query = admin
        .from("video_sessions")
        .select("id,room_name,status,user_a,user_b")
        .eq("room_name", parsed.data.roomName);
      if (parsed.data.sessionId) query = query.eq("id", parsed.data.sessionId);
      const { data: session, error: sessionError } = await query.maybeSingle();
      if (
        sessionError ||
        !session ||
        !["connecting", "active", "reconnecting", "flagged"].includes(session.status) ||
        ![session.user_a, session.user_b].includes(parsed.data.speakerId)
      ) {
        return NextResponse.json({ error: "Active session access required" }, { status: 403 });
      }
      sessionId = session.id;
      sessionStatus = session.status;
      otherParticipantIds = [session.user_a, session.user_b]
        .map(String)
        .filter((userId) => userId !== parsed.data.speakerId);
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count, error: rateError } = await admin
      .from(eventTable)
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("user_id", parsed.data.speakerId)
      .eq("event_type", "speech_safety_sample")
      .gte("created_at", oneMinuteAgo);
    if (rateError) throw rateError;
    if ((count || 0) >= 30) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const moderation = mergeModeration(
      ruleModeration(parsed.data.transcript),
      await openAiModeration(parsed.data.transcript),
    );

    // Raw speech transcripts are intentionally never written to logs, Storage,
    // Postgres, notifications, moderation summaries, or API responses.
    const { error: sampleError } = await admin.from(eventTable).insert({
      session_id: sessionId,
      user_id: parsed.data.speakerId,
      event_type: "speech_safety_sample",
      metadata: {
        flagged: moderation.categories.length > 0,
        categoryCount: moderation.categories.length,
        severity: moderation.severity,
        provider: moderation.provider,
      },
    });
    if (sampleError) throw sampleError;

    if (!moderation.categories.length) {
      return NextResponse.json(
        { ok: true, flagged: false, hidden: false },
        { headers: { "Cache-Control": "no-store, private" } },
      );
    }

    const severe =
      moderation.hidden ||
      moderation.severity === "high" ||
      moderation.severity === "critical";

    const { data: moderationEvent, error: moderationError } = await admin
      .from(moderationEventTable)
      .insert({
        session_id: sessionId,
        subject_user_id: parsed.data.speakerId,
        submitted_by: null,
        categories: moderation.categories,
        severity: moderation.severity,
        provider: moderation.provider,
        summary: moderation.summary,
        hidden: severe,
      })
      .select("id")
      .single();
    if (moderationError) throw moderationError;

    const { error: flagError } = await admin.from("moderation_flags").insert({
      source_type: sourceType,
      source_id: sessionId,
      subject_user_id: parsed.data.speakerId,
      reporter_id: null,
      categories: moderation.categories,
      severity: moderation.severity,
      hidden: severe,
      summary: moderation.summary,
      provider: moderation.provider,
      raw_scores: moderation.scores,
    });
    if (flagError) throw flagError;

    const { error: sessionUpdateError } = await admin
      .from(sessionTable)
      .update({
        status: severe ? "flagged" : sessionStatus,
        moderation_state: severe ? "severe" : "flagged",
        hidden_until_review: severe,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .neq("status", "ended");
    if (sessionUpdateError) throw sessionUpdateError;

    if (moderation.severity === "critical") {
      const { error: restrictionError } = await admin.from("video_restrictions").upsert(
        {
          user_id: parsed.data.speakerId,
          status: "review_required",
          reason: "A critical live speech safety signal requires moderator review.",
          strike_count: 1,
          restricted_until: new Date(Date.now() + 30 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (restrictionError) throw restrictionError;
    }

    if (severe && otherParticipantIds.length) {
      const { error: notificationError } = await admin.from("notifications").insert(
        otherParticipantIds.map((userId) => ({
          user_id: userId,
          type: "safety",
          title: isGroup ? "Group video paused for safety" : "Live video paused for safety",
          body: "A severe safety signal was detected. The session was hidden and queued for human review.",
          entity_id: moderationEvent.id,
        })),
      );
      if (notificationError) throw notificationError;
    }

    return NextResponse.json(
      { ok: true, flagged: true, hidden: severe },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process live speech safety signal",
      },
      { status: 500 },
    );
  }
}

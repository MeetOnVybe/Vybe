// VYBE Phase 5 trusted content and ephemeral live-video moderation gateway.
// Deploy with: supabase functions deploy moderate-content --no-verify-jwt=false
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and optional OPENAI_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Severity = "low" | "medium" | "high" | "critical";
type ModerationResult = {
  categories: string[];
  severity: Severity;
  hidden: boolean;
  provider: string;
  scores: Record<string, number>;
  summary: string;
};

function rulesModeration(text: string): ModerationResult {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const findings: Array<{
    category: string;
    severity: Severity;
    patterns: RegExp[];
  }> = [
    {
      category: "sexual_grooming",
      severity: "critical",
      patterns: [
        /keep (this|it) secret from (your )?(parents|mom|dad)/i,
        /send (me )?(a )?(private|nude|pic|photo)/i,
        /are you alone/i,
        /don'?t tell (anyone|your parents)/i,
        /meet (me )?(alone|in secret)/i,
      ],
    },
    {
      category: "threat",
      severity: "critical",
      patterns: [
        /i('ll| will) (hurt|kill|attack) you/i,
        /you('re| are) dead/i,
        /watch your back/i,
      ],
    },
    {
      category: "hate",
      severity: "high",
      patterns: [/\b(kill|hate) all [a-z]+ people\b/i],
    },
    {
      category: "harassment",
      severity: "high",
      patterns: [/\b(you should die|nobody likes you|worthless loser)\b/i],
    },
    {
      category: "bullying",
      severity: "medium",
      patterns: [
        /\b(ugly|stupid|loser|fat)\b.*\b(you|ur)\b/i,
        /everyone is laughing at you/i,
      ],
    },
    {
      category: "spam",
      severity: "medium",
      patterns: [
        /(https?:\/\/\S+\s*){3,}/i,
        /(follow|subscribe|click).*(follow|subscribe|click).*(follow|subscribe|click)/i,
        /(.)\1{14,}/,
      ],
    },
    {
      category: "predatory_language",
      severity: "critical",
      patterns: [
        /how old are you.*(hotel|house|alone|secret)/i,
        /(gift|money|cash).*(meet|photo|secret)/i,
      ],
    },
  ];
  const rank: Record<Severity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  let severity: Severity = "low";
  const categories: string[] = [];
  for (const finding of findings) {
    if (finding.patterns.some((pattern) => pattern.test(normalized))) {
      categories.push(finding.category);
      if (rank[finding.severity] > rank[severity]) severity = finding.severity;
    }
  }
  return {
    categories,
    severity,
    hidden: severity === "critical",
    provider: "vybe-rules-v1",
    scores: {},
    summary: categories.length
      ? `Detected ${categories.join(", ")}`
      : "No rule-based safety flags",
  };
}

async function openAiModeration(
  text: string,
  imageUrl?: string | null,
): Promise<ModerationResult | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || (!text.trim() && !imageUrl)) return null;
  const input: unknown[] = [];
  if (text.trim()) input.push({ type: "text", text });
  if (imageUrl) input.push({ type: "image_url", image_url: { url: imageUrl } });
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const result = payload.results?.[0];
    if (!result) return null;
    const categories = Object.entries(result.categories || {})
      .filter(([, flagged]) => flagged)
      .map(([name]) => name);
    const scores = result.category_scores || {};
    const critical = categories.some(
      (category) =>
        category.includes("sexual/minors") ||
        category.includes("violence/graphic"),
    );
    const high = categories.some(
      (category) =>
        category.includes("hate/threatening") ||
        category.includes("harassment/threatening") ||
        category === "sexual" ||
        category === "self-harm/instructions",
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
      hidden: critical || high,
      provider: "openai-omni-moderation-latest",
      scores,
      summary: categories.length
        ? `Safety categories: ${categories.join(", ")}`
        : "No model safety flags",
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
  const rank: Record<Severity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  const severity =
    rank[model.severity] > rank[rules.severity]
      ? model.severity
      : rules.severity;
  return {
    categories: [...new Set([...rules.categories, ...model.categories])],
    severity,
    hidden: rules.hidden || model.hidden,
    provider: `${rules.provider}+${model.provider}`,
    scores: model.scores,
    summary: [...new Set([rules.summary, model.summary])].join(" · "),
  };
}

async function enforceRateLimit(
  service: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  limit: number,
  seconds: number,
) {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await service
    .from("user_action_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gt("created_at", since);
  if ((count || 0) >= limit)
    throw new Error("Please slow down and try again shortly");
  await service.from("user_action_events").insert({ user_id: userId, action });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) throw new Error("Authentication required");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } =
      await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Authentication required");
    const user = authData.user;
    const body = await request.json();

    if (body.action === "send_message") {
      await enforceRateLimit(service, user.id, "message", 240, 3600);
      const conversationId = String(body.conversationId || "");
      const { data: allowed, error: accessError } = await userClient.rpc(
        "can_access_conversation",
        { target_conversation: conversationId, viewer_user: user.id },
      );
      if (accessError || !allowed)
        throw new Error("Conversation access required");
      const { data: conversation, error: conversationError } = await userClient
        .from("conversations")
        .select("id,user_a,user_b,conversation_type")
        .eq("id", conversationId)
        .single();
      if (conversationError || !conversation)
        throw new Error("Conversation not found");
      const messageType = ["text", "voice", "image"].includes(body.messageType)
        ? body.messageType
        : "text";
      const text = String(body.text || "").trim();
      const mediaPath = body.mediaPath ? String(body.mediaPath) : null;
      if (mediaPath && !mediaPath.startsWith(`${user.id}/`))
        throw new Error("Invalid media ownership");
      let imageUrl: string | null = null;
      if (messageType === "image" && mediaPath)
        imageUrl =
          (
            await service.storage
              .from("chat-media")
              .createSignedUrl(mediaPath, 180)
          ).data?.signedUrl || null;
      const moderation = mergeModeration(
        rulesModeration(text),
        await openAiModeration(text, imageUrl),
      );
      const receiverId =
        conversation.conversation_type === "direct"
          ? conversation.user_a === user.id
            ? conversation.user_b
            : conversation.user_a
          : null;
      const { data: inserted, error: insertError } = await service
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          receiver_id: receiverId,
          body: text,
          message_type: messageType,
          media_path: mediaPath,
          media_duration_seconds: body.durationSeconds || null,
          waveform: body.waveform || [],
          reply_to_id: body.replyToId || null,
          forwarded_from_id: body.forwardedFromId || null,
          story_id: body.storyId || null,
          moderation_state: moderation.hidden
            ? "hidden"
            : moderation.categories.length
              ? "flagged"
              : "approved",
          client_nonce: crypto.randomUUID(),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (moderation.categories.length) {
        await service
          .from("moderation_flags")
          .insert({
            source_type: "message",
            source_id: inserted.id,
            subject_user_id: user.id,
            categories: moderation.categories,
            severity: moderation.severity,
            hidden: moderation.hidden,
            summary: moderation.summary,
            provider: moderation.provider,
            raw_scores: moderation.scores,
          });
      }
      if (moderation.hidden) {
        await service
          .from("notifications")
          .insert({
            user_id: user.id,
            type: "safety",
            title: "Message held for review",
            body: "This message was temporarily hidden by VYBE safety systems and sent to human review.",
            entity_id: inserted.id,
          });
      }
      return new Response(
        JSON.stringify({ ok: true, hidden: moderation.hidden }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "create_story") {
      await enforceRateLimit(service, user.id, "story", 20, 86400);
      const mediaType = ["photo", "video", "text"].includes(body.mediaType)
        ? body.mediaType
        : "text";
      const text = String(body.text || "").trim();
      const mediaPath = body.mediaPath ? String(body.mediaPath) : null;
      if (mediaPath && !mediaPath.startsWith(`${user.id}/`))
        throw new Error("Invalid story media ownership");
      let imageUrl: string | null = null;
      if (mediaType === "photo" && mediaPath)
        imageUrl =
          (
            await service.storage
              .from("stories")
              .createSignedUrl(mediaPath, 180)
          ).data?.signedUrl || null;
      const moderation = mergeModeration(
        rulesModeration(text),
        await openAiModeration(text, imageUrl),
      );
      const { data: inserted, error: insertError } = await service
        .from("stories")
        .insert({
          user_id: user.id,
          media_type: mediaType,
          media_path: mediaPath,
          body: text,
          background_color: String(body.backgroundColor || "#0878f9"),
          moderation_state: moderation.hidden
            ? "hidden"
            : moderation.categories.length
              ? "flagged"
              : "approved",
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      if (moderation.categories.length || mediaType === "video") {
        const categories =
          mediaType === "video"
            ? [...new Set([...moderation.categories, "video_manual_review"])]
            : moderation.categories;
        await service
          .from("moderation_flags")
          .insert({
            source_type: "story",
            source_id: inserted.id,
            subject_user_id: user.id,
            categories,
            severity: moderation.severity,
            hidden: moderation.hidden,
            summary:
              mediaType === "video"
                ? `${moderation.summary} · Short video queued for media review.`
                : moderation.summary,
            provider: moderation.provider,
            raw_scores: moderation.scores,
          });
      }
      return new Response(
        JSON.stringify({ ok: true, hidden: moderation.hidden }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "moderate_video_frame") {
      await enforceRateLimit(
        service,
        user.id,
        "video_moderation_sample",
        220,
        3600,
      );
      const sessionId = String(body.sessionId || "");
      const frameDataUrl = String(body.frameDataUrl || "");
      if (!sessionId) throw new Error("Video session is required");
      if (
        !frameDataUrl.startsWith("data:image/jpeg;base64,") ||
        frameDataUrl.length > 900_000
      ) {
        throw new Error("Invalid moderation frame");
      }
      const { data: sessionState, error: accessError } = await userClient.rpc(
        "get_video_session_state",
        { target_session: sessionId },
      );
      if (accessError || !sessionState)
        throw new Error("Video session access required");
      const { data: sessionRow, error: sessionError } = await service
        .from("video_sessions")
        .select("id,user_a,user_b,status")
        .eq("id", sessionId)
        .single();
      if (
        sessionError ||
        !sessionRow ||
        !["connecting", "active", "reconnecting", "flagged"].includes(
          sessionRow.status,
        )
      ) {
        throw new Error("Video session is not active");
      }
      const subjectUserId =
        sessionRow.user_a === user.id ? sessionRow.user_b : sessionRow.user_a;
      const model = await openAiModeration("", frameDataUrl);
      const moderation = model || {
        categories: [],
        severity: "low" as Severity,
        hidden: false,
        provider: "video-moderation-not-configured",
        scores: {},
        summary: "Visual moderation provider is not configured",
      };
      if (moderation.categories.length) {
        const severe =
          moderation.severity === "high" ||
          moderation.severity === "critical" ||
          moderation.hidden;
        const { data: eventRow, error: eventError } = await service
          .from("video_moderation_events")
          .insert({
            session_id: sessionId,
            subject_user_id: subjectUserId,
            submitted_by: user.id,
            categories: moderation.categories,
            severity: moderation.severity,
            provider: moderation.provider,
            summary: moderation.summary,
            hidden: severe,
          })
          .select("id")
          .single();
        if (eventError) throw eventError;
        await service.from("moderation_flags").insert({
          source_type: "video_session",
          source_id: sessionId,
          subject_user_id: subjectUserId,
          reporter_id: null,
          categories: moderation.categories,
          severity: moderation.severity,
          hidden: severe,
          summary: moderation.summary,
          provider: moderation.provider,
          raw_scores: moderation.scores,
        });
        await service
          .from("video_sessions")
          .update({
            status: severe ? "flagged" : sessionRow.status,
            moderation_state: severe ? "severe" : "flagged",
            hidden_until_review: severe,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
          .neq("status", "ended");
        if (moderation.severity === "critical") {
          await service.from("video_restrictions").upsert(
            {
              user_id: subjectUserId,
              status: "review_required",
              reason:
                "A severe live-video safety signal requires moderator review.",
              strike_count: 1,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        }
        await service.from("notifications").insert({
          user_id: user.id,
          type: "safety",
          title: "Video hidden for safety review",
          body: "A severe safety signal was detected. The remote video was hidden and the session was queued for human review.",
          entity_id: eventRow.id,
        });
      }
      // The JPEG data URL is intentionally never inserted into Storage or Postgres.
      return new Response(
        JSON.stringify({
          ok: true,
          flagged: moderation.categories.length > 0,
          hidden:
            moderation.hidden ||
            moderation.severity === "high" ||
            moderation.severity === "critical",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error("Unsupported moderation action");
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Request failed",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

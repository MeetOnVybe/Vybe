"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/supabase/functions";
import type { GroupVideoService } from "@/services/contracts";
import type {
  GroupVideoParticipant,
  GroupVideoSessionSummary,
  GroupVideoTokenResponse,
  Interest,
  VideoMatchPreferences,
  VideoQueueResult,
} from "@/types";

const DEFAULT_PREFERENCES: VideoMatchPreferences = {
  genderPreference: "everyone",
  locationFilter: "anywhere",
  cameraEnabled: true,
  microphoneEnabled: true,
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function requireUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  assertNoError(error, "Authentication required");
  if (!data.user) throw new Error("Authentication required");
  return data.user;
}

async function signedProfileMedia(
  client: SupabaseClient,
  bucket: string,
  path?: string | null,
) {
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("http") || path.startsWith("data:"))
    return path;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 3600, { download: false });
  return error ? null : data.signedUrl;
}

function mapQueueResult(value: unknown): VideoQueueResult {
  const row = (value || {}) as Record<string, unknown>;
  const status = ["idle", "waiting", "matched", "cancelled", "restricted"].includes(
    String(row.status),
  )
    ? (String(row.status) as VideoQueueResult["status"])
    : "idle";
  return {
    status,
    sessionId: row.sessionId ? String(row.sessionId) : undefined,
    retryAfterSeconds:
      typeof row.retryAfterSeconds === "number" ? row.retryAfterSeconds : undefined,
    restrictionReason: row.restrictionReason
      ? String(row.restrictionReason)
      : undefined,
  };
}

async function mapParticipant(
  client: SupabaseClient,
  value: unknown,
): Promise<GroupVideoParticipant> {
  const row = (value || {}) as Record<string, unknown>;
  const [avatarUrl, bannerUrl] = await Promise.all([
    signedProfileMedia(
      client,
      "profile-avatars",
      row.avatarPath ? String(row.avatarPath) : null,
    ),
    signedProfileMedia(
      client,
      "profile-banners",
      row.bannerPath ? String(row.bannerPath) : null,
    ),
  ]);
  return {
    id: String(row.id),
    username: String(row.username || "vybe_user"),
    displayName: String(row.displayName || row.username || "VYBE member"),
    avatarUrl,
    bannerUrl,
    bio: String(row.bio || "New to VYBE."),
    status: String(row.status || "✨ Looking for new friends"),
    interests: Array.isArray(row.interests) ? (row.interests as Interest[]) : [],
    ageBracket: String(row.ageBracket || "13-15") as GroupVideoParticipant["ageBracket"],
    compatibilityScore: Number(row.compatibilityScore || 45),
    locationLabel: row.locationLabel ? String(row.locationLabel) : null,
    connected: Boolean(row.connected),
    cameraEnabled: row.cameraEnabled !== false,
    microphoneEnabled: row.microphoneEnabled !== false,
    connectionQuality: ["unknown", "excellent", "good", "poor", "lost"].includes(
      String(row.connectionQuality),
    )
      ? (String(row.connectionQuality) as GroupVideoParticipant["connectionQuality"])
      : "unknown",
  };
}

async function mapSession(
  client: SupabaseClient,
  value: unknown,
): Promise<GroupVideoSessionSummary> {
  const row = (value || {}) as Record<string, unknown>;
  const participantRows = Array.isArray(row.participants) ? row.participants : [];
  return {
    id: String(row.id),
    roomName: String(row.roomName),
    status: String(row.status || "connecting") as GroupVideoSessionSummary["status"],
    maxParticipants: Math.min(4, Math.max(2, Number(row.maxParticipants || 4))),
    participants: await Promise.all(
      participantRows.map((participant) => mapParticipant(client, participant)),
    ),
    createdAt: String(row.createdAt || new Date().toISOString()),
    connectedAt: row.connectedAt ? String(row.connectedAt) : null,
    endedAt: row.endedAt ? String(row.endedAt) : null,
    hiddenUntilReview: Boolean(row.hiddenUntilReview),
  };
}

class SupabaseGroupVideoService implements GroupVideoService {
  provider = "livekit" as const;
  private get client() {
    return createClient();
  }
  private lastQueueFingerprint = "";

  private log(event: string, details: Record<string, unknown> = {}) {
    if (process.env.NEXT_PUBLIC_VIDEO_DEBUG_LOGS === "false") return;
    console.info(`[VYBE group video] ${event}`, details);
  }

  async loadPreferences(): Promise<VideoMatchPreferences> {
    const user = await requireUser(this.client);
    const { data, error } = await this.client
      .from("video_match_preferences")
      .select(
        "gender_preference,location_filter,camera_enabled,microphone_enabled",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    assertNoError(error, "Unable to load group video preferences");
    if (!data) return DEFAULT_PREFERENCES;
    return {
      genderPreference:
        data.gender_preference as VideoMatchPreferences["genderPreference"],
      locationFilter:
        data.location_filter as VideoMatchPreferences["locationFilter"],
      cameraEnabled: data.camera_enabled !== false,
      microphoneEnabled: data.microphone_enabled !== false,
    };
  }

  async savePreferences(preferences: VideoMatchPreferences) {
    const { error } = await this.client.rpc("save_video_match_preferences", {
      gender_value: preferences.genderPreference,
      location_value: preferences.locationFilter,
      camera_value: preferences.cameraEnabled,
      microphone_value: preferences.microphoneEnabled,
    });
    assertNoError(error, "Unable to save group video preferences");
  }

  async joinQueue(preferences: VideoMatchPreferences) {
    this.log("queue join requested", {
      genderPreference: preferences.genderPreference,
      locationFilter: preferences.locationFilter,
    });
    const { data, error } = await this.client.rpc("join_group_video_queue", {
      gender_value: preferences.genderPreference,
      location_value: preferences.locationFilter,
      camera_value: preferences.cameraEnabled,
      microphone_value: preferences.microphoneEnabled,
    });
    if (error) this.log("queue join failed", { message: error.message });
    assertNoError(error, "Unable to join group video matching");
    const result = mapQueueResult(data);
    this.log("queue join result", {
      status: result.status,
      sessionId: result.sessionId,
    });
    return result;
  }

  async getQueueStatus() {
    const { data, error } = await this.client.rpc("get_group_video_queue_status");
    if (error) this.log("queue status failed", { message: error.message });
    assertNoError(error, "Unable to read group matching status");
    const result = mapQueueResult(data);
    const fingerprint = `${result.status}:${result.sessionId || ""}`;
    if (fingerprint !== this.lastQueueFingerprint) {
      this.lastQueueFingerprint = fingerprint;
      this.log("queue status delivered", {
        status: result.status,
        sessionId: result.sessionId,
      });
    }
    return result;
  }

  async heartbeatQueue() {
    const { error } = await this.client.rpc("heartbeat_group_video_queue");
    assertNoError(error, "Unable to keep group matching active");
  }

  async leaveQueue() {
    const { error } = await this.client.rpc("leave_group_video_queue");
    assertNoError(error, "Unable to leave group matching");
    this.lastQueueFingerprint = "";
    this.log("queue left");
  }

  async loadSession(sessionId: string) {
    const { data, error } = await this.client.rpc(
      "get_group_video_session_state",
      { target_session: sessionId },
    );
    assertNoError(error, "Unable to load group video session");
    return mapSession(this.client, data);
  }

  async getConnectionToken(sessionId: string): Promise<GroupVideoTokenResponse> {
    this.log("LiveKit token requested", { sessionId });
    const response = await fetch(
      `/api/video/group-token?sessionId=${encodeURIComponent(sessionId)}`,
      { method: "GET", credentials: "include", cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Unable to authorize group video session");
    return {
      serverUrl: String(payload.server_url),
      participantToken: String(payload.participant_token),
      session: await mapSession(this.client, payload.session),
    };
  }

  async updateParticipantState(
    sessionId: string,
    state: {
      connected: boolean;
      quality: "unknown" | "excellent" | "good" | "poor" | "lost";
      cameraEnabled: boolean;
      microphoneEnabled: boolean;
    },
  ) {
    const { error } = await this.client.rpc(
      "update_group_video_participant_state",
      {
        target_session: sessionId,
        connected: state.connected,
        quality_value: state.quality,
        camera_value: state.cameraEnabled,
        microphone_value: state.microphoneEnabled,
      },
    );
    assertNoError(error, "Unable to update group video state");
  }

  async leaveSession(
    sessionId: string,
    reason: "leave" | "skip" | "disconnect" | "block" | "report",
  ) {
    const { error } = await this.client.rpc("leave_group_video_session", {
      target_session: sessionId,
      end_value: reason,
    });
    assertNoError(error, "Unable to leave group video session");
  }

  async logEvent(
    sessionId: string,
    eventType: string,
    metadata: Record<string, unknown> = {},
  ) {
    const { error } = await this.client.rpc("log_group_video_session_event", {
      target_session: sessionId,
      event_name: eventType,
      event_metadata: metadata,
    });
    if (error && !error.message.includes("rate limit"))
      this.log("event log failed", { eventType, message: error.message });
  }

  async moderateFrame(
    sessionId: string,
    subjectUserId: string,
    frameDataUrl: string,
  ) {
    const data = await invokeAuthenticatedFunction<{
      hidden?: boolean;
      flagged?: boolean;
    }>(
      this.client,
      "moderate-content",
      {
        action: "moderate_group_video_frame",
        sessionId,
        subjectUserId,
        frameDataUrl,
      },
      "Unable to moderate group video frame",
    );
    return { hidden: Boolean(data.hidden), flagged: Boolean(data.flagged) };
  }

  async subscribeQueue(onChange: () => void) {
    const user = await requireUser(this.client);
    const channel = this.client
      .channel(`group-video-queue-db:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_video_match_queue",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = (payload.new || {}) as Record<string, unknown>;
          this.log("queue Realtime delivery", {
            eventType: payload.eventType,
            status: row.status,
            sessionId: row.session_id,
          });
          onChange();
        },
      )
      .subscribe((status) => this.log("queue Realtime subscription", { status }));
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  async subscribeSession(sessionId: string, onChange: () => void) {
    const channels: RealtimeChannel[] = [
      this.client
        .channel(`group-video-session-db:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "group_video_sessions",
            filter: `id=eq.${sessionId}`,
          },
          onChange,
        )
        .subscribe(),
      this.client
        .channel(`group-video-participants-db:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "group_video_session_participants",
            filter: `session_id=eq.${sessionId}`,
          },
          onChange,
        )
        .subscribe(),
    ];
    return () => {
      channels.forEach((channel) => void this.client.removeChannel(channel));
    };
  }
}

let service: SupabaseGroupVideoService | null = null;
export function getSupabaseGroupVideoService() {
  service ??= new SupabaseGroupVideoService();
  return service;
}

"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { VideoService } from "@/services/contracts";
import { invokeAuthenticatedFunction } from "@/lib/supabase/functions";
import type {
  Interest,
  VideoMatchPreferences,
  VideoQueueResult,
  VideoSessionSummary,
  VideoTokenResponse,
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

async function signedProfileMedia(client: SupabaseClient, bucket: string, path?: string | null) {
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("http") || path.startsWith("data:")) return path;
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 3600, { download: false });
  return error ? null : data.signedUrl;
}

function mapQueueResult(value: unknown): VideoQueueResult {
  const row = (value || {}) as Record<string, unknown>;
  const status = ["idle", "waiting", "matched", "cancelled", "restricted"].includes(String(row.status))
    ? String(row.status) as VideoQueueResult["status"]
    : "idle";
  return {
    status,
    sessionId: row.sessionId ? String(row.sessionId) : undefined,
    retryAfterSeconds: typeof row.retryAfterSeconds === "number" ? row.retryAfterSeconds : undefined,
    restrictionReason: row.restrictionReason ? String(row.restrictionReason) : undefined,
  };
}

async function mapSession(client: SupabaseClient, value: unknown): Promise<VideoSessionSummary> {
  const row = (value || {}) as Record<string, unknown>;
  const peer = (row.peer || {}) as Record<string, unknown>;
  const [avatarUrl, bannerUrl] = await Promise.all([
    signedProfileMedia(client, "profile-avatars", peer.avatarPath ? String(peer.avatarPath) : null),
    signedProfileMedia(client, "profile-banners", peer.bannerPath ? String(peer.bannerPath) : null),
  ]);
  return {
    id: String(row.id),
    roomName: String(row.roomName),
    status: String(row.status || "connecting") as VideoSessionSummary["status"],
    createdAt: String(row.createdAt || new Date().toISOString()),
    connectedAt: row.connectedAt ? String(row.connectedAt) : null,
    endedAt: row.endedAt ? String(row.endedAt) : null,
    hiddenUntilReview: Boolean(row.hiddenUntilReview),
    peer: {
      id: String(peer.id),
      username: String(peer.username || "vybe_user"),
      displayName: String(peer.displayName || peer.username || "VYBE member"),
      avatarUrl,
      bannerUrl,
      bio: String(peer.bio || "New to VYBE."),
      status: String(peer.status || "✨ Looking for new friends"),
      interests: Array.isArray(peer.interests) ? peer.interests as Interest[] : [],
      ageBracket: String(peer.ageBracket || "13-15") as VideoSessionSummary["peer"]["ageBracket"],
      compatibilityScore: Number(peer.compatibilityScore || 45),
      locationLabel: peer.locationLabel ? String(peer.locationLabel) : null,
    },
  };
}

class SupabaseVideoService implements VideoService {
  provider = "livekit" as const;
  private get client() {
    return createClient();
  }
  private lastQueueFingerprint = "";

  private log(event: string, details: Record<string, unknown> = {}) {
    if (process.env.NEXT_PUBLIC_VIDEO_DEBUG_LOGS === "false") return;
    // Deliberately exclude tokens, raw media, exact location, IP, and device data.
    console.info(`[VYBE video] ${event}`, details);
  }

  async loadPreferences(): Promise<VideoMatchPreferences> {
    const user = await requireUser(this.client);
    const { data, error } = await this.client
      .from("video_match_preferences")
      .select("gender_preference,location_filter,camera_enabled,microphone_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    assertNoError(error, "Unable to load video preferences");
    if (!data) return DEFAULT_PREFERENCES;
    return {
      genderPreference: data.gender_preference as VideoMatchPreferences["genderPreference"],
      locationFilter: data.location_filter as VideoMatchPreferences["locationFilter"],
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
    assertNoError(error, "Unable to save video preferences");
  }

  async joinQueue(preferences: VideoMatchPreferences) {
    this.log("queue join requested", {
      genderPreference: preferences.genderPreference,
      locationFilter: preferences.locationFilter,
      cameraEnabled: preferences.cameraEnabled,
      microphoneEnabled: preferences.microphoneEnabled,
    });
    const { data, error } = await this.client.rpc("join_video_queue", {
      gender_value: preferences.genderPreference,
      location_value: preferences.locationFilter,
      camera_value: preferences.cameraEnabled,
      microphone_value: preferences.microphoneEnabled,
    });
    if (error) this.log("queue join failed", { message: error.message });
    assertNoError(error, "Unable to join video matching");
    const result = mapQueueResult(data);
    this.log("queue join result", {
      status: result.status,
      sessionId: result.sessionId,
      diagnostic: (data as Record<string, unknown> | null)?.diagnostic,
      eligibilitySummary: (data as Record<string, unknown> | null)?.eligibilitySummary,
    });
    return result;
  }

  async getQueueStatus() {
    const { data, error } = await this.client.rpc("get_video_queue_status");
    if (error) this.log("queue status failed", { message: error.message });
    assertNoError(error, "Unable to read matching status");
    const result = mapQueueResult(data);
    const fingerprint = JSON.stringify({
      status: result.status,
      sessionId: result.sessionId || null,
      diagnostic: (data as Record<string, unknown> | null)?.diagnostic || null,
      eligibilitySummary: (data as Record<string, unknown> | null)?.eligibilitySummary || null,
    });
    if (fingerprint !== this.lastQueueFingerprint) {
      this.lastQueueFingerprint = fingerprint;
      this.log("queue status delivered", JSON.parse(fingerprint) as Record<string, unknown>);
    }
    return result;
  }

  async heartbeatQueue() {
    const { error } = await this.client.rpc("heartbeat_video_queue");
    if (error) this.log("queue heartbeat failed", { message: error.message });
    assertNoError(error, "Unable to keep matching active");
  }

  async leaveQueue() {
    this.log("queue leave requested");
    const { error } = await this.client.rpc("leave_video_queue");
    if (error) this.log("queue leave failed", { message: error.message });
    assertNoError(error, "Unable to leave matching");
    this.lastQueueFingerprint = "";
    this.log("queue left");
  }

  async loadSession(sessionId: string) {
    const { data, error } = await this.client.rpc("get_video_session_state", { target_session: sessionId });
    assertNoError(error, "Unable to load video session");
    return mapSession(this.client, data);
  }

  async getConnectionToken(sessionId: string): Promise<VideoTokenResponse> {
    this.log("LiveKit token requested", { sessionId });
    const response = await fetch(`/api/video/token?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      this.log("LiveKit token denied", { sessionId, status: response.status, message: payload.error });
      throw new Error(payload.error || "Unable to authorize video session");
    }
    const session = await mapSession(this.client, payload.session);
    this.log("LiveKit token issued", {
      sessionId,
      roomName: session.roomName,
      serverConfigured: Boolean(payload.server_url),
    });
    return {
      serverUrl: String(payload.server_url),
      participantToken: String(payload.participant_token),
      session,
    };
  }

  async markConnected(sessionId: string) {
    await this.updateParticipantState(sessionId, {
      connected: true,
      quality: "unknown",
      cameraEnabled: true,
      microphoneEnabled: true,
    });
  }

  async updateParticipantState(sessionId: string, state: { connected: boolean; quality: "unknown" | "excellent" | "good" | "poor" | "lost"; cameraEnabled: boolean; microphoneEnabled: boolean }) {
    const { error } = await this.client.rpc("update_video_participant_state", {
      target_session: sessionId,
      connected: state.connected,
      quality_value: state.quality,
      camera_value: state.cameraEnabled,
      microphone_value: state.microphoneEnabled,
    });
    assertNoError(error, "Unable to update video state");
  }

  async endSession(sessionId: string, reason: "skip" | "end" | "disconnect" | "block" | "report") {
    const { error } = await this.client.rpc("end_video_session", { target_session: sessionId, end_value: reason });
    assertNoError(error, "Unable to end video session");
  }

  async logEvent(sessionId: string, eventType: string, metadata: Record<string, unknown> = {}) {
    const { error } = await this.client.rpc("log_video_session_event", {
      target_session: sessionId,
      event_name: eventType,
      event_metadata: metadata,
    });
    if (error && !error.message.toLowerCase().includes("rate")) throw new Error(error.message);
  }

  async moderateFrame(sessionId: string, frameDataUrl: string) {
    const data = await invokeAuthenticatedFunction<{ hidden?: boolean; flagged?: boolean }>(
      this.client,
      "moderate-content",
      { action: "moderate_video_frame", sessionId, frameDataUrl },
      "Unable to run video safety check",
    );
    return { hidden: Boolean(data.hidden), flagged: Boolean(data.flagged) };
  }

  async subscribeQueue(onChange: () => void) {
    const user = await requireUser(this.client);
    const channel = this.client
      .channel(`video-queue-db:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_match_queue", filter: `user_id=eq.${user.id}` },
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
      this.log("queue Realtime unsubscribed");
      void this.client.removeChannel(channel);
    };
  }

  async subscribeSession(sessionId: string, onChange: () => void) {
    const channels: RealtimeChannel[] = [
      this.client.channel(`video-session-db:${sessionId}`).on("postgres_changes", { event: "*", schema: "public", table: "video_sessions", filter: `id=eq.${sessionId}` }, onChange).subscribe(),
      this.client.channel(`video-participants-db:${sessionId}`).on("postgres_changes", { event: "*", schema: "public", table: "video_session_participants", filter: `session_id=eq.${sessionId}` }, onChange).subscribe(),
    ];
    return () => { channels.forEach((channel) => { void this.client.removeChannel(channel); }); };
  }
}

let service: SupabaseVideoService | null = null;
export function getSupabaseVideoService() {
  service ??= new SupabaseVideoService();
  return service;
}

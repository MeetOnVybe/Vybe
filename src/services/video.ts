import { getDataMode } from "@/lib/data-mode";
import { SIM_USERS } from "@/lib/mock-data";
import type { VideoService } from "@/services/contracts";
import { getSupabaseVideoService } from "@/services/supabase/video";
import type { VideoMatchPreferences, VideoQueueResult, VideoSessionSummary } from "@/types";

let demoPreferences: VideoMatchPreferences = {
  genderPreference: "everyone",
  locationFilter: "anywhere",
  cameraEnabled: true,
  microphoneEnabled: true,
};
let demoQueue: VideoQueueResult = { status: "idle" };
const demoPeer = SIM_USERS[0];
const demoSession: VideoSessionSummary = {
  id: "demo-video-session",
  roomName: "vybe_demo_room",
  status: "active",
  createdAt: new Date().toISOString(),
  connectedAt: new Date().toISOString(),
  hiddenUntilReview: false,
  peer: {
    id: demoPeer.id,
    username: demoPeer.username,
    displayName: demoPeer.displayName,
    avatarUrl: demoPeer.avatar.image,
    bannerUrl: demoPeer.banner,
    bio: demoPeer.bio,
    status: demoPeer.status,
    interests: demoPeer.interests,
    ageBracket: demoPeer.ageBracket,
    compatibilityScore: 94,
    locationLabel: "United States",
  },
};

export const mockVideoService: VideoService = {
  provider: "mock",
  async loadPreferences() { return demoPreferences; },
  async savePreferences(preferences) { demoPreferences = preferences; },
  async joinQueue(preferences) {
    demoPreferences = preferences;
    demoQueue = { status: "waiting" };
    await new Promise((resolve) => setTimeout(resolve, 850));
    demoQueue = { status: "matched", sessionId: demoSession.id };
    return demoQueue;
  },
  async getQueueStatus() { return demoQueue; },
  async heartbeatQueue() {},
  async leaveQueue() { demoQueue = { status: "cancelled" }; },
  async loadSession() { return demoSession; },
  async getConnectionToken() { throw new Error("LiveKit tokens are only used in Supabase mode."); },
  async markConnected() {},
  async updateParticipantState() {},
  async endSession() { demoQueue = { status: "idle" }; },
  async logEvent() {},
  async moderateFrame() { return { hidden: false, flagged: false }; },
  async subscribeQueue() { return () => {}; },
  async subscribeSession() { return () => {}; },
};

export function getVideoService(): VideoService {
  return getDataMode() === "supabase" ? getSupabaseVideoService() : mockVideoService;
}

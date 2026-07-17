"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getDataMode } from "@/lib/data-mode";
import {
  AVATAR_OPTIONS,
  BANNER_OPTIONS,
  INTERESTS,
  SIM_USERS,
} from "@/lib/mock-data";
import {
  chatService,
  getSupabasePlatformService,
  matchmakingService,
  profileService,
  supabaseAuthService,
} from "@/services";
import type { CreateStoryInput, SendMessageInput } from "@/services/contracts";
import type {
  AgeBracket,
  CloudSnapshot,
  DiscoveryFilters,
  CurrentProfile,
  GroupConversation,
  Interest,
  Message,
  ModerationAppeal,
  ModerationCase,
  ModerationLog,
  AdminUserSummary,
  NotificationItem,
  ReportRecord,
  SimUser,
  StoryItem,
  UserSettings,
  VybeMatch,
} from "@/types";

const CURRENT_USER_ID = "me";
const DATA_MODE = getDataMode();
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const initialProfile: CurrentProfile = {
  username: "You",
  displayName: "Your VYBE",
  bio: "Here to meet cool people, talk about shared interests, and keep the energy positive.",
  status: "✨ Looking for new friends",
  profileImage: null,
  profileImagePath: null,
  avatarChoice: AVATAR_OPTIONS[0],
  bannerChoice: BANNER_OPTIONS[0],
  bannerPath: null,
  favoriteMusic: "",
  favoriteGames: [],
  favoriteHobbies: [],
  schoolGrade: "",
  pronouns: "",
  favoriteSports: [],
  accentColor: "#1686ff",
  profileBadges: ["Early VYBE"],
  profileCompletion: 62,
  videoGender: "girl",
  countryCode: "",
  countryName: "",
  stateRegion: "",
  city: "",
  locationVisibility: "hidden",
};

const initialSettings: UserSettings = {
  notificationsEnabled: true,
  profileInteractionNotifications: false,
  soundEnabled: true,
  animationsEnabled: true,
  hapticsEnabled: true,
  showOnlineStatus: true,
  presenceVisibility: "precise",
  profileVisibility: "everyone",
  messagePrivacy: "friends",
  storyPrivacy: "friends",
  onlineStatusPrivacy: "friends",
  readReceipts: true,
  allowFriendRequests: true,
  profileLikesEnabled: false,
  blurSensitivePreviews: false,
  safetyReminders: true,
  glowIntensity: "full",
  compactMode: false,
  themePreference: "system",
  repeatPrevention: true,
};

const initialDiscoveryFilters: DiscoveryFilters = {
  interests: [],
  onlineOnly: false,
  sort: "random",
  offset: 0,
  limit: 20,
};
const DEMO_REVERSE_LIKES = new Set(["u-zay", "u-kai", "u-jules", "u-riri"]);

function defaultMessages(): Record<string, Message[]> {
  return {
    "u-kai": [
      {
        id: "seed-1",
        senderId: "u-kai",
        text: "Yo, good match 😂",
        createdAt: "2026-07-15T20:00:00.000Z",
        read: false,
        deliveryStatus: "delivered",
        reactions: { "😂": 1 },
      },
      {
        id: "seed-2",
        senderId: CURRENT_USER_ID,
        text: "Fr, your 2K take was wild though",
        createdAt: "2026-07-15T20:03:00.000Z",
        read: true,
        deliveryStatus: "read",
        reactions: {},
      },
    ],
  };
}

function defaultStories(): StoryItem[] {
  const now = Date.now();
  return [
    {
      id: "story-kai",
      userId: "u-kai",
      mediaType: "text",
      text: "Open gym at 6 🏀",
      backgroundColor: "#1686ff",
      createdAt: new Date(now - 18 * 60_000).toISOString(),
      expiresAt: new Date(now + 22 * 60 * 60_000).toISOString(),
      viewed: false,
      reactionCounts: { "🔥": 2 },
    },
    {
      id: "story-ace",
      userId: "u-ace",
      mediaType: "photo",
      mediaUrl: "/banners/creator-room.svg",
      text: "New edit loading…",
      backgroundColor: "#0b5dba",
      createdAt: new Date(now - 55 * 60_000).toISOString(),
      expiresAt: new Date(now + 21 * 60 * 60_000).toISOString(),
      viewed: true,
      reactionCounts: { "💙": 1 },
    },
    {
      id: "story-me",
      userId: CURRENT_USER_ID,
      mediaType: "text",
      text: "Welcome to my VYBE ✨",
      backgroundColor: "#0d47a1",
      createdAt: new Date(now - 90 * 60_000).toISOString(),
      expiresAt: new Date(now + 20 * 60 * 60_000).toISOString(),
      viewed: true,
      reactionCounts: {},
      viewerCount: 3,
    },
  ];
}

function defaultGroups(): GroupConversation[] {
  return [
    {
      id: "demo-group-1",
      title: "After School VYBE",
      iconUrl: "/banners/electric-sky.svg",
      ownerId: CURRENT_USER_ID,
      memberIds: [CURRENT_USER_ID, "u-kai", "u-ace"],
      invitedIds: [],
      createdAt: "2026-07-16T14:00:00.000Z",
      lastMessageAt: "2026-07-16T15:21:00.000Z",
      muted: false,
      pinnedMessageIds: ["group-seed-1"],
    },
  ];
}

function defaultGroupMessages(): Record<string, Message[]> {
  return {
    "demo-group-1": [
      {
        id: "group-seed-1",
        conversationId: "demo-group-1",
        senderId: "u-kai",
        text: "Who’s trying to run after school?",
        type: "text",
        createdAt: "2026-07-16T15:18:00.000Z",
        read: true,
        deliveryStatus: "read",
        reactions: { "🏀": 2 },
        pinned: true,
        seenByCount: 2,
      },
      {
        id: "group-seed-2",
        conversationId: "demo-group-1",
        senderId: "u-ace",
        text: "I’m down after I finish this edit",
        type: "text",
        createdAt: "2026-07-16T15:21:00.000Z",
        read: false,
        deliveryStatus: "delivered",
        reactions: {},
      },
    ],
  };
}

function compatibilityFor(user: SimUser, mine: Interest[]) {
  const shared = user.interests.filter((interest) =>
    mine.includes(interest),
  ).length;
  const total = Math.max(1, user.interests.length + mine.length);
  return Math.min(
    99,
    Math.max(45, 45 + Math.round(((2 * shared) / total) * 54)),
  );
}

function playTone(kind: "match" | "message" | "friend") {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies =
      kind === "match"
        ? [420, 620]
        : kind === "friend"
          ? [520, 740]
          : [480, 560];
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequencies[0], context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequencies[1],
      context.currentTime + 0.16,
    );
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.23);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Audio remains optional and browser-controlled.
  }
}

interface VybeState {
  dataMode: "demo" | "supabase";
  signedIn: boolean;
  cloudReady: boolean;
  cloudLoading: boolean;
  cloudError: string | null;
  currentUserId: string | null;
  username: string;
  email: string;
  ageBracket: AgeBracket;
  interests: Interest[];
  profile: CurrentProfile;
  settings: UserSettings;
  people: SimUser[];
  searchResults: SimUser[];
  searchingMembers: boolean;
  searchHasMore: boolean;
  lastSearchQuery: string;
  discoveryProfiles: SimUser[];
  discoveryLoading: boolean;
  discoveryError: string | null;
  discoveryFilters: DiscoveryFilters;
  swipeDecisions: Record<string, "like" | "pass">;
  lastPassedIds: string[];
  matches: VybeMatch[];
  matchStatuses: Record<string, "active" | "unmatched">;
  matchCelebrationUserId: string | null;
  muted: boolean;
  cameraOff: boolean;
  finding: boolean;
  matchFoundPulse: boolean;
  currentSoloId: string | null;
  currentGroupIds: string[];
  friendStatuses: Record<string, "pending" | "friends" | "blocked">;
  incomingRequestIds: string[];
  requestIdsByUser: Record<string, string>;
  conversationIdsByUser: Record<string, string>;
  messages: Record<string, Message[]>;
  stories: StoryItem[];
  groups: GroupConversation[];
  groupMessages: Record<string, Message[]>;
  mutedConversationIds: string[];
  isAdmin: boolean;
  moderationCases: ModerationCase[];
  moderationAppeals: ModerationAppeal[];
  moderationLogs: ModerationLog[];
  adminUsers: AdminUserSummary[];
  typingUsers: Record<string, boolean>;
  notifications: NotificationItem[];
  reports: ReportRecord[];
  blockedIds: string[];
  toast: string | null;
  countryFilter: string;
  languageFilter: string;
  interestFilter: string;
  setAuth: (username: string, email: string) => void;
  login: () => void;
  logout: () => Promise<void>;
  hydrateCloud: () => Promise<void>;
  applyCloudSnapshot: (snapshot: CloudSnapshot) => void;
  searchMembers: (query: string) => Promise<void>;
  loadMoreMembers: () => Promise<void>;
  clearMemberSearch: () => void;
  loadDiscovery: () => Promise<void>;
  setDiscoveryFilters: (filters: Partial<DiscoveryFilters>) => void;
  decideProfile: (userId: string, decision: "like" | "pass") => Promise<void>;
  undoPass: () => Promise<void>;
  dismissMatchCelebration: () => void;
  unmatch: (matchId: string) => Promise<void>;
  setAgeBracket: (age: AgeBracket) => void;
  toggleInterest: (interest: Interest) => void;
  setInterests: (interests: Interest[]) => void;
  completeInterests: () => Promise<void>;
  updateProfile: (profile: CurrentProfile) => Promise<void>;
  uploadProfileMedia: (
    kind: "avatar" | "banner",
    file: File,
    previousPath?: string | null,
  ) => Promise<string>;
  deleteProfileMedia: (
    kind: "avatar" | "banner",
    path: string,
  ) => Promise<void>;
  setSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => void;
  setFilters: (
    filter: "country" | "language" | "interest",
    value: string,
  ) => void;
  startSoloMatch: () => void;
  skipSolo: () => void;
  startGroupMatch: () => void;
  skipGroup: () => void;
  toggleMuted: () => void;
  toggleCamera: () => void;
  sendFriendRequest: (userId: string) => Promise<void>;
  acceptFriendRequest: (userId: string) => Promise<void>;
  declineFriendRequest: (userId: string) => Promise<void>;
  cancelFriendRequest: (userId: string) => Promise<void>;
  unfriend: (userId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  reportUser: (userId: string, reason: string, notes: string) => Promise<void>;
  reportContent: (
    userId: string,
    targetType: "profile" | "message" | "story" | "group" | "video_session",
    targetId: string,
    reason: string,
    notes: string,
  ) => Promise<void>;
  sendMessage: (
    userId: string,
    text: string,
    options?: Partial<SendMessageInput>,
  ) => Promise<void>;
  sendGroupMessage: (
    groupId: string,
    text: string,
    options?: Partial<SendMessageInput>,
  ) => Promise<void>;
  uploadConversationMedia: (
    kind: "voice" | "image",
    conversationId: string,
    file: Blob,
    filename: string,
  ) => Promise<string>;
  reactToMessage: (
    userId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  reactToGroupMessage: (
    groupId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  deleteMessageForMe: (
    threadId: string,
    messageId: string,
    group?: boolean,
  ) => Promise<void>;
  deleteMessageForEveryone: (
    threadId: string,
    messageId: string,
    group?: boolean,
  ) => Promise<void>;
  toggleMessagePin: (
    threadId: string,
    messageId: string,
    pinned: boolean,
    group?: boolean,
  ) => Promise<void>;
  setConversationMuted: (
    conversationId: string,
    muted: boolean,
  ) => Promise<void>;
  markChatRead: (userId: string) => Promise<void>;
  markGroupRead: (groupId: string) => Promise<void>;
  createStory: (input: CreateStoryInput, file?: File) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  viewStory: (storyId: string) => Promise<void>;
  reactToStory: (storyId: string, emoji: string) => Promise<void>;
  replyToStory: (storyId: string, text: string) => Promise<void>;
  createGroup: (title: string, memberIds: string[]) => Promise<string>;
  respondGroupInvite: (groupId: string, accept: boolean) => Promise<void>;
  updateGroup: (
    groupId: string,
    title?: string,
    iconFile?: File,
  ) => Promise<void>;
  removeGroupMember: (groupId: string, memberId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  likeProfile: (userId: string) => Promise<void>;
  loadAdminData: () => Promise<void>;
  searchAdminUsers: (query: string) => Promise<void>;
  moderateCase: (
    caseId: string,
    action:
      | "warn"
      | "suspend"
      | "ban"
      | "delete_message"
      | "delete_story"
      | "dismiss"
      | "restore",
    notes?: string,
  ) => Promise<void>;
  moderateUser: (
    userId: string,
    action: "warn" | "suspend" | "ban" | "restore",
    notes?: string,
  ) => Promise<void>;
  reviewAppeal: (
    appealId: string,
    decision: "approved" | "denied",
    notes?: string,
  ) => Promise<void>;
  submitAppeal: (reason: string) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  recordProfileInteraction: (userId: string) => Promise<void>;
  setTyping: (userId: string, typing: boolean) => void;
  clearToast: () => void;
  resetDemo: () => void;
}

type PersistedVybeState = Partial<
  Pick<
    VybeState,
    | "signedIn"
    | "username"
    | "email"
    | "ageBracket"
    | "interests"
    | "profile"
    | "settings"
    | "friendStatuses"
    | "incomingRequestIds"
    | "requestIdsByUser"
    | "conversationIdsByUser"
    | "messages"
    | "stories"
    | "groups"
    | "groupMessages"
    | "mutedConversationIds"
    | "notifications"
    | "reports"
    | "blockedIds"
    | "countryFilter"
    | "languageFilter"
    | "interestFilter"
    | "discoveryFilters"
    | "swipeDecisions"
    | "lastPassedIds"
    | "matches"
    | "matchStatuses"
  >
> & { dataMode?: "demo" | "supabase" };

const demoSocialState: Pick<
  VybeState,
  | "friendStatuses"
  | "incomingRequestIds"
  | "requestIdsByUser"
  | "conversationIdsByUser"
  | "messages"
  | "stories"
  | "groups"
  | "groupMessages"
  | "mutedConversationIds"
  | "isAdmin"
  | "moderationCases"
  | "moderationAppeals"
  | "moderationLogs"
  | "adminUsers"
  | "notifications"
> = {
  friendStatuses: { "u-kai": "friends" as const },
  incomingRequestIds: ["u-ace"],
  requestIdsByUser: {},
  conversationIdsByUser: {},
  messages: defaultMessages(),
  stories: defaultStories(),
  groups: defaultGroups(),
  groupMessages: defaultGroupMessages(),
  mutedConversationIds: [],
  isAdmin: true,
  moderationCases: [
    {
      id: "demo-flag-1",
      sourceType: "message",
      sourceId: "demo-hidden-message",
      subjectUserId: "u-nova",
      reporterId: null,
      categories: ["harassment"],
      severity: "high",
      status: "pending",
      hidden: true,
      summary:
        "A potentially severe message was hidden automatically pending review.",
      createdAt: "2026-07-16T14:40:00.000Z",
      updatedAt: "2026-07-16T14:40:00.000Z",
    },
  ],
  moderationAppeals: [
    {
      id: "appeal-demo",
      userId: "u-zay",
      enforcementStatus: "suspended",
      reason:
        "I believe the context was misunderstood and I want a second review.",
      status: "pending",
      createdAt: "2026-07-16T16:20:00.000Z",
    },
  ],
  moderationLogs: [],
  adminUsers: [],
  notifications: [
    {
      id: "welcome",
      type: "system" as const,
      title: "Welcome to VYBE",
      body: "Your safety controls are always one tap away.",
      createdAt: "2026-07-15T19:00:00.000Z",
      read: false,
    },
    {
      id: "incoming-ace",
      type: "friend" as const,
      title: "New friend request",
      body: "AceClips wants to connect after your last match.",
      createdAt: "2026-07-15T19:48:00.000Z",
      read: false,
      userId: "u-ace",
    },
  ],
};

export const useVybeStore = create<VybeState>()(
  persist<VybeState, [], [], PersistedVybeState>(
    (set, get) => ({
      dataMode: DATA_MODE,
      signedIn: false,
      cloudReady: false,
      cloudLoading: false,
      cloudError: null,
      currentUserId: null,
      username: "You",
      email: "",
      ageBracket: "13-15",
      interests: ["Gaming", "Music", "Basketball", "Chill"],
      profile: initialProfile,
      settings: initialSettings,
      people: DATA_MODE === "demo" ? SIM_USERS : [],
      searchResults: [],
      searchingMembers: false,
      searchHasMore: false,
      lastSearchQuery: "",
      discoveryProfiles: [],
      discoveryLoading: false,
      discoveryError: null,
      discoveryFilters: initialDiscoveryFilters,
      swipeDecisions: {},
      lastPassedIds: [],
      matches: [],
      matchStatuses: {},
      matchCelebrationUserId: null,
      muted: false,
      cameraOff: false,
      finding: false,
      matchFoundPulse: false,
      currentSoloId: null,
      currentGroupIds: [],
      ...(DATA_MODE === "demo"
        ? demoSocialState
        : {
            friendStatuses: {},
            matchStatuses: {},
            matches: [],
            incomingRequestIds: [],
            requestIdsByUser: {},
            conversationIdsByUser: {},
            messages: {},
            stories: [],
            groups: [],
            groupMessages: {},
            mutedConversationIds: [],
            isAdmin: false,
            moderationCases: [],
            moderationAppeals: [],
            moderationLogs: [],
            adminUsers: [],
            notifications: [],
          }),
      typingUsers: {},
      reports: [],
      blockedIds: [],
      toast: null,
      countryFilter: "Random",
      languageFilter: "Random",
      interestFilter: "Random",

      setAuth: (username, email) => {
        if (DATA_MODE !== "demo") return;
        const safeUsername = username.trim() || "You";
        set((state) => ({
          signedIn: true,
          username: safeUsername,
          email,
          profile: {
            ...state.profile,
            username: safeUsername,
            displayName: safeUsername,
          },
        }));
      },
      login: () => {
        if (DATA_MODE === "demo") set({ signedIn: true });
      },
      logout: async () => {
        if (DATA_MODE === "supabase") await supabaseAuthService.logout();
        set({
          signedIn: false,
          cloudReady: false,
          currentUserId: null,
          people: DATA_MODE === "demo" ? SIM_USERS : [],
          friendStatuses: {},
          matchStatuses: {},
          matches: [],
          discoveryProfiles: [],
          incomingRequestIds: [],
          messages: {},
          stories: [],
          groups: [],
          groupMessages: {},
          mutedConversationIds: [],
          isAdmin: false,
          moderationCases: [],
          moderationAppeals: [],
          moderationLogs: [],
          adminUsers: [],
          notifications: [],
          toast: "Logged out",
        });
      },
      applyCloudSnapshot: (snapshot) => {
        const blockedIds = Object.entries(snapshot.friendStatuses)
          .filter(([, status]) => status === "blocked")
          .map(([id]) => id);
        set({
          signedIn: true,
          cloudReady: true,
          cloudLoading: false,
          cloudError: null,
          currentUserId: snapshot.currentUserId,
          username: snapshot.currentProfile.username,
          ageBracket: snapshot.profile.age_bracket || "13-15",
          interests: (snapshot.profile.interests || []) as Interest[],
          profile: snapshot.currentProfile,
          settings: snapshot.settings || get().settings,
          people: snapshot.people,
          friendStatuses: snapshot.friendStatuses,
          matchStatuses: snapshot.matchStatuses,
          matches: snapshot.matches,
          incomingRequestIds: snapshot.incomingRequestIds,
          requestIdsByUser: snapshot.requestIdsByUser,
          conversationIdsByUser: snapshot.conversationIdsByUser,
          messages: snapshot.messages,
          stories: snapshot.stories || [],
          groups: snapshot.groups || [],
          groupMessages: snapshot.groupMessages || {},
          mutedConversationIds: snapshot.mutedConversationIds || [],
          isAdmin: Boolean(snapshot.isAdmin),
          notifications: snapshot.notifications,
          blockedIds,
        });
      },
      hydrateCloud: async () => {
        if (DATA_MODE !== "supabase" || get().cloudLoading) return;
        set({ cloudLoading: true, cloudError: null });
        try {
          const snapshot = await getSupabasePlatformService().loadSnapshot();
          get().applyCloudSnapshot(snapshot);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to connect to Supabase";
          set({ cloudLoading: false, cloudError: message, cloudReady: false });
        }
      },
      searchMembers: async (query) => {
        const clean = query.trim().toLowerCase();
        if (clean.length < 2) {
          set({
            searchResults: [],
            searchingMembers: false,
            searchHasMore: false,
            lastSearchQuery: "",
          });
          return;
        }
        set({ searchingMembers: true, lastSearchQuery: clean });
        try {
          const results =
            DATA_MODE === "supabase"
              ? await getSupabasePlatformService().searchProfiles(clean, 0, 20)
              : SIM_USERS.filter(
                  (user) =>
                    user.ageBracket === get().ageBracket &&
                    !get().blockedIds.includes(user.id) &&
                    `${user.username} ${user.displayName} ${user.interests.join(" ")}`
                      .toLowerCase()
                      .includes(clean),
                )
                  .map((user) => ({
                    ...user,
                    compatibilityScore: compatibilityFor(user, get().interests),
                  }))
                  .slice(0, 20);
          set({
            searchResults: results,
            searchingMembers: false,
            searchHasMore: DATA_MODE === "supabase" && results.length === 20,
          });
        } catch (error) {
          set({
            searchingMembers: false,
            toast: error instanceof Error ? error.message : "Search failed",
          });
        }
      },
      loadMoreMembers: async () => {
        const state = get();
        if (
          state.searchingMembers ||
          !state.searchHasMore ||
          state.lastSearchQuery.length < 2
        )
          return;
        set({ searchingMembers: true });
        try {
          const next =
            DATA_MODE === "supabase"
              ? await getSupabasePlatformService().searchProfiles(
                  state.lastSearchQuery,
                  state.searchResults.length,
                  20,
                )
              : [];
          set((current) => ({
            searchResults: [
              ...current.searchResults,
              ...next.filter(
                (user) =>
                  !current.searchResults.some(
                    (existing) => existing.id === user.id,
                  ),
              ),
            ],
            searchingMembers: false,
            searchHasMore: next.length === 20,
          }));
        } catch (error) {
          set({
            searchingMembers: false,
            toast:
              error instanceof Error
                ? error.message
                : "Unable to load more results",
          });
        }
      },
      clearMemberSearch: () =>
        set({ searchResults: [], searchHasMore: false, lastSearchQuery: "" }),
      loadDiscovery: async () => {
        const state = get();
        set({ discoveryLoading: true, discoveryError: null });
        try {
          if (DATA_MODE === "supabase") {
            const profiles = await getSupabasePlatformService().loadDiscovery(
              state.discoveryFilters,
            );
            set({ discoveryProfiles: profiles, discoveryLoading: false });
            return;
          }
          const decided = state.settings.repeatPrevention
            ? new Set(Object.keys(state.swipeDecisions))
            : new Set<string>();
          const profiles = SIM_USERS.filter(
            (user) =>
              user.ageBracket === state.ageBracket &&
              !state.blockedIds.includes(user.id) &&
              !decided.has(user.id),
          )
            .filter(
              (user) =>
                !state.discoveryFilters.interests.length ||
                state.discoveryFilters.interests.some((interest) =>
                  user.interests.includes(interest),
                ),
            )
            .filter((user) => !state.discoveryFilters.onlineOnly || user.online)
            .map((user) => ({
              ...user,
              compatibilityScore: compatibilityFor(user, state.interests),
              mutualFriendsCount:
                user.id === "u-kai" ? 2 : user.id === "u-nia" ? 1 : 0,
            }));
          if (state.discoveryFilters.sort === "compatibility")
            profiles.sort(
              (a, b) =>
                (b.compatibilityScore || 0) - (a.compatibilityScore || 0),
            );
          if (state.discoveryFilters.sort === "new") profiles.reverse();
          set({ discoveryProfiles: profiles, discoveryLoading: false });
        } catch (error) {
          set({
            discoveryLoading: false,
            discoveryError:
              error instanceof Error
                ? error.message
                : "Unable to load discovery",
          });
        }
      },
      setDiscoveryFilters: (filters) => {
        set((state) => ({
          discoveryFilters: {
            ...state.discoveryFilters,
            ...filters,
            offset: 0,
          },
        }));
        window.setTimeout(() => void get().loadDiscovery(), 0);
      },
      decideProfile: async (userId, decision) => {
        const person =
          get().discoveryProfiles.find((user) => user.id === userId) ||
          get().people.find((user) => user.id === userId) ||
          SIM_USERS.find((user) => user.id === userId);
        try {
          let matched = false;
          let matchId: string | undefined;
          if (DATA_MODE === "supabase") {
            const result = await getSupabasePlatformService().submitSwipe(
              userId,
              decision,
            );
            matched = result.matched;
            matchId = result.matchId;
          } else {
            matched = decision === "like" && DEMO_REVERSE_LIKES.has(userId);
            if (matched) matchId = `demo-match-${userId}`;
          }
          set((state) => {
            const matches =
              matched &&
              matchId &&
              !state.matches.some((item) => item.id === matchId)
                ? [
                    {
                      id: matchId,
                      userId,
                      status: "active" as const,
                      createdAt: new Date().toISOString(),
                      lastActivityAt: new Date().toISOString(),
                    },
                    ...state.matches,
                  ]
                : state.matches;
            const notifications = matched
              ? [
                  {
                    id: makeId("match"),
                    type: "match" as const,
                    title: "It’s a VYBE",
                    body: `You and ${person?.username || "someone"} liked each other.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    userId,
                    entityId: matchId,
                    href: "/matches",
                  },
                  ...state.notifications,
                ]
              : state.notifications;
            return {
              swipeDecisions: { ...state.swipeDecisions, [userId]: decision },
              lastPassedIds:
                decision === "pass"
                  ? [...state.lastPassedIds.slice(-4), userId]
                  : state.lastPassedIds,
              discoveryProfiles: state.discoveryProfiles.filter(
                (user) => user.id !== userId,
              ),
              matches,
              matchStatuses: matched
                ? { ...state.matchStatuses, [userId]: "active" }
                : state.matchStatuses,
              matchCelebrationUserId: matched
                ? userId
                : state.matchCelebrationUserId,
              notifications,
              toast: matched
                ? null
                : decision === "like"
                  ? "Like sent"
                  : "Passed",
            };
          });
          if (matched && get().settings.soundEnabled) playTone("match");
          if (DATA_MODE === "supabase") await get().hydrateCloud();
        } catch (error) {
          set({
            toast:
              error instanceof Error
                ? error.message
                : "Unable to save decision",
          });
        }
      },
      undoPass: async () => {
        try {
          let targetId: string | null = null;
          if (DATA_MODE === "supabase")
            targetId = await getSupabasePlatformService().undoLastPass();
          else targetId = get().lastPassedIds.at(-1) || null;
          if (!targetId) {
            set({ toast: "No recent pass to undo" });
            return;
          }
          set((state) => {
            const decisions = { ...state.swipeDecisions };
            delete decisions[targetId!];
            return {
              swipeDecisions: decisions,
              lastPassedIds: state.lastPassedIds.filter(
                (id) => id !== targetId,
              ),
              toast: "Last pass restored",
            };
          });
          await get().loadDiscovery();
        } catch (error) {
          set({
            toast:
              error instanceof Error ? error.message : "Unable to undo pass",
          });
        }
      },
      dismissMatchCelebration: () => set({ matchCelebrationUserId: null }),
      unmatch: async (matchId) => {
        const match = get().matches.find((item) => item.id === matchId);
        if (!match) return;
        try {
          if (DATA_MODE === "supabase")
            await getSupabasePlatformService().unmatch(matchId);
          set((state) => ({
            matches: state.matches.map((item) =>
              item.id === matchId
                ? { ...item, status: "unmatched" as const }
                : item,
            ),
            matchStatuses: {
              ...state.matchStatuses,
              [match.userId]: "unmatched",
            },
            toast: "Match ended",
          }));
          if (DATA_MODE === "supabase") await get().hydrateCloud();
        } catch (error) {
          set({
            toast: error instanceof Error ? error.message : "Unable to unmatch",
          });
        }
      },

      setAgeBracket: (ageBracket) => {
        if (DATA_MODE === "supabase") {
          set({
            toast:
              "Your age bracket is calculated securely from your date of birth.",
          });
          return;
        }
        set({
          ageBracket,
          currentSoloId: null,
          currentGroupIds: [],
          incomingRequestIds: ageBracket === "13-15" ? ["u-ace"] : ["u-riri"],
        });
      },
      toggleInterest: (interest) =>
        set((state) => ({
          interests: state.interests.includes(interest)
            ? state.interests.filter((item) => item !== interest)
            : [...state.interests, interest],
        })),
      setInterests: (interests) =>
        set({ interests: interests.length ? interests : [INTERESTS[0]] }),
      completeInterests: async () => {
        if (!get().interests.length) set({ interests: [INTERESTS[0]] });
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().updateProfile(
              get().profile,
              get().interests,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to save interests",
            });
          }
        }
      },
      updateProfile: async (nextProfile) => {
        const profile = profileService.normalize(nextProfile);
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().updateProfile(
              profile,
              get().interests,
            );
            set({
              profile,
              username: profile.username,
              toast: "Profile saved",
            });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to save profile",
            });
            throw error;
          }
          return;
        }
        set({ profile, username: profile.username, toast: "Profile saved" });
      },
      uploadProfileMedia: async (kind, file, previousPath) => {
        if (DATA_MODE !== "supabase")
          throw new Error("Cloud uploads require Supabase mode");
        return getSupabasePlatformService().uploadProfileMedia(
          kind,
          file,
          previousPath,
        );
      },
      deleteProfileMedia: async (kind, path) => {
        if (DATA_MODE !== "supabase") return;
        await getSupabasePlatformService().deleteProfileMedia(kind, path);
      },
      setSetting: (key, value) => {
        const next = { ...get().settings, [key]: value };
        if (key === "themePreference" && typeof window !== "undefined")
          window.localStorage.setItem("vybe-theme", String(value));
        set({ settings: next, toast: "Setting updated" });
        if (DATA_MODE === "supabase")
          void getSupabasePlatformService()
            .updateSettings(next)
            .catch((error) =>
              set({
                toast:
                  error instanceof Error
                    ? error.message
                    : "Unable to save setting",
              }),
            );
      },
      setFilters: (filter, value) => {
        if (filter === "country") set({ countryFilter: value });
        if (filter === "language") set({ languageFilter: value });
        if (filter === "interest") set({ interestFilter: value });
      },

      startSoloMatch: () => {
        set({ finding: true, matchFoundPulse: false });
        window.setTimeout(() => {
          const state = get();
          const selected = matchmakingService.findSolo(
            state.ageBracket,
            state.blockedIds,
            state.currentSoloId,
          );
          set({
            currentSoloId: selected?.id ?? null,
            finding: false,
            matchFoundPulse: true,
          });
          if (state.settings.soundEnabled) playTone("match");
          window.setTimeout(() => set({ matchFoundPulse: false }), 1200);
        }, 1250);
      },
      skipSolo: () => {
        set({
          finding: true,
          matchFoundPulse: false,
          toast: "Finding someone new…",
        });
        window.setTimeout(() => {
          const state = get();
          const selected = matchmakingService.findSolo(
            state.ageBracket,
            state.blockedIds,
            state.currentSoloId,
          );
          set({
            currentSoloId: selected?.id ?? null,
            finding: false,
            matchFoundPulse: true,
            toast: null,
          });
          if (state.settings.soundEnabled) playTone("match");
          window.setTimeout(() => set({ matchFoundPulse: false }), 1200);
        }, 980);
      },
      startGroupMatch: () => {
        set({ finding: true, matchFoundPulse: false });
        window.setTimeout(() => {
          const state = get();
          const selected = matchmakingService.findGroup(
            state.ageBracket,
            state.blockedIds,
            state.currentGroupIds,
          );
          set({
            currentGroupIds: selected.map((user) => user.id),
            finding: false,
            matchFoundPulse: true,
          });
          if (state.settings.soundEnabled) playTone("match");
          window.setTimeout(() => set({ matchFoundPulse: false }), 1200);
        }, 1300);
      },
      skipGroup: () => {
        set({
          finding: true,
          matchFoundPulse: false,
          toast: "Loading a new group…",
        });
        window.setTimeout(() => {
          const state = get();
          const selected = matchmakingService.findGroup(
            state.ageBracket,
            state.blockedIds,
            state.currentGroupIds,
          );
          set({
            currentGroupIds: selected.map((user) => user.id),
            finding: false,
            matchFoundPulse: true,
            toast: null,
          });
          if (state.settings.soundEnabled) playTone("match");
          window.setTimeout(() => set({ matchFoundPulse: false }), 1200);
        }, 980);
      },
      toggleMuted: () =>
        set((state) => ({
          muted: !state.muted,
          toast: state.muted ? "Microphone on" : "Microphone muted",
        })),
      toggleCamera: () =>
        set((state) => ({
          cameraOff: !state.cameraOff,
          toast: state.cameraOff ? "Camera on" : "Camera off",
        })),

      sendFriendRequest: async (userId) => {
        if (DATA_MODE === "supabase") {
          if (userId.startsWith("u-")) {
            set({
              toast: "Demo match profiles cannot be added to a real account.",
            });
            return;
          }
          try {
            await getSupabasePlatformService().sendFriendRequest(userId);
            set({ toast: "Friend request sent" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to send request",
            });
          }
          return;
        }
        const state = get();
        if (!state.settings.allowFriendRequests) {
          set({ toast: "Friend requests are disabled in Settings" });
          return;
        }
        if (state.friendStatuses[userId] === "friends") {
          set({ toast: "You’re already friends" });
          return;
        }
        set((current) => ({
          friendStatuses: { ...current.friendStatuses, [userId]: "pending" },
          toast: "Friend request sent",
        }));
        window.setTimeout(() => {
          if (get().friendStatuses[userId] !== "pending") return;
          const user = SIM_USERS.find((item) => item.id === userId);
          set((latest) => ({
            friendStatuses: { ...latest.friendStatuses, [userId]: "friends" },
            toast: `${user?.username ?? "They"} accepted your request`,
            notifications: [
              {
                id: makeId("notif"),
                type: "friend",
                title: "Friend request accepted",
                body: `${user?.username ?? "A new friend"} is now in your friends list.`,
                createdAt: new Date().toISOString(),
                read: false,
                userId,
              },
              ...latest.notifications,
            ],
            messages: {
              ...latest.messages,
              [userId]: latest.messages[userId] ?? [
                {
                  id: makeId("msg"),
                  senderId: userId,
                  text: "Yo! Glad we matched 👋",
                  createdAt: new Date().toISOString(),
                  read: false,
                  deliveryStatus: "delivered",
                  reactions: {},
                },
              ],
            },
          }));
          if (get().settings.soundEnabled) playTone("friend");
        }, 1850);
      },
      acceptFriendRequest: async (userId) => {
        if (DATA_MODE === "supabase") {
          const requestId = get().requestIdsByUser[userId];
          if (!requestId) return;
          try {
            await getSupabasePlatformService().acceptFriendRequest(requestId);
            set({ toast: "Friend added" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to accept request",
            });
          }
          return;
        }
        set((state) => ({
          incomingRequestIds: state.incomingRequestIds.filter(
            (id) => id !== userId,
          ),
          friendStatuses: { ...state.friendStatuses, [userId]: "friends" },
          toast: "Friend added",
        }));
      },
      declineFriendRequest: async (userId) => {
        if (DATA_MODE === "supabase") {
          const requestId = get().requestIdsByUser[userId];
          if (!requestId) return;
          try {
            await getSupabasePlatformService().declineFriendRequest(requestId);
            set({ toast: "Request declined" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to decline request",
            });
          }
          return;
        }
        set((state) => ({
          incomingRequestIds: state.incomingRequestIds.filter(
            (id) => id !== userId,
          ),
          toast: "Request declined",
        }));
      },
      cancelFriendRequest: async (userId) => {
        if (DATA_MODE === "supabase") {
          const requestId = get().requestIdsByUser[userId];
          if (!requestId) return;
          try {
            await getSupabasePlatformService().cancelFriendRequest(requestId);
            set({ toast: "Request canceled" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to cancel request",
            });
          }
          return;
        }
        set((state) => {
          const statuses = { ...state.friendStatuses };
          delete statuses[userId];
          return { friendStatuses: statuses, toast: "Request canceled" };
        });
      },
      unfriend: async (userId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().unfriend(userId);
            set({ toast: "Friend removed" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error ? error.message : "Unable to unfriend",
            });
          }
          return;
        }
        set((state) => {
          const statuses = { ...state.friendStatuses };
          delete statuses[userId];
          return { friendStatuses: statuses, toast: "Friend removed" };
        });
      },
      blockUser: async (userId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().block(userId);
            set({ toast: "User blocked" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error ? error.message : "Unable to block user",
            });
          }
          return;
        }
        set((state) => ({
          blockedIds: Array.from(new Set([...state.blockedIds, userId])),
          incomingRequestIds: state.incomingRequestIds.filter(
            (id) => id !== userId,
          ),
          friendStatuses: { ...state.friendStatuses, [userId]: "blocked" },
          matchStatuses: { ...state.matchStatuses, [userId]: "unmatched" },
          matches: state.matches.map((match) =>
            match.userId === userId
              ? { ...match, status: "unmatched" as const }
              : match,
          ),
          discoveryProfiles: state.discoveryProfiles.filter(
            (person) => person.id !== userId,
          ),
          currentSoloId:
            state.currentSoloId === userId ? null : state.currentSoloId,
          currentGroupIds: state.currentGroupIds.filter((id) => id !== userId),
          toast: "User blocked",
        }));
      },
      unblockUser: async (userId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().unblock(userId);
            set({ toast: "User unblocked" });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to unblock user",
            });
          }
          return;
        }
        set((state) => {
          const statuses = { ...state.friendStatuses };
          delete statuses[userId];
          return {
            blockedIds: state.blockedIds.filter((id) => id !== userId),
            friendStatuses: statuses,
            toast: "User unblocked",
          };
        });
      },
      reportUser: async (userId, reason, notes) => {
        if (DATA_MODE === "supabase") {
          if (userId.startsWith("u-")) {
            set({ toast: "Demo profile reports stay inside demo mode." });
            return;
          }
          try {
            await getSupabasePlatformService().report(userId, reason, notes);
            set({ toast: "Report submitted" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to submit report",
            });
          }
          return;
        }
        set((state) => ({
          reports: [
            ...state.reports,
            {
              id: makeId("report"),
              userId,
              reason,
              notes,
              createdAt: new Date().toISOString(),
            },
          ],
          toast: "Report submitted",
        }));
      },
      reportContent: async (userId, targetType, targetId, reason, notes) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().report(
              userId,
              reason,
              notes,
              targetType,
              targetId,
            );
            set({ toast: "Report submitted" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to submit report",
            });
          }
          return;
        }
        set((state) => ({
          reports: [
            ...state.reports,
            {
              id: makeId("report"),
              userId,
              targetType,
              targetId,
              reason,
              notes,
              createdAt: new Date().toISOString(),
            },
          ],
          toast: "Report submitted",
        }));
      },
      sendMessage: async (userId, text, options = {}) => {
        const hasContent = Boolean(text.trim() || options.mediaPath);
        if (
          !hasContent ||
          (get().friendStatuses[userId] !== "friends" &&
            get().matchStatuses[userId] !== "active")
        )
          return;
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().sendMessage({
              ...options,
              userId,
              text,
              type: options.type || "text",
            });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to send message",
            });
          }
          return;
        }
        const outgoing: Message = {
          ...chatService.createOutgoing(text),
          ...options,
          type: options.type || "text",
          mediaUrl: options.mediaPath,
          durationSeconds: options.durationSeconds,
          waveform: options.waveform,
          replyToId: options.replyToId,
          forwardedFromId: options.forwardedFromId,
          storyId: options.storyId,
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [userId]: [...(state.messages[userId] ?? []), outgoing],
          },
        }));
        window.setTimeout(
          () =>
            set((state) => ({
              messages: {
                ...state.messages,
                [userId]: (state.messages[userId] ?? []).map((message) =>
                  message.id === outgoing.id
                    ? { ...message, deliveryStatus: "delivered" }
                    : message,
                ),
              },
            })),
          260,
        );
        window.setTimeout(
          () =>
            set((state) => ({
              typingUsers: { ...state.typingUsers, [userId]: true },
            })),
          850,
        );
        window.setTimeout(() => {
          const reply = chatService.createSimulatedReply(userId);
          set((state) => ({
            typingUsers: { ...state.typingUsers, [userId]: false },
            messages: {
              ...state.messages,
              [userId]: [
                ...(state.messages[userId] ?? []).map((message) =>
                  message.id === outgoing.id
                    ? {
                        ...message,
                        read: true,
                        deliveryStatus: "read" as const,
                      }
                    : message,
                ),
                reply,
              ],
            },
          }));
          if (get().settings.soundEnabled) playTone("message");
        }, 2450);
      },
      sendGroupMessage: async (groupId, text, options = {}) => {
        const group = get().groups.find(
          (item) =>
            item.id === groupId &&
            item.memberIds.includes(get().currentUserId || CURRENT_USER_ID),
        );
        if (!group || (!text.trim() && !options.mediaPath)) return;
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().sendMessage({
              ...options,
              conversationId: groupId,
              text,
              type: options.type || "text",
            });
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to send group message",
            });
          }
          return;
        }
        const message: Message = {
          id: makeId("group-msg"),
          conversationId: groupId,
          senderId: CURRENT_USER_ID,
          text,
          type: options.type || "text",
          mediaUrl: options.mediaPath,
          mediaPath: options.mediaPath,
          durationSeconds: options.durationSeconds,
          waveform: options.waveform,
          replyToId: options.replyToId,
          forwardedFromId: options.forwardedFromId,
          createdAt: new Date().toISOString(),
          read: true,
          deliveryStatus: "read",
          reactions: {},
          seenByCount: Math.max(0, group.memberIds.length - 1),
        };
        set((state) => ({
          groupMessages: {
            ...state.groupMessages,
            [groupId]: [...(state.groupMessages[groupId] || []), message],
          },
          groups: state.groups.map((item) =>
            item.id === groupId
              ? { ...item, lastMessageAt: message.createdAt }
              : item,
          ),
        }));
      },
      uploadConversationMedia: async (kind, conversationId, file, filename) => {
        if (DATA_MODE === "supabase")
          return getSupabasePlatformService().uploadConversationMedia(
            kind,
            conversationId,
            file,
            filename,
          );
        return URL.createObjectURL(file);
      },
      reactToGroupMessage: async (groupId, messageId, emoji) => {
        if (DATA_MODE === "supabase") {
          const current = get().groupMessages[groupId]?.find(
            (message) => message.id === messageId,
          )?.myReaction;
          try {
            await getSupabasePlatformService().reactToMessage(
              messageId,
              current === emoji ? null : emoji,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast: error instanceof Error ? error.message : "Unable to react",
            });
          }
          return;
        }
        set((state) => ({
          groupMessages: {
            ...state.groupMessages,
            [groupId]: (state.groupMessages[groupId] || []).map((message) => {
              if (message.id !== messageId) return message;
              const reactions = { ...message.reactions };
              if (message.myReaction) {
                reactions[message.myReaction] = Math.max(
                  0,
                  (reactions[message.myReaction] || 1) - 1,
                );
                if (!reactions[message.myReaction])
                  delete reactions[message.myReaction];
              }
              if (message.myReaction === emoji)
                return { ...message, reactions, myReaction: undefined };
              reactions[emoji] = (reactions[emoji] || 0) + 1;
              return { ...message, reactions, myReaction: emoji };
            }),
          },
        }));
      },
      deleteMessageForMe: async (threadId, messageId, group = false) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().deleteMessageForMe(messageId);
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to delete message",
            });
          }
          return;
        }
        const key = group ? "groupMessages" : "messages";
        set(
          (state) =>
            ({
              [key]: {
                ...state[key],
                [threadId]: (state[key][threadId] || []).filter(
                  (message) => message.id !== messageId,
                ),
              },
            }) as Partial<VybeState>,
        );
      },
      deleteMessageForEveryone: async (threadId, messageId, group = false) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().deleteMessageForEveryone(
              messageId,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to delete message",
            });
          }
          return;
        }
        const key = group ? "groupMessages" : "messages";
        set(
          (state) =>
            ({
              [key]: {
                ...state[key],
                [threadId]: (state[key][threadId] || []).map((message) =>
                  message.id === messageId
                    ? {
                        ...message,
                        text: "Message deleted",
                        mediaUrl: undefined,
                        deletedForEveryone: true,
                      }
                    : message,
                ),
              },
            }) as Partial<VybeState>,
        );
      },
      toggleMessagePin: async (threadId, messageId, pinned, group = false) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().toggleMessagePin(
              messageId,
              pinned,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error ? error.message : "Unable to update pin",
            });
          }
          return;
        }
        const key = group ? "groupMessages" : "messages";
        set(
          (state) =>
            ({
              [key]: {
                ...state[key],
                [threadId]: (state[key][threadId] || []).map((message) =>
                  message.id === messageId ? { ...message, pinned } : message,
                ),
              },
            }) as Partial<VybeState>,
        );
      },
      setConversationMuted: async (conversationId, muted) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().setConversationMuted(
              conversationId,
              muted,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to update mute",
            });
          }
          return;
        }
        set((state) => ({
          mutedConversationIds: muted
            ? Array.from(
                new Set([...state.mutedConversationIds, conversationId]),
              )
            : state.mutedConversationIds.filter((id) => id !== conversationId),
          groups: state.groups.map((group) =>
            group.id === conversationId ? { ...group, muted } : group,
          ),
          toast: muted ? "Conversation muted" : "Conversation unmuted",
        }));
      },
      markGroupRead: async (groupId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().markConversationReadById(
              groupId,
              get().settings.readReceipts,
            );
            await get().hydrateCloud();
          } catch {}
          return;
        }
        set((state) => ({
          groupMessages: {
            ...state.groupMessages,
            [groupId]: (state.groupMessages[groupId] || []).map((message) => ({
              ...message,
              read: true,
            })),
          },
        }));
      },
      createStory: async (input, file) => {
        try {
          if (DATA_MODE === "supabase") {
            let mediaPath = input.mediaPath;
            if (file)
              mediaPath =
                await getSupabasePlatformService().uploadStoryMedia(file);
            await getSupabasePlatformService().createStory({
              ...input,
              mediaPath,
            });
            await get().hydrateCloud();
            return;
          }
          const mediaUrl = file ? URL.createObjectURL(file) : input.mediaPath;
          const story: StoryItem = {
            id: makeId("story"),
            userId: CURRENT_USER_ID,
            mediaType: input.mediaType,
            mediaUrl,
            mediaPath: mediaUrl,
            text: input.text || null,
            backgroundColor: input.backgroundColor,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            viewed: true,
            reactionCounts: {},
            viewerCount: 0,
          };
          set((state) => ({
            stories: [story, ...state.stories],
            toast: "Story shared for 24 hours",
          }));
        } catch (error) {
          set({
            toast:
              error instanceof Error
                ? error.message
                : "Unable to publish story",
          });
        }
      },
      deleteStory: async (storyId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().deleteStory(storyId);
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to delete story",
            });
          }
          return;
        }
        set((state) => ({
          stories: state.stories.filter((story) => story.id !== storyId),
          toast: "Story deleted",
        }));
      },
      viewStory: async (storyId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().viewStory(storyId);
          } catch {}
        }
        set((state) => ({
          stories: state.stories.map((story) =>
            story.id === storyId ? { ...story, viewed: true } : story,
          ),
        }));
      },
      reactToStory: async (storyId, emoji) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().reactToStory(storyId, emoji);
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast: error instanceof Error ? error.message : "Unable to react",
            });
          }
          return;
        }
        set((state) => ({
          stories: state.stories.map((story) =>
            story.id === storyId
              ? {
                  ...story,
                  reactionCounts: {
                    ...story.reactionCounts,
                    [emoji]:
                      (story.reactionCounts[emoji] || 0) +
                      (story.myReaction === emoji ? -1 : 1),
                  },
                  myReaction: story.myReaction === emoji ? undefined : emoji,
                }
              : story,
          ),
          toast: "Story reaction sent",
        }));
      },
      replyToStory: async (storyId, text) => {
        const story = get().stories.find((item) => item.id === storyId);
        if (!story || !text.trim() || story.userId === CURRENT_USER_ID) return;
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().replyToStory(story, text);
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast: error instanceof Error ? error.message : "Unable to reply",
            });
          }
          return;
        }
        await get().sendMessage(story.userId, text, { storyId });
        set({ toast: "Story reply sent privately" });
      },
      createGroup: async (title, memberIds) => {
        if (DATA_MODE === "supabase") {
          try {
            const id = await getSupabasePlatformService().createGroup(
              title,
              memberIds,
            );
            await get().hydrateCloud();
            return id;
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to create group",
            });
            return "";
          }
        }
        const id = makeId("group");
        const group: GroupConversation = {
          id,
          title: title.trim() || "VYBE Group",
          ownerId: CURRENT_USER_ID,
          memberIds: [CURRENT_USER_ID],
          invitedIds: memberIds,
          createdAt: new Date().toISOString(),
          lastMessageAt: null,
          muted: false,
          pinnedMessageIds: [],
        };
        set((state) => ({
          groups: [group, ...state.groups],
          groupMessages: { ...state.groupMessages, [id]: [] },
          toast: "Group created — invites sent",
        }));
        return id;
      },
      respondGroupInvite: async (groupId, accept) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().respondGroupInvite(
              groupId,
              accept,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error ? error.message : "Unable to respond",
            });
          }
          return;
        }
        set((state) => ({
          groups: state.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  invitedIds: group.invitedIds.filter(
                    (id) => id !== CURRENT_USER_ID,
                  ),
                  memberIds: accept
                    ? Array.from(new Set([...group.memberIds, CURRENT_USER_ID]))
                    : group.memberIds,
                }
              : group,
          ),
          toast: accept ? "Group joined" : "Invite declined",
        }));
      },
      updateGroup: async (groupId, title, iconFile) => {
        if (DATA_MODE === "supabase") {
          try {
            let iconPath: string | undefined;
            if (iconFile)
              iconPath = await getSupabasePlatformService().uploadGroupIcon(
                groupId,
                iconFile,
              );
            await getSupabasePlatformService().updateGroup(
              groupId,
              title,
              iconPath,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to update group",
            });
          }
          return;
        }
        const iconUrl = iconFile ? URL.createObjectURL(iconFile) : undefined;
        set((state) => ({
          groups: state.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  title: title || group.title,
                  iconUrl: iconUrl || group.iconUrl,
                }
              : group,
          ),
          toast: "Group updated",
        }));
      },
      removeGroupMember: async (groupId, memberId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().removeGroupMember(
              groupId,
              memberId,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to remove member",
            });
          }
          return;
        }
        set((state) => ({
          groups: state.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  memberIds: group.memberIds.filter((id) => id !== memberId),
                }
              : group,
          ),
          toast: "Member removed",
        }));
      },
      leaveGroup: async (groupId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().leaveGroup(groupId);
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to leave group",
            });
          }
          return;
        }
        set((state) => ({
          groups: state.groups.filter((group) => group.id !== groupId),
          toast: "You left the group",
        }));
      },
      likeProfile: async (userId) => {
        if (!get().settings.profileLikesEnabled) {
          set({ toast: "Profile likes are turned off" });
          return;
        }
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().likeProfile(userId);
            set({ toast: "Profile like sent" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to like profile",
            });
          }
          return;
        }
        set((state) => ({
          notifications: [
            {
              id: makeId("profile-like"),
              type: "profile",
              title: "Profile like sent",
              body: "Your profile appreciation was shared privately.",
              createdAt: new Date().toISOString(),
              read: false,
              userId,
            },
            ...state.notifications,
          ],
          toast: "Profile like sent",
        }));
      },
      loadAdminData: async () => {
        if (!get().isAdmin) return;
        if (DATA_MODE === "demo") return;
        try {
          const [cases, appeals, logs] = await Promise.all([
            getSupabasePlatformService().loadModerationCases(),
            getSupabasePlatformService().loadModerationAppeals(),
            getSupabasePlatformService().loadModerationLogs(),
          ]);
          set({
            moderationCases: cases,
            moderationAppeals: appeals,
            moderationLogs: logs,
          });
        } catch (error) {
          set({
            toast:
              error instanceof Error
                ? error.message
                : "Unable to load moderation dashboard",
          });
        }
      },
      searchAdminUsers: async (query) => {
        if (DATA_MODE === "demo") {
          const clean = query.toLowerCase();
          set({
            adminUsers: SIM_USERS.filter((user) =>
              `${user.username} ${user.displayName}`
                .toLowerCase()
                .includes(clean),
            ).map((user) => ({
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              accountStatus: "active" as const,
            })),
          });
          return;
        }
        try {
          set({
            adminUsers:
              await getSupabasePlatformService().searchAdminUsers(query),
          });
        } catch (error) {
          set({
            toast:
              error instanceof Error ? error.message : "Unable to search users",
          });
        }
      },
      moderateCase: async (caseId, action, notes = "") => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().moderateCase(
              caseId,
              action,
              notes,
            );
            await get().loadAdminData();
            set({ toast: "Moderation action recorded" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to apply action",
            });
          }
          return;
        }
        set((state) => ({
          moderationCases: state.moderationCases.map((item) =>
            item.id === caseId
              ? {
                  ...item,
                  status: action === "dismiss" ? "dismissed" : "actioned",
                  hidden: action === "restore" ? false : item.hidden,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
          moderationLogs: [
            {
              id: makeId("log"),
              adminId: CURRENT_USER_ID,
              action: action === "dismiss" ? "dismiss" : action,
              targetUserId: state.moderationCases.find(
                (item) => item.id === caseId,
              )?.subjectUserId,
              flagId: caseId,
              notes,
              createdAt: new Date().toISOString(),
            },
            ...state.moderationLogs,
          ],
          toast: "Moderation action recorded",
        }));
      },
      moderateUser: async (userId, action, notes = "") => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().moderateUser(
              userId,
              action,
              notes,
            );
            await get().searchAdminUsers(
              get().adminUsers.find((user) => user.id === userId)?.username ||
                "",
            );
            await get().loadAdminData();
            set({ toast: "Account action recorded" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to update account",
            });
          }
          return;
        }
        set((state) => ({
          adminUsers: state.adminUsers.map((user) =>
            user.id === userId
              ? {
                  ...user,
                  accountStatus:
                    action === "restore"
                      ? "active"
                      : action === "warn"
                        ? "warned"
                        : action === "suspend"
                          ? "suspended"
                          : "banned",
                }
              : user,
          ),
          moderationLogs: [
            {
              id: makeId("log"),
              adminId: CURRENT_USER_ID,
              action,
              targetUserId: userId,
              notes,
              createdAt: new Date().toISOString(),
            },
            ...state.moderationLogs,
          ],
          toast: "Account action recorded",
        }));
      },
      reviewAppeal: async (appealId, decision, notes = "") => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().reviewAppeal(
              appealId,
              decision,
              notes,
            );
            await get().loadAdminData();
            set({ toast: `Appeal ${decision}` });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to review appeal",
            });
          }
          return;
        }
        set((state) => ({
          moderationAppeals: state.moderationAppeals.map((appeal) =>
            appeal.id === appealId
              ? {
                  ...appeal,
                  status: decision,
                  reviewerId: CURRENT_USER_ID,
                  reviewerNotes: notes,
                  reviewedAt: new Date().toISOString(),
                }
              : appeal,
          ),
          moderationLogs: [
            {
              id: makeId("log"),
              adminId: CURRENT_USER_ID,
              action:
                decision === "approved" ? "appeal_approve" : "appeal_deny",
              targetUserId: state.moderationAppeals.find(
                (appeal) => appeal.id === appealId,
              )?.userId,
              notes,
              createdAt: new Date().toISOString(),
            },
            ...state.moderationLogs,
          ],
          toast: `Appeal ${decision}`,
        }));
      },
      submitAppeal: async (reason) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().submitAppeal(reason);
            set({ toast: "Appeal submitted" });
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to submit appeal",
            });
          }
          return;
        }
        set({ toast: "Demo appeal submitted" });
      },
      reactToMessage: async (userId, messageId, emoji) => {
        if (DATA_MODE === "supabase") {
          const current = get().messages[userId]?.find(
            (message) => message.id === messageId,
          )?.myReaction;
          try {
            await getSupabasePlatformService().reactToMessage(
              messageId,
              current === emoji ? null : emoji,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast: error instanceof Error ? error.message : "Unable to react",
            });
          }
          return;
        }
        set((state) => ({
          messages: {
            ...state.messages,
            [userId]: (state.messages[userId] ?? []).map((message) => {
              if (message.id !== messageId) return message;
              const reactions = { ...message.reactions };
              if (message.myReaction === emoji) {
                reactions[emoji] = Math.max(0, (reactions[emoji] ?? 1) - 1);
                if (!reactions[emoji]) delete reactions[emoji];
                return { ...message, reactions, myReaction: undefined };
              }
              if (message.myReaction) {
                reactions[message.myReaction] = Math.max(
                  0,
                  (reactions[message.myReaction] ?? 1) - 1,
                );
                if (!reactions[message.myReaction])
                  delete reactions[message.myReaction];
              }
              reactions[emoji] = (reactions[emoji] ?? 0) + 1;
              return { ...message, reactions, myReaction: emoji };
            }),
          },
        }));
      },
      markChatRead: async (userId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().markConversationRead(
              userId,
              get().settings.readReceipts,
            );
            await get().hydrateCloud();
          } catch {
            /* realtime will retry */
          }
          return;
        }
        set((state) => ({
          messages: {
            ...state.messages,
            [userId]: (state.messages[userId] ?? []).map((message) =>
              message.senderId === userId
                ? { ...message, read: true }
                : message,
            ),
          },
          notifications: state.notifications.map((notification) =>
            notification.type === "message" && notification.userId === userId
              ? { ...notification, read: true }
              : notification,
          ),
        }));
      },
      markNotificationRead: async (notificationId) => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().markNotificationRead(
              notificationId,
            );
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to update notification",
            });
          }
          return;
        }
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === notificationId
              ? { ...notification, read: true }
              : notification,
          ),
        }));
      },
      markNotificationsRead: async () => {
        if (DATA_MODE === "supabase") {
          try {
            await getSupabasePlatformService().markAllNotificationsRead();
            await get().hydrateCloud();
          } catch (error) {
            set({
              toast:
                error instanceof Error
                  ? error.message
                  : "Unable to update notifications",
            });
          }
          return;
        }
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
        }));
      },
      recordProfileInteraction: async (userId) => {
        if (
          DATA_MODE !== "supabase" ||
          !userId ||
          userId === get().currentUserId
        )
          return;
        try {
          await getSupabasePlatformService().recordProfileInteraction(userId);
        } catch {
          /* Optional profile activity alerts never block profile viewing. */
        }
      },
      setTyping: (userId, typing) =>
        set((state) => ({
          typingUsers: { ...state.typingUsers, [userId]: typing },
        })),
      clearToast: () => set({ toast: null }),
      resetDemo: () => {
        if (DATA_MODE !== "demo") {
          set({ toast: "Cloud accounts are not reset from the browser." });
          return;
        }
        set({
          signedIn: false,
          username: "You",
          email: "",
          ageBracket: "13-15",
          interests: ["Gaming", "Music", "Basketball", "Chill"],
          profile: initialProfile,
          settings: initialSettings,
          people: SIM_USERS,
          discoveryProfiles: [],
          discoveryFilters: initialDiscoveryFilters,
          swipeDecisions: {},
          lastPassedIds: [],
          matches: [],
          matchStatuses: {},
          matchCelebrationUserId: null,
          muted: false,
          cameraOff: false,
          finding: false,
          matchFoundPulse: false,
          currentSoloId: null,
          currentGroupIds: [],
          ...demoSocialState,
          typingUsers: {},
          reports: [],
          blockedIds: [],
          toast: "Demo reset",
          countryFilter: "Random",
          languageFilter: "Random",
          interestFilter: "Random",
        });
      },
    }),
    {
      name: "vybe-prototype-storage",
      version: 5,
      migrate: (persistedState) => {
        if (DATA_MODE === "supabase") return { dataMode: "supabase" as const };
        const oldState = persistedState as PersistedVybeState;
        return {
          ...oldState,
          dataMode: "demo" as const,
          profile: { ...initialProfile, ...(oldState.profile ?? {}) },
          settings: { ...initialSettings, ...(oldState.settings ?? {}) },
          people: SIM_USERS,
          requestIdsByUser: oldState.requestIdsByUser ?? {},
          conversationIdsByUser: oldState.conversationIdsByUser ?? {},
          typingUsers: {},
          discoveryFilters: {
            ...initialDiscoveryFilters,
            ...(oldState.discoveryFilters ?? {}),
          },
          swipeDecisions: oldState.swipeDecisions ?? {},
          lastPassedIds: oldState.lastPassedIds ?? [],
          matches: oldState.matches ?? [],
          matchStatuses: oldState.matchStatuses ?? {},
          stories: oldState.stories ?? defaultStories(),
          groups: oldState.groups ?? defaultGroups(),
          groupMessages: oldState.groupMessages ?? defaultGroupMessages(),
          mutedConversationIds: oldState.mutedConversationIds ?? [],
          isAdmin: true,
          moderationCases: [],
          moderationAppeals: [],
          moderationLogs: [],
          adminUsers: [],
        };
      },
      partialize: (state): PersistedVybeState =>
        state.dataMode === "demo"
          ? {
              signedIn: state.signedIn,
              username: state.username,
              email: state.email,
              ageBracket: state.ageBracket,
              interests: state.interests,
              profile: state.profile,
              settings: state.settings,
              friendStatuses: state.friendStatuses,
              incomingRequestIds: state.incomingRequestIds,
              messages: state.messages,
              stories: state.stories,
              groups: state.groups,
              groupMessages: state.groupMessages,
              mutedConversationIds: state.mutedConversationIds,
              notifications: state.notifications,
              reports: state.reports,
              blockedIds: state.blockedIds,
              countryFilter: state.countryFilter,
              languageFilter: state.languageFilter,
              interestFilter: state.interestFilter,
              discoveryFilters: state.discoveryFilters,
              swipeDecisions: state.swipeDecisions,
              lastPassedIds: state.lastPassedIds,
              matches: state.matches,
              matchStatuses: state.matchStatuses,
            }
          : { dataMode: "supabase" },
    },
  ),
);

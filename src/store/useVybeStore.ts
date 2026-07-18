"use client";

import { create } from "zustand";
import { AVATAR_OPTIONS, BANNER_OPTIONS } from "@/lib/profile-options";
import {
  getSupabasePlatformService,
  supabaseAuthService,
} from "@/services/supabase/platform";
import type { CreateStoryInput, SendMessageInput } from "@/services/contracts";
import type {
  AdminUserSummary,
  AgeBracket,
  CloudSnapshot,
  CurrentProfile,
  DiscoveryFilters,
  GroupConversation,
  Interest,
  Message,
  ModerationAppeal,
  ModerationCase,
  ModerationLog,
  NotificationItem,
  ReportRecord,
  PublicProfile,
  StoryItem,
  UserSettings,
  VybeMatch,
} from "@/types";

const initialProfile: CurrentProfile = {
  username: "",
  displayName: "",
  bio: "",
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
  profileBadges: [],
  profileCompletion: 0,
  videoGender: "unspecified",
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
      kind === "match" ? [420, 620] : kind === "friend" ? [520, 740] : [480, 560];
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
    // Browser audio feedback is optional.
  }
}

interface VybeState {
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
  people: PublicProfile[];
  searchResults: PublicProfile[];
  searchingMembers: boolean;
  searchHasMore: boolean;
  lastSearchQuery: string;
  discoveryProfiles: PublicProfile[];
  discoveryLoading: boolean;
  discoveryError: string | null;
  discoveryFilters: DiscoveryFilters;
  swipeDecisions: Record<string, "like" | "pass">;
  lastPassedIds: string[];
  matches: VybeMatch[];
  matchStatuses: Record<string, "active" | "unmatched">;
  matchCelebrationUserId: string | null;
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
  deleteProfileMedia: (kind: "avatar" | "banner", path: string) => Promise<void>;
  setSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  setFilters: (
    filter: "country" | "language" | "interest",
    value: string,
  ) => void;
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
    targetType:
      | "profile"
      | "message"
      | "story"
      | "group"
      | "video_session"
      | "group_video_session",
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
  reactToMessage: (userId: string, messageId: string, emoji: string) => Promise<void>;
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
  setConversationMuted: (conversationId: string, muted: boolean) => Promise<void>;
  markChatRead: (userId: string) => Promise<void>;
  markGroupRead: (groupId: string) => Promise<void>;
  createStory: (input: CreateStoryInput, file?: File) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  viewStory: (storyId: string) => Promise<void>;
  reactToStory: (storyId: string, emoji: string) => Promise<void>;
  replyToStory: (storyId: string, text: string) => Promise<void>;
  createGroup: (title: string, memberIds: string[]) => Promise<string>;
  respondGroupInvite: (groupId: string, accept: boolean) => Promise<void>;
  updateGroup: (groupId: string, title?: string, iconFile?: File) => Promise<void>;
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
}

const baseState = {
  signedIn: false,
  cloudReady: false,
  cloudLoading: false,
  cloudError: null,
  currentUserId: null,
  username: "",
  email: "",
  ageBracket: "13-15" as AgeBracket,
  interests: [] as Interest[],
  profile: initialProfile,
  settings: initialSettings,
  people: [] as PublicProfile[],
  searchResults: [] as PublicProfile[],
  searchingMembers: false,
  searchHasMore: false,
  lastSearchQuery: "",
  discoveryProfiles: [] as PublicProfile[],
  discoveryLoading: false,
  discoveryError: null,
  discoveryFilters: initialDiscoveryFilters,
  swipeDecisions: {} as Record<string, "like" | "pass">,
  lastPassedIds: [] as string[],
  matches: [] as VybeMatch[],
  matchStatuses: {} as Record<string, "active" | "unmatched">,
  matchCelebrationUserId: null,
  friendStatuses: {} as Record<string, "pending" | "friends" | "blocked">,
  incomingRequestIds: [] as string[],
  requestIdsByUser: {} as Record<string, string>,
  conversationIdsByUser: {} as Record<string, string>,
  messages: {} as Record<string, Message[]>,
  stories: [] as StoryItem[],
  groups: [] as GroupConversation[],
  groupMessages: {} as Record<string, Message[]>,
  mutedConversationIds: [] as string[],
  isAdmin: false,
  moderationCases: [] as ModerationCase[],
  moderationAppeals: [] as ModerationAppeal[],
  moderationLogs: [] as ModerationLog[],
  adminUsers: [] as AdminUserSummary[],
  typingUsers: {} as Record<string, boolean>,
  notifications: [] as NotificationItem[],
  reports: [] as ReportRecord[],
  blockedIds: [] as string[],
  toast: null,
  countryFilter: "Random",
  languageFilter: "Random",
  interestFilter: "Random",
};

export const useVybeStore = create<VybeState>((set, get) => {
  const platform = () => getSupabasePlatformService();

  const applySnapshot = (snapshot: CloudSnapshot) => {
    const blockedIds = Object.entries(snapshot.friendStatuses)
      .filter(([, value]) => value === "blocked")
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
      incomingRequestIds: snapshot.incomingRequestIds,
      requestIdsByUser: snapshot.requestIdsByUser,
      conversationIdsByUser: snapshot.conversationIdsByUser,
      messages: snapshot.messages,
      stories: snapshot.stories || [],
      groups: snapshot.groups || [],
      groupMessages: snapshot.groupMessages || {},
      mutedConversationIds: snapshot.mutedConversationIds || [],
      notifications: snapshot.notifications,
      matches: snapshot.matches,
      matchStatuses: snapshot.matchStatuses,
      blockedIds,
      isAdmin: Boolean(snapshot.isAdmin),
    });
  };

  const hydrate = async () => {
    set({ cloudLoading: true, cloudError: null });
    try {
      const snapshot = await platform().loadSnapshot();
      applySnapshot(snapshot);
    } catch (error) {
      set({
        cloudLoading: false,
        cloudReady: false,
        cloudError:
          error instanceof Error ? error.message : "Unable to load your VYBE account",
      });
      throw error;
    }
  };

  const refreshWithToast = async (
    operation: () => Promise<void>,
    success: string,
  ) => {
    try {
      await operation();
      await hydrate();
      set({ toast: success });
    } catch (error) {
      set({ toast: error instanceof Error ? error.message : "Request failed" });
      throw error;
    }
  };

  return {
    ...baseState,
    applyCloudSnapshot: applySnapshot,
    hydrateCloud: hydrate,
    logout: async () => {
      await supabaseAuthService.logout();
      const themePreference = get().settings.themePreference;
      set({
        ...baseState,
        settings: { ...initialSettings, themePreference },
      });
      if (typeof window !== "undefined")
        window.localStorage.removeItem("vybe-prototype-storage");
    },
    searchMembers: async (query) => {
      const normalized = query.trim();
      if (!normalized) {
        set({ searchResults: [], lastSearchQuery: "", searchHasMore: false });
        return;
      }
      set({ searchingMembers: true, lastSearchQuery: normalized });
      try {
        const rows = await platform().searchProfiles(normalized, 0, 20);
        set({
          searchResults: rows,
          searchHasMore: rows.length === 20,
          searchingMembers: false,
        });
      } catch (error) {
        set({
          searchingMembers: false,
          toast: error instanceof Error ? error.message : "Search failed",
        });
      }
    },
    loadMoreMembers: async () => {
      const { lastSearchQuery, searchResults, searchingMembers } = get();
      if (!lastSearchQuery || searchingMembers) return;
      set({ searchingMembers: true });
      try {
        const rows = await platform().searchProfiles(
          lastSearchQuery,
          searchResults.length,
          20,
        );
        set({
          searchResults: [...searchResults, ...rows],
          searchHasMore: rows.length === 20,
          searchingMembers: false,
        });
      } catch (error) {
        set({
          searchingMembers: false,
          toast: error instanceof Error ? error.message : "Search failed",
        });
      }
    },
    clearMemberSearch: () =>
      set({
        searchResults: [],
        lastSearchQuery: "",
        searchHasMore: false,
        searchingMembers: false,
      }),
    loadDiscovery: async () => {
      set({ discoveryLoading: true, discoveryError: null });
      try {
        const profiles = await platform().loadDiscovery(get().discoveryFilters);
        set({ discoveryProfiles: profiles, discoveryLoading: false });
      } catch (error) {
        set({
          discoveryLoading: false,
          discoveryError:
            error instanceof Error ? error.message : "Discovery is unavailable",
        });
      }
    },
    setDiscoveryFilters: (filters) => {
      set((state) => ({
        discoveryFilters: { ...state.discoveryFilters, ...filters, offset: 0 },
      }));
      queueMicrotask(() => void get().loadDiscovery());
    },
    decideProfile: async (userId, decision) => {
      try {
        const result = await platform().submitSwipe(userId, decision);
        set((state) => ({
          swipeDecisions: { ...state.swipeDecisions, [userId]: decision },
          lastPassedIds:
            decision === "pass"
              ? [...state.lastPassedIds.filter((id) => id !== userId), userId].slice(-3)
              : state.lastPassedIds,
          discoveryProfiles: state.discoveryProfiles.filter(
            (profile) => profile.id !== userId,
          ),
          matchCelebrationUserId: result.matched ? userId : null,
        }));
        if (result.matched && get().settings.soundEnabled) playTone("match");
        await hydrate();
      } catch (error) {
        set({ toast: error instanceof Error ? error.message : "Unable to save decision" });
      }
    },
    undoPass: async () => {
      try {
        const restoredId = await platform().undoLastPass();
        if (!restoredId) {
          set({ toast: "No recent pass is available to undo." });
          return;
        }
        set((state) => ({
          lastPassedIds: state.lastPassedIds.filter((id) => id !== restoredId),
          swipeDecisions: Object.fromEntries(
            Object.entries(state.swipeDecisions).filter(([id]) => id !== restoredId),
          ),
          toast: "Most recent pass restored",
        }));
        await get().loadDiscovery();
      } catch (error) {
        set({ toast: error instanceof Error ? error.message : "Unable to undo pass" });
      }
    },
    dismissMatchCelebration: () => set({ matchCelebrationUserId: null }),
    unmatch: async (matchId) =>
      refreshWithToast(() => platform().unmatch(matchId), "Match ended"),
    setAgeBracket: () => {
      set({ toast: "Your age bracket is calculated securely from your date of birth." });
    },
    toggleInterest: (interest) =>
      set((state) => ({
        interests: state.interests.includes(interest)
          ? state.interests.filter((item) => item !== interest)
          : [...state.interests, interest],
      })),
    setInterests: (interests) => set({ interests }),
    completeInterests: async () =>
      refreshWithToast(
        () => platform().updateProfile(get().profile, get().interests),
        "Interests saved",
      ),
    updateProfile: async (nextProfile) =>
      refreshWithToast(
        () => platform().updateProfile(nextProfile, get().interests),
        "Profile saved",
      ),
    uploadProfileMedia: (kind, file, previousPath) =>
      platform().uploadProfileMedia(kind, file, previousPath),
    deleteProfileMedia: async (kind, path) => {
      await platform().deleteProfileMedia(kind, path);
      await hydrate();
    },
    setSetting: (key, value) => {
      const next = { ...get().settings, [key]: value };
      set({ settings: next });
      void platform()
        .updateSettings(next)
        .then(() => set({ toast: "Settings saved" }))
        .catch((error) =>
          set({ toast: error instanceof Error ? error.message : "Unable to save settings" }),
        );
    },
    setFilters: (filter, value) =>
      set(
        filter === "country"
          ? { countryFilter: value }
          : filter === "language"
            ? { languageFilter: value }
            : { interestFilter: value },
      ),
    sendFriendRequest: async (userId) =>
      refreshWithToast(
        () => platform().sendFriendRequest(userId),
        "Friend request sent",
      ),
    acceptFriendRequest: async (userId) => {
      const requestId = get().requestIdsByUser[userId];
      if (!requestId) return;
      await refreshWithToast(
        () => platform().acceptFriendRequest(requestId),
        "Friend request accepted",
      );
      if (get().settings.soundEnabled) playTone("friend");
    },
    declineFriendRequest: async (userId) => {
      const requestId = get().requestIdsByUser[userId];
      if (!requestId) return;
      await refreshWithToast(
        () => platform().declineFriendRequest(requestId),
        "Friend request declined",
      );
    },
    cancelFriendRequest: async (userId) => {
      const requestId = get().requestIdsByUser[userId];
      if (!requestId) return;
      await refreshWithToast(
        () => platform().cancelFriendRequest(requestId),
        "Friend request cancelled",
      );
    },
    unfriend: async (userId) =>
      refreshWithToast(() => platform().unfriend(userId), "Friend removed"),
    blockUser: async (userId) =>
      refreshWithToast(() => platform().block(userId), "Account blocked"),
    unblockUser: async (userId) =>
      refreshWithToast(() => platform().unblock(userId), "Account unblocked"),
    reportUser: async (userId, reason, notes) => {
      await platform().report(userId, reason, notes, "profile", userId);
      set((state) => ({
        reports: [
          ...state.reports,
          {
            id: crypto.randomUUID(),
            userId,
            reason,
            notes,
            targetType: "profile",
            targetId: userId,
            createdAt: new Date().toISOString(),
          },
        ],
        toast: "Report submitted privately",
      }));
    },
    reportContent: async (userId, targetType, targetId, reason, notes) => {
      await platform().report(userId, reason, notes, targetType, targetId);
      set((state) => ({
        reports: [
          ...state.reports,
          {
            id: crypto.randomUUID(),
            userId,
            reason,
            notes,
            targetType,
            targetId,
            createdAt: new Date().toISOString(),
          },
        ],
        toast: "Report submitted privately",
      }));
    },
    sendMessage: async (userId, text, options = {}) => {
      await platform().sendMessage({ userId, text, ...options });
      if (get().settings.soundEnabled) playTone("message");
      await hydrate();
    },
    sendGroupMessage: async (groupId, text, options = {}) => {
      await platform().sendMessage({ conversationId: groupId, text, ...options });
      if (get().settings.soundEnabled) playTone("message");
      await hydrate();
    },
    uploadConversationMedia: (kind, conversationId, file, filename) =>
      platform().uploadConversationMedia(kind, conversationId, file, filename),
    reactToMessage: async (userId, messageId, emoji) => {
      const existing = get().messages[userId]?.find((message) => message.id === messageId);
      await platform().reactToMessage(
        messageId,
        existing?.myReaction === emoji ? null : emoji,
      );
      await hydrate();
    },
    reactToGroupMessage: async (groupId, messageId, emoji) => {
      const existing = get().groupMessages[groupId]?.find(
        (message) => message.id === messageId,
      );
      await platform().reactToMessage(
        messageId,
        existing?.myReaction === emoji ? null : emoji,
      );
      await hydrate();
    },
    deleteMessageForMe: async (_threadId, messageId) => {
      await platform().deleteMessageForMe(messageId);
      await hydrate();
    },
    deleteMessageForEveryone: async (_threadId, messageId) => {
      await platform().deleteMessageForEveryone(messageId);
      await hydrate();
    },
    toggleMessagePin: async (_threadId, messageId, pinned) => {
      await platform().toggleMessagePin(messageId, pinned);
      await hydrate();
    },
    setConversationMuted: async (conversationId, muted) => {
      await platform().setConversationMuted(conversationId, muted);
      await hydrate();
    },
    markChatRead: async (userId) => {
      const conversationId = get().conversationIdsByUser[userId];
      if (!conversationId) return;
      await platform().markConversationReadById(
        conversationId,
        get().settings.readReceipts,
      );
      await hydrate();
    },
    markGroupRead: async (groupId) => {
      await platform().markConversationReadById(
        groupId,
        get().settings.readReceipts,
      );
      await hydrate();
    },
    createStory: async (input, file) => {
      let mediaPath = input.mediaPath;
      if (file) mediaPath = await platform().uploadStoryMedia(file);
      await platform().createStory({ ...input, mediaPath });
      await hydrate();
      set({ toast: "Story shared" });
    },
    deleteStory: async (storyId) => {
      await platform().deleteStory(storyId);
      await hydrate();
      set({ toast: "Story deleted" });
    },
    viewStory: async (storyId) => {
      await platform().viewStory(storyId);
      set((state) => ({
        stories: state.stories.map((story) =>
          story.id === storyId ? { ...story, viewed: true } : story,
        ),
      }));
    },
    reactToStory: async (storyId, emoji) => {
      await platform().reactToStory(storyId, emoji);
      await hydrate();
    },
    replyToStory: async (storyId, text) => {
      const story = get().stories.find((item) => item.id === storyId);
      if (!story) throw new Error("Story not found");
      await platform().replyToStory(story, text);
      await hydrate();
    },
    createGroup: async (title, memberIds) => {
      const groupId = await platform().createGroup(title, memberIds);
      await hydrate();
      set({ toast: "Group created" });
      return groupId;
    },
    respondGroupInvite: async (groupId, accept) => {
      await platform().respondGroupInvite(groupId, accept);
      await hydrate();
    },
    updateGroup: async (groupId, title, iconFile) => {
      let iconPath: string | undefined;
      if (iconFile) iconPath = await platform().uploadGroupIcon(groupId, iconFile);
      await platform().updateGroup(groupId, title, iconPath);
      await hydrate();
    },
    removeGroupMember: async (groupId, memberId) => {
      await platform().removeGroupMember(groupId, memberId);
      await hydrate();
    },
    leaveGroup: async (groupId) => {
      await platform().leaveGroup(groupId);
      await hydrate();
    },
    likeProfile: async (userId) => {
      await platform().likeProfile(userId);
      set({ toast: "Profile liked" });
    },
    loadAdminData: async () => {
      try {
        const [isAdmin, cases, appeals, logs] = await Promise.all([
          platform().isAdmin(),
          platform().loadModerationCases(),
          platform().loadModerationAppeals(),
          platform().loadModerationLogs(),
        ]);
        set({ isAdmin, moderationCases: cases, moderationAppeals: appeals, moderationLogs: logs });
      } catch (error) {
        set({ toast: error instanceof Error ? error.message : "Unable to load moderation" });
      }
    },
    searchAdminUsers: async (query) => {
      try {
        set({ adminUsers: await platform().searchAdminUsers(query) });
      } catch (error) {
        set({ toast: error instanceof Error ? error.message : "Unable to search users" });
      }
    },
    moderateCase: async (caseId, action, notes = "") => {
      await platform().moderateCase(caseId, action, notes);
      await get().loadAdminData();
    },
    moderateUser: async (userId, action, notes = "") => {
      await platform().moderateUser(userId, action, notes);
      await get().loadAdminData();
    },
    reviewAppeal: async (appealId, decision, notes = "") => {
      await platform().reviewAppeal(appealId, decision, notes);
      await get().loadAdminData();
    },
    submitAppeal: async (reason) => {
      await platform().submitAppeal(reason);
      set({ toast: "Appeal submitted" });
    },
    markNotificationRead: async (notificationId) => {
      await platform().markNotificationRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map((notification) =>
          notification.id === notificationId
            ? { ...notification, read: true }
            : notification,
        ),
      }));
    },
    markNotificationsRead: async () => {
      await platform().markAllNotificationsRead();
      set((state) => ({
        notifications: state.notifications.map((notification) => ({
          ...notification,
          read: true,
        })),
      }));
    },
    recordProfileInteraction: async (userId) => {
      await platform().recordProfileInteraction(userId);
    },
    setTyping: (userId, typing) =>
      set((state) => ({
        typingUsers: { ...state.typingUsers, [userId]: typing },
      })),
    clearToast: () => set({ toast: null }),
  };
});

if (typeof window !== "undefined") {
  window.localStorage.removeItem("vybe-prototype-storage");
}

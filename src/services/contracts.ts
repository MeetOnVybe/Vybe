import {
  AdminUserSummary,
  CloudSnapshot,
  CurrentProfile,
  DiscoveryFilters,
  GroupConversation,
  GroupVideoSessionSummary,
  GroupVideoTokenResponse,
  Message,
  ModerationAppeal,
  ModerationCase,
  ModerationLog,
  PublicProfile,
  StoryItem,
  SwipeDecisionResult,
  UserSettings,
  VybeMatch,
  VideoMatchPreferences,
  VideoQueueResult,
  VideoSessionSummary,
  VideoTokenResponse,
} from "@/types";



export interface VideoService {
  provider: "livekit";
  loadPreferences(): Promise<VideoMatchPreferences>;
  savePreferences(preferences: VideoMatchPreferences): Promise<void>;
  joinQueue(preferences: VideoMatchPreferences): Promise<VideoQueueResult>;
  getQueueStatus(): Promise<VideoQueueResult>;
  heartbeatQueue(): Promise<void>;
  leaveQueue(): Promise<void>;
  loadSession(sessionId: string): Promise<VideoSessionSummary>;
  getConnectionToken(sessionId: string): Promise<VideoTokenResponse>;
  markConnected(sessionId: string): Promise<void>;
  updateParticipantState(
    sessionId: string,
    state: {
      connected: boolean;
      quality: "unknown" | "excellent" | "good" | "poor" | "lost";
      cameraEnabled: boolean;
      microphoneEnabled: boolean;
    },
  ): Promise<void>;
  endSession(
    sessionId: string,
    reason: "skip" | "end" | "disconnect" | "block" | "report",
  ): Promise<void>;
  logEvent(
    sessionId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  moderateFrame(
    sessionId: string,
    frameDataUrl: string,
  ): Promise<{ hidden: boolean; flagged: boolean }>;
  subscribeQueue(onChange: () => void): Promise<() => void>;
  subscribeSession(
    sessionId: string,
    onChange: () => void,
  ): Promise<() => void>;
}

export interface GroupVideoService {
  provider: "livekit";
  loadPreferences(): Promise<VideoMatchPreferences>;
  savePreferences(preferences: VideoMatchPreferences): Promise<void>;
  joinQueue(preferences: VideoMatchPreferences): Promise<VideoQueueResult>;
  getQueueStatus(): Promise<VideoQueueResult>;
  heartbeatQueue(): Promise<void>;
  leaveQueue(): Promise<void>;
  loadSession(sessionId: string): Promise<GroupVideoSessionSummary>;
  getConnectionToken(sessionId: string): Promise<GroupVideoTokenResponse>;
  updateParticipantState(
    sessionId: string,
    state: {
      connected: boolean;
      quality: "unknown" | "excellent" | "good" | "poor" | "lost";
      cameraEnabled: boolean;
      microphoneEnabled: boolean;
    },
  ): Promise<void>;
  leaveSession(
    sessionId: string,
    reason: "leave" | "skip" | "disconnect" | "block" | "report",
  ): Promise<void>;
  logEvent(sessionId: string, eventType: string, metadata?: Record<string, unknown>): Promise<void>;
  moderateFrame(
    sessionId: string,
    subjectUserId: string,
    frameDataUrl: string,
  ): Promise<{ hidden: boolean; flagged: boolean }>;
  subscribeQueue(onChange: () => void): Promise<() => void>;
  subscribeSession(sessionId: string, onChange: () => void): Promise<() => void>;
}

export interface AuthService {
  signUp(input: {
    email: string;
    password: string;
    username: string;
    displayName: string;
    dateOfBirth: string;
  }): Promise<{ needsEmailVerification: boolean }>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

export interface SendMessageInput {
  conversationId?: string;
  userId?: string;
  text?: string;
  type?: "text" | "voice" | "image";
  mediaPath?: string;
  durationSeconds?: number;
  waveform?: number[];
  replyToId?: string;
  forwardedFromId?: string;
  storyId?: string;
}

export interface CreateStoryInput {
  mediaType: "photo" | "video" | "text";
  mediaPath?: string;
  text?: string;
  backgroundColor: string;
}

export interface SocialPlatformService {
  loadSnapshot(): Promise<CloudSnapshot>;
  loadDiscovery(filters: DiscoveryFilters): Promise<PublicProfile[]>;
  searchProfiles(
    query: string,
    offset?: number,
    limit?: number,
  ): Promise<PublicProfile[]>;
  submitSwipe(
    userId: string,
    decision: "like" | "pass",
  ): Promise<SwipeDecisionResult>;
  undoLastPass(): Promise<string | null>;
  loadMatches(): Promise<VybeMatch[]>;
  unmatch(matchId: string): Promise<void>;
  updateProfile(profile: CurrentProfile, interests: string[]): Promise<void>;
  uploadProfileMedia(
    kind: "avatar" | "banner",
    file: File,
    previousPath?: string | null,
  ): Promise<string>;
  deleteProfileMedia(kind: "avatar" | "banner", path: string): Promise<void>;
  sendFriendRequest(userId: string): Promise<void>;
  acceptFriendRequest(requestId: string): Promise<void>;
  declineFriendRequest(requestId: string): Promise<void>;
  cancelFriendRequest(requestId: string): Promise<void>;
  unfriend(userId: string): Promise<void>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  report(
    userId: string,
    reason: string,
    notes: string,
    targetType?: "profile" | "message" | "story" | "group" | "video_session" | "group_video_session",
    targetId?: string,
  ): Promise<void>;
  sendMessage(input: SendMessageInput): Promise<void>;
  uploadConversationMedia(
    kind: "voice" | "image",
    conversationId: string,
    file: Blob,
    filename: string,
  ): Promise<string>;
  markConversationReadById(
    conversationId: string,
    shareReceipt: boolean,
  ): Promise<void>;
  markConversationRead(userId: string, shareReceipt: boolean): Promise<void>;
  reactToMessage(messageId: string, emoji: string | null): Promise<void>;
  deleteMessageForMe(messageId: string): Promise<void>;
  deleteMessageForEveryone(messageId: string): Promise<void>;
  toggleMessagePin(messageId: string, pinned: boolean): Promise<void>;
  setConversationMuted(conversationId: string, muted: boolean): Promise<void>;
  createStory(input: CreateStoryInput): Promise<void>;
  uploadStoryMedia(file: File): Promise<string>;
  deleteStory(storyId: string): Promise<void>;
  viewStory(storyId: string): Promise<void>;
  reactToStory(storyId: string, emoji: string): Promise<void>;
  replyToStory(story: StoryItem, text: string): Promise<void>;
  createGroup(title: string, memberIds: string[]): Promise<string>;
  respondGroupInvite(groupId: string, accept: boolean): Promise<void>;
  updateGroup(
    groupId: string,
    title?: string,
    iconPath?: string,
  ): Promise<void>;
  uploadGroupIcon(groupId: string, file: File): Promise<string>;
  removeGroupMember(groupId: string, memberId: string): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  updateSettings(settings: UserSettings): Promise<void>;
  markNotificationRead(notificationId: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  recordProfileInteraction(userId: string): Promise<void>;
  likeProfile(userId: string): Promise<void>;
  setPresence(isOnline: boolean): Promise<void>;
  submitAppeal(reason: string): Promise<void>;
  isAdmin(): Promise<boolean>;
  loadModerationCases(): Promise<ModerationCase[]>;
  loadModerationAppeals(): Promise<ModerationAppeal[]>;
  loadModerationLogs(): Promise<ModerationLog[]>;
  searchAdminUsers(query: string): Promise<AdminUserSummary[]>;
  moderateCase(
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
    suspensionHours?: number,
  ): Promise<void>;
  moderateUser(
    userId: string,
    action: "warn" | "suspend" | "ban" | "restore",
    notes?: string,
    suspensionHours?: number,
  ): Promise<void>;
  reviewAppeal(
    appealId: string,
    decision: "approved" | "denied",
    notes?: string,
  ): Promise<void>;
  subscribeToPrivateData(onChange: () => void): Promise<() => void>;
  subscribeTyping(
    conversationId: string,
    onTyping: (userId: string, typing: boolean) => void,
  ): Promise<{
    send: (typing: boolean) => Promise<void>;
    unsubscribe: () => Promise<void>;
  }>;
}

export interface Phase4SnapshotParts {
  stories: StoryItem[];
  groups: GroupConversation[];
  groupMessages: Record<string, Message[]>;
}

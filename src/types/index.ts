export type AgeBracket = "13-15" | "16-17";

export type Interest =
  | "Gaming"
  | "Music"
  | "Basketball"
  | "Sports"
  | "Fashion"
  | "Creators"
  | "Movies"
  | "School"
  | "Chill"
  | "Just Chatting";

export type FriendshipStatus = "none" | "pending" | "friends" | "blocked";
export type MatchStatus = "active" | "unmatched";
export type MessageDelivery = "sending" | "delivered" | "read";
export type ThemePreference = "system" | "dark" | "light";
export type PresenceVisibility = "precise" | "recently" | "hidden";
export type AudienceRule = "friends" | "matches" | "everyone" | "nobody";
export type ProfileVisibility = "everyone" | "friends" | "matches" | "nobody";
export type DiscoverySort = "random" | "new" | "compatibility";
export type SwipeDecisionValue = "like" | "pass";
export type ConversationType = "direct" | "group";
export type VideoGenderIdentity = "girl" | "boy" | "other" | "unspecified";
export type VideoGenderPreference = "girls" | "boys" | "everyone";
export type LocationVisibility = "hidden" | "country" | "state" | "city";
export type VideoLocationFilter = "anywhere" | "country" | "state" | "city";
export type VideoQueueStatus =
  "idle" | "waiting" | "matched" | "cancelled" | "restricted";
export type VideoSessionStatus =
  "connecting" | "active" | "reconnecting" | "ended" | "flagged";
export type VideoConnectionQuality =
  "unknown" | "excellent" | "good" | "poor" | "lost";
export type MessageType = "text" | "voice" | "image" | "system";
export type ModerationSeverity = "low" | "medium" | "high" | "critical";
export type ModerationStatus =
  "pending" | "reviewing" | "actioned" | "dismissed" | "appealed";
export type AdminActionType =
  | "warn"
  | "suspend"
  | "ban"
  | "delete_message"
  | "delete_story"
  | "restore"
  | "appeal_approve"
  | "appeal_deny";
export type ProfileStatus =
  | "🎧 Listening to music"
  | "🎮 Gaming"
  | "🏀 Looking for hoopers"
  | "📚 Studying"
  | "😴 AFK"
  | "💙 Just chilling"
  | "✨ Looking for new friends";

export interface AvatarAsset {
  image: string;
  gradient: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  ageBracket: AgeBracket;
  interests: Interest[];
  online: boolean;
  lastSeen: string;
  status: ProfileStatus;
  statusLine: string;
  bio: string;
  personality: string;
  favoriteMusic: string;
  favoriteGame: string;
  favoriteSport: string;
  favoriteGames?: string[];
  favoriteHobbies?: string[];
  favoriteSports?: string[];
  schoolGrade?: string;
  pronouns?: string;
  accentColor?: string;
  profileBadges?: string[];
  profileCompletion?: number;
  banner: string;
  avatar: AvatarAsset;
  compatibilityScore?: number;
  mutualFriendsCount?: number;
  createdAt?: string;
}

export interface CurrentProfile {
  username: string;
  displayName: string;
  bio: string;
  status: ProfileStatus;
  profileImage: string | null;
  avatarChoice: string;
  bannerChoice: string;
  dateOfBirth?: string;
  profileImagePath?: string | null;
  bannerPath?: string | null;
  favoriteMusic?: string;
  favoriteGames?: string[];
  favoriteHobbies?: string[];
  schoolGrade?: string;
  pronouns?: string;
  favoriteSports?: string[];
  accentColor?: string;
  profileBadges?: string[];
  profileCompletion?: number;
  videoGender?: VideoGenderIdentity;
  countryCode?: string;
  countryName?: string;
  stateRegion?: string;
  city?: string;
  locationVisibility?: LocationVisibility;
}

export interface VideoMatchPreferences {
  genderPreference: VideoGenderPreference;
  locationFilter: VideoLocationFilter;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

export interface VideoPeerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  status: string;
  interests: Interest[];
  ageBracket: AgeBracket;
  compatibilityScore: number;
  locationLabel: string | null;
}

export interface VideoQueueResult {
  status: VideoQueueStatus;
  sessionId?: string;
  retryAfterSeconds?: number;
  restrictionReason?: string;
}

export interface VideoSessionSummary {
  id: string;
  roomName: string;
  status: VideoSessionStatus;
  peer: VideoPeerProfile;
  createdAt: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  hiddenUntilReview?: boolean;
}

export interface VideoTokenResponse {
  serverUrl: string;
  participantToken: string;
  session: VideoSessionSummary;
}

export interface GroupVideoParticipant extends VideoPeerProfile {
  connected: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  connectionQuality: VideoConnectionQuality;
}

export interface GroupVideoSessionSummary {
  id: string;
  roomName: string;
  status: VideoSessionStatus | "forming";
  maxParticipants: number;
  participants: GroupVideoParticipant[];
  createdAt: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  hiddenUntilReview?: boolean;
}

export interface GroupVideoTokenResponse {
  serverUrl: string;
  participantToken: string;
  session: GroupVideoSessionSummary;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  read: boolean;
  deliveryStatus: MessageDelivery;
  reactions: Record<string, number>;
  myReaction?: string;
  conversationId?: string;
  type?: MessageType;
  mediaUrl?: string;
  mediaPath?: string;
  durationSeconds?: number;
  waveform?: number[];
  replyToId?: string;
  replyPreview?: string;
  forwardedFromId?: string;
  deletedForEveryone?: boolean;
  hiddenForMe?: boolean;
  pinned?: boolean;
  seenByCount?: number;
  storyId?: string;
}

export interface GroupConversation {
  id: string;
  title: string;
  iconUrl?: string | null;
  iconPath?: string | null;
  ownerId: string;
  memberIds: string[];
  invitedIds: string[];
  lastMessageAt?: string | null;
  createdAt: string;
  muted?: boolean;
  pinnedMessageIds?: string[];
}

export interface StoryItem {
  id: string;
  userId: string;
  mediaType: "photo" | "video" | "text";
  mediaUrl?: string | null;
  mediaPath?: string | null;
  text?: string | null;
  backgroundColor: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  reactionCounts: Record<string, number>;
  myReaction?: string;
  viewerCount?: number;
}

export interface NotificationItem {
  id: string;
  type:
    | "friend"
    | "message"
    | "match"
    | "profile"
    | "story"
    | "voice"
    | "group"
    | "moderation"
    | "safety"
    | "system";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  userId?: string;
  entityId?: string;
  href?: string;
}

export interface ReportRecord {
  id: string;
  userId: string;
  reason: string;
  notes: string;
  createdAt: string;
  targetType?: "profile" | "message" | "story" | "group" | "video_session" | "group_video_session";
  targetId?: string;
}

export interface UserSettings {
  notificationsEnabled: boolean;
  profileInteractionNotifications: boolean;
  soundEnabled: boolean;
  animationsEnabled: boolean;
  hapticsEnabled: boolean;
  showOnlineStatus: boolean;
  presenceVisibility: PresenceVisibility;
  profileVisibility: ProfileVisibility;
  messagePrivacy: AudienceRule;
  storyPrivacy: AudienceRule;
  onlineStatusPrivacy: AudienceRule;
  readReceipts: boolean;
  allowFriendRequests: boolean;
  profileLikesEnabled: boolean;
  blurSensitivePreviews: boolean;
  safetyReminders: boolean;
  glowIntensity: "subtle" | "full";
  compactMode: boolean;
  themePreference: ThemePreference;
  repeatPrevention: boolean;
}

export interface FriendActivityItem {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface FriendRequestRecord {
  id: string;
  senderId: string;
  receiverId: string;
  createdAt: string;
}

export interface CloudProfileRow {
  id: string;
  username: string;
  display_name: string;
  date_of_birth?: string | null;
  age_bracket: AgeBracket | null;
  bio: string;
  status: string;
  interests: string[];
  avatar_url: string | null;
  banner_url: string | null;
  favorite_music?: string | null;
  favorite_games?: string[] | null;
  favorite_hobbies?: string[] | null;
  school_grade?: string | null;
  pronouns?: string | null;
  favorite_sports?: string[] | null;
  accent_color?: string | null;
  profile_badges?: string[] | null;
  created_at?: string;
  updated_at?: string;
  video_gender?: VideoGenderIdentity | null;
  country_code?: string | null;
  country_name?: string | null;
  state_region?: string | null;
  city?: string | null;
  location_visibility?: LocationVisibility | null;
}

export interface DiscoveryFilters {
  interests: Interest[];
  onlineOnly: boolean;
  sort: DiscoverySort;
  query?: string;
  offset?: number;
  limit?: number;
}

export interface SwipeDecisionResult {
  matched: boolean;
  matchId?: string;
  targetId: string;
}

export interface VybeMatch {
  id: string;
  userId: string;
  status: MatchStatus;
  createdAt: string;
  lastActivityAt: string;
}

export interface ModerationCase {
  id: string;
  sourceType: "message" | "story" | "profile" | "report" | "video_session";
  sourceId: string;
  subjectUserId: string;
  reporterId?: string | null;
  categories: string[];
  severity: ModerationSeverity;
  status: ModerationStatus;
  hidden: boolean;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  displayName: string;
  accountStatus: "active" | "warned" | "suspended" | "banned";
  suspendedUntil?: string | null;
  createdAt?: string;
}

export interface ModerationAppeal {
  id: string;
  userId: string;
  enforcementStatus: "warned" | "suspended" | "banned";
  reason: string;
  status: "pending" | "reviewing" | "approved" | "denied";
  reviewerId?: string | null;
  reviewerNotes?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface ModerationLog {
  id: string;
  adminId: string;
  action: AdminActionType | "dismiss";
  targetUserId?: string | null;
  flagId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  notes: string;
  createdAt: string;
}

export interface CloudSnapshot {
  currentUserId: string;
  profile: CloudProfileRow;
  currentProfile: CurrentProfile;
  people: PublicProfile[];
  friendStatuses: Record<string, "pending" | "friends" | "blocked">;
  matchStatuses: Record<string, MatchStatus>;
  matches: VybeMatch[];
  incomingRequestIds: string[];
  requestIdsByUser: Record<string, string>;
  messages: Record<string, Message[]>;
  conversationIdsByUser: Record<string, string>;
  notifications: NotificationItem[];
  settings?: UserSettings;
  stories?: StoryItem[];
  groups?: GroupConversation[];
  groupMessages?: Record<string, Message[]>;
  mutedConversationIds?: string[];
  isAdmin?: boolean;
}


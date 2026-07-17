"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/data-mode";
import {
  AVATAR_OPTIONS,
  BANNER_OPTIONS,
  PROFILE_STATUSES,
} from "@/lib/mock-data";
import type {
  AuthService,
  CreateStoryInput,
  SendMessageInput,
  SocialPlatformService,
} from "@/services/contracts";
import type {
  AdminUserSummary,
  CloudProfileRow,
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
  SimUser,
  StoryItem,
  UserSettings,
  VybeMatch,
} from "@/types";

const PROFILE_SELECT =
  "id,username,display_name,age_bracket,bio,status,interests,avatar_url,banner_url,favorite_music,favorite_games,favorite_hobbies,school_grade,pronouns,favorite_sports,accent_color,profile_badges,created_at,updated_at";
const DEFAULT_ACCENT = "#1686ff";

type PresenceRow = {
  user_id?: string;
  is_online?: boolean;
  last_seen_at?: string | null;
  presence_state?: string | null;
};
type DiscoveryRow = CloudProfileRow & {
  compatibility_score?: number | null;
  mutual_friends_count?: number | null;
  presence_state?: string | null;
  last_seen_at?: string | null;
};
type ConversationRow = {
  id: string;
  user_a: string | null;
  user_b: string | null;
  conversation_type: "direct" | "group";
  title: string | null;
  icon_path: string | null;
  owner_id: string | null;
  last_message_at: string | null;
  created_at: string;
};
type ParticipantRow = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "member";
  membership_status: "invited" | "active" | "left" | "removed";
  last_read_at: string | null;
  muted_until: string | null;
};

function assertNoError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

function audienceValue(
  value: unknown,
  fallback: "friends" | "everyone" = "friends",
) {
  return value === "everyone" ||
    value === "friends" ||
    value === "matches" ||
    value === "nobody"
    ? value
    : fallback;
}

function mapSettings(
  row: Record<string, unknown> | null,
): UserSettings | undefined {
  if (!row) return undefined;
  const presenceVisibility =
    row.presence_visibility === "hidden" ||
    row.presence_visibility === "recently"
      ? row.presence_visibility
      : "precise";
  const oldVisibility =
    row.profile_visibility === "discovery"
      ? "everyone"
      : row.profile_visibility === "connections"
        ? "friends"
        : row.profile_visibility;
  return {
    notificationsEnabled: row.notifications_enabled !== false,
    profileInteractionNotifications: Boolean(
      row.profile_interaction_notifications,
    ),
    soundEnabled: row.sound_enabled !== false,
    animationsEnabled: row.animations_enabled !== false,
    hapticsEnabled: row.haptics_enabled !== false,
    showOnlineStatus:
      presenceVisibility !== "hidden" && row.show_online_status !== false,
    presenceVisibility,
    profileVisibility: audienceValue(oldVisibility, "everyone"),
    messagePrivacy: audienceValue(row.message_privacy),
    storyPrivacy: audienceValue(row.story_privacy),
    onlineStatusPrivacy: audienceValue(row.online_status_privacy),
    readReceipts: row.read_receipts !== false,
    allowFriendRequests: row.allow_friend_requests !== false,
    profileLikesEnabled: Boolean(row.profile_likes_enabled),
    blurSensitivePreviews: Boolean(row.blur_sensitive_previews),
    safetyReminders: row.safety_reminders !== false,
    glowIntensity: row.glow_intensity === "subtle" ? "subtle" : "full",
    compactMode: Boolean(row.compact_mode),
    themePreference:
      row.theme_preference === "dark" || row.theme_preference === "light"
        ? row.theme_preference
        : "system",
    repeatPrevention: row.repeat_prevention !== false,
  };
}

function toSettingsRow(settings: UserSettings) {
  return {
    notifications_enabled: settings.notificationsEnabled,
    profile_interaction_notifications: settings.profileInteractionNotifications,
    sound_enabled: settings.soundEnabled,
    animations_enabled: settings.animationsEnabled,
    haptics_enabled: settings.hapticsEnabled,
    show_online_status:
      settings.showOnlineStatus && settings.presenceVisibility !== "hidden",
    presence_visibility: settings.presenceVisibility,
    profile_visibility: settings.profileVisibility,
    message_privacy: settings.messagePrivacy,
    story_privacy: settings.storyPrivacy,
    online_status_privacy: settings.onlineStatusPrivacy,
    read_receipts: settings.readReceipts,
    allow_friend_requests: settings.allowFriendRequests,
    profile_likes_enabled: settings.profileLikesEnabled,
    blur_sensitive_previews: settings.blurSensitivePreviews,
    safety_reminders: settings.safetyReminders,
    glow_intensity: settings.glowIntensity,
    compact_mode: settings.compactMode,
    theme_preference: settings.themePreference,
    repeat_prevention: settings.repeatPrevention,
    updated_at: new Date().toISOString(),
  };
}

async function signedMediaUrl(
  client: SupabaseClient,
  path: string | null | undefined,
  bucket: string,
  expires = 3600,
) {
  if (!path) return null;
  if (
    path.startsWith("/") ||
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("http")
  )
    return path;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expires, { download: false });
  return error ? null : data.signedUrl;
}

function readablePresence(presence?: PresenceRow) {
  if (presence?.presence_state === "online" || presence?.is_online)
    return { online: true, label: "Online now" };
  if (presence?.presence_state === "recently")
    return { online: false, label: "Recently active" };
  if (presence?.last_seen_at)
    return {
      online: false,
      label: `Last seen ${new Date(presence.last_seen_at).toLocaleString()}`,
    };
  return { online: false, label: "Offline" };
}

function profileCompletion(row: CloudProfileRow) {
  const checks = [
    row.avatar_url,
    row.banner_url,
    row.bio,
    row.interests?.length,
    row.favorite_music,
    row.favorite_games?.length,
    row.favorite_hobbies?.length,
    row.favorite_sports?.length,
    row.school_grade,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

async function rowToUser(
  client: SupabaseClient,
  row: DiscoveryRow,
  presence?: PresenceRow,
): Promise<SimUser> {
  const [avatarUrl, bannerUrl] = await Promise.all([
    signedMediaUrl(client, row.avatar_url, "profile-avatars"),
    signedMediaUrl(client, row.banner_url, "profile-banners"),
  ]);
  const status = PROFILE_STATUSES.includes(row.status as never)
    ? (row.status as SimUser["status"])
    : "✨ Looking for new friends";
  const presenceInfo = readablePresence({
    ...presence,
    presence_state: row.presence_state ?? presence?.presence_state,
    last_seen_at: row.last_seen_at ?? presence?.last_seen_at,
  });
  const games = row.favorite_games || [];
  const sports = row.favorite_sports || [];
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    ageBracket: row.age_bracket || "13-15",
    interests: (row.interests || []) as Interest[],
    online: presenceInfo.online,
    lastSeen: presenceInfo.label,
    status,
    statusLine: status,
    bio: row.bio || "New to VYBE.",
    personality: "Real VYBE member",
    favoriteMusic: row.favorite_music || "Not shared",
    favoriteGame: games[0] || "Not shared",
    favoriteSport: sports[0] || "Not shared",
    favoriteGames: games,
    favoriteHobbies: row.favorite_hobbies || [],
    favoriteSports: sports,
    schoolGrade: row.school_grade || "",
    pronouns: row.pronouns || "",
    accentColor: row.accent_color || DEFAULT_ACCENT,
    profileBadges: row.profile_badges || [],
    profileCompletion: profileCompletion(row),
    banner: bannerUrl || BANNER_OPTIONS[0],
    avatar: {
      image: avatarUrl || AVATAR_OPTIONS[0],
      gradient: "from-blue-500 via-blue-800 to-slate-950",
    },
    compatibilityScore: row.compatibility_score ?? undefined,
    mutualFriendsCount: row.mutual_friends_count ?? undefined,
    createdAt: row.created_at,
  };
}

async function requireUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  assertNoError(error, "Authentication required");
  if (!data.user) throw new Error("Authentication required");
  return data.user;
}

function notificationType(
  row: Record<string, unknown>,
): NotificationItem["type"] {
  const title = String(row.title || "").toLowerCase();
  if (title.includes("story")) return "story";
  if (title.includes("voice")) return "voice";
  if (title.includes("group")) return "group";
  if (title.includes("moderation") || title.includes("safety"))
    return "moderation";
  if (title.includes("vybe") || title.includes("match")) return "match";
  if (title.includes("profile")) return "profile";
  if (row.type === "message") return "message";
  if (row.type === "friend_request" || row.type === "friend_accepted")
    return "friend";
  if (row.type === "safety") return "safety";
  return "system";
}

export const supabaseAuthService: AuthService = {
  async signUp({ email, password, username, displayName, dateOfBirth }) {
    const client = createClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/onboarding/age`,
        data: {
          username,
          display_name: displayName || username,
          date_of_birth: dateOfBirth,
        },
      },
    });
    assertNoError(error, "Unable to create account");
    return { needsEmailVerification: !data.session };
  },
  async login(email, password) {
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    assertNoError(error, "Unable to log in");
  },
  async logout() {
    const { error } = await createClient().auth.signOut();
    assertNoError(error, "Unable to log out");
  },
  async sendPasswordReset(email) {
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
    });
    assertNoError(error, "Unable to send reset email");
  },
  async updatePassword(password) {
    const { error } = await createClient().auth.updateUser({ password });
    assertNoError(error, "Unable to update password");
  },
};

class SupabasePlatformService implements SocialPlatformService {
  private client = createClient();
  private conversationIdsByUser: Record<string, string> = {};

  private async authorizeRealtime() {
    const { data, error } = await this.client.auth.getSession();
    assertNoError(error, "Unable to authorize realtime");
    if (!data.session?.access_token) throw new Error("Authentication required");
    await this.client.realtime.setAuth(data.session.access_token);
  }

  async loadSnapshot(): Promise<CloudSnapshot> {
    const user = await requireUser(this.client);
    const [
      profileResult,
      requestsResult,
      friendshipsResult,
      blocksResult,
      matchesResult,
      conversationsResult,
      participantsResult,
      notificationsResult,
      settingsResult,
      storiesResult,
      adminResult,
    ] = await Promise.all([
      this.client.rpc("get_my_profile"),
      this.client
        .from("friend_requests")
        .select("id,sender_id,receiver_id,created_at")
        .order("created_at", { ascending: false }),
      this.client.from("friendships").select("user_a,user_b,created_at"),
      this.client.from("blocks").select("blocker_id,blocked_id,created_at"),
      this.client
        .from("matches")
        .select("id,user_a,user_b,status,created_at,last_activity_at")
        .order("last_activity_at", { ascending: false }),
      this.client
        .from("conversations")
        .select(
          "id,user_a,user_b,conversation_type,title,icon_path,owner_id,last_message_at,created_at",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      this.client
        .from("conversation_participants")
        .select(
          "conversation_id,user_id,role,membership_status,last_read_at,muted_until",
        ),
      this.client
        .from("notifications")
        .select(
          "id,user_id,actor_id,type,title,body,entity_id,read_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(150),
      this.client
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      this.client
        .from("stories")
        .select(
          "id,user_id,media_type,media_path,body,background_color,created_at,expires_at",
        )
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(150),
      this.client
        .from("admin_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    [
      profileResult,
      requestsResult,
      friendshipsResult,
      blocksResult,
      matchesResult,
      conversationsResult,
      participantsResult,
      notificationsResult,
      storiesResult,
    ].forEach((result) =>
      assertNoError(result.error, "Unable to load VYBE account data"),
    );

    const profile = (
      Array.isArray(profileResult.data)
        ? profileResult.data[0]
        : profileResult.data
    ) as CloudProfileRow | undefined;
    if (!profile)
      throw new Error(
        "Your profile is incomplete. Finish signup or run all VYBE migrations.",
      );
    if (!profile.age_bracket)
      throw new Error("VYBE currently supports accounts ages 13 through 17.");

    const requests = (requestsResult.data || []) as Array<{
      id: string;
      sender_id: string;
      receiver_id: string;
    }>;
    const friendships = (friendshipsResult.data || []) as Array<{
      user_a: string;
      user_b: string;
    }>;
    const blocks = (blocksResult.data || []) as Array<{
      blocker_id: string;
      blocked_id: string;
    }>;
    const matchRows = (matchesResult.data || []) as Array<{
      id: string;
      user_a: string;
      user_b: string;
      status: "active" | "unmatched";
      created_at: string;
      last_activity_at: string;
    }>;
    const conversations = (conversationsResult.data || []) as ConversationRow[];
    const participants = (participantsResult.data || []) as ParticipantRow[];

    const personIds = new Set<string>();
    requests.forEach((request) =>
      personIds.add(
        request.sender_id === user.id ? request.receiver_id : request.sender_id,
      ),
    );
    friendships.forEach((row) =>
      personIds.add(row.user_a === user.id ? row.user_b : row.user_a),
    );
    blocks.forEach((row) => personIds.add(row.blocked_id));
    matchRows.forEach((row) =>
      personIds.add(row.user_a === user.id ? row.user_b : row.user_a),
    );
    conversations
      .filter((row) => row.conversation_type === "direct")
      .forEach((row) =>
        personIds.add(
          row.user_a === user.id ? String(row.user_b) : String(row.user_a),
        ),
      );
    participants.forEach((row) => {
      if (row.user_id !== user.id) personIds.add(row.user_id);
    });
    ((storiesResult.data || []) as Array<{ user_id: string }>).forEach(
      (row) => {
        if (row.user_id !== user.id) personIds.add(row.user_id);
      },
    );

    const ids = [...personIds].filter(Boolean);
    const [profilesResult, presenceResult] = ids.length
      ? await Promise.all([
          this.client.from("profiles").select(PROFILE_SELECT).in("id", ids),
          this.client
            .from("user_presence")
            .select("user_id,is_online,last_seen_at")
            .in("user_id", ids),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    assertNoError(profilesResult.error, "Unable to load connected profiles");
    assertNoError(presenceResult.error, "Unable to load presence");
    const presenceMap = Object.fromEntries(
      ((presenceResult.data || []) as PresenceRow[]).map((row) => [
        String(row.user_id),
        row,
      ]),
    );
    const people = await Promise.all(
      ((profilesResult.data || []) as CloudProfileRow[]).map((row) =>
        rowToUser(this.client, row, presenceMap[row.id]),
      ),
    );

    const friendStatuses: Record<string, "pending" | "friends" | "blocked"> =
      {};
    const incomingRequestIds: string[] = [];
    const requestIdsByUser: Record<string, string> = {};
    requests.forEach((request) => {
      const other =
        request.sender_id === user.id ? request.receiver_id : request.sender_id;
      requestIdsByUser[other] = request.id;
      if (request.receiver_id === user.id) incomingRequestIds.push(other);
      else friendStatuses[other] = "pending";
    });
    friendships.forEach((row) => {
      friendStatuses[row.user_a === user.id ? row.user_b : row.user_a] =
        "friends";
    });
    blocks.forEach((row) => {
      friendStatuses[row.blocked_id] = "blocked";
    });

    const matchStatuses: Record<string, "active" | "unmatched"> = {};
    const matches: VybeMatch[] = matchRows.map((row) => {
      const other = row.user_a === user.id ? row.user_b : row.user_a;
      matchStatuses[other] = row.status;
      return {
        id: row.id,
        userId: other,
        status: row.status,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
      };
    });

    const activeMemberships = participants.filter(
      (row) => row.user_id === user.id && row.membership_status === "active",
    );
    const activeConversationIds = activeMemberships.map(
      (row) => row.conversation_id,
    );
    const lastReadByConversation = Object.fromEntries(
      activeMemberships.map((row) => [row.conversation_id, row.last_read_at]),
    );
    const mutedConversationIds = activeMemberships
      .filter(
        (row) => row.muted_until && new Date(row.muted_until) > new Date(),
      )
      .map((row) => row.conversation_id);

    this.conversationIdsByUser = {};
    conversations
      .filter((row) => row.conversation_type === "direct")
      .forEach((row) => {
        const other = row.user_a === user.id ? row.user_b : row.user_a;
        if (other) this.conversationIdsByUser[other] = row.id;
      });

    const messageMap: Record<string, Message[]> = {};
    const groupMessages: Record<string, Message[]> = {};
    if (activeConversationIds.length) {
      const messageResult = await this.client
        .from("messages")
        .select(
          "id,conversation_id,sender_id,receiver_id,body,message_type,media_path,media_duration_seconds,waveform,reply_to_id,forwarded_from_id,story_id,created_at,deleted_for_everyone_at",
        )
        .in("conversation_id", activeConversationIds)
        .order("created_at", { ascending: true })
        .limit(2000);
      assertNoError(messageResult.error, "Unable to load messages");
      const messageRows = (messageResult.data || []) as Array<
        Record<string, unknown>
      >;
      const messageIds = messageRows.map((row) => String(row.id));
      const [reactionResult, receiptResult, pinResult] = messageIds.length
        ? await Promise.all([
            this.client
              .from("message_reactions")
              .select("message_id,user_id,emoji")
              .in("message_id", messageIds),
            this.client
              .from("message_receipts")
              .select("message_id,user_id,delivered_at,read_at")
              .in("message_id", messageIds),
            this.client
              .from("message_pins")
              .select("conversation_id,message_id")
              .in("message_id", messageIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
      [reactionResult, receiptResult, pinResult].forEach((result) =>
        assertNoError(result.error, "Unable to load message state"),
      );
      const reactionMap: Record<
        string,
        { counts: Record<string, number>; mine?: string }
      > = {};
      (
        (reactionResult.data || []) as Array<{
          message_id: string;
          user_id: string;
          emoji: string;
        }>
      ).forEach((row) => {
        reactionMap[row.message_id] ||= { counts: {} };
        reactionMap[row.message_id].counts[row.emoji] =
          (reactionMap[row.message_id].counts[row.emoji] || 0) + 1;
        if (row.user_id === user.id)
          reactionMap[row.message_id].mine = row.emoji;
      });
      const receiptMap: Record<
        string,
        Array<{
          user_id: string;
          delivered_at: string | null;
          read_at: string | null;
        }>
      > = {};
      (
        (receiptResult.data || []) as Array<{
          message_id: string;
          user_id: string;
          delivered_at: string | null;
          read_at: string | null;
        }>
      ).forEach((row) => (receiptMap[row.message_id] ||= []).push(row));
      const pinned = new Set(
        ((pinResult.data || []) as Array<{ message_id: string }>).map(
          (row) => row.message_id,
        ),
      );
      const conversationById = Object.fromEntries(
        conversations.map((row) => [row.id, row]),
      );
      for (const row of messageRows) {
        const conversationId = String(row.conversation_id);
        const conversation = conversationById[conversationId];
        if (!conversation) continue;
        const mediaType = String(row.message_type || "text") as Message["type"];
        const bucket = mediaType === "voice" ? "voice-messages" : "chat-media";
        const mediaUrl = row.media_path
          ? await signedMediaUrl(
              this.client,
              String(row.media_path),
              bucket,
              1800,
            )
          : undefined;
        const receipts = receiptMap[String(row.id)] || [];
        const mine = row.sender_id === user.id;
        const readByOthers = receipts.filter(
          (receipt) => receipt.user_id !== user.id && receipt.read_at,
        ).length;
        const allDelivered =
          receipts.length > 0 &&
          receipts.every((receipt) => receipt.delivered_at || receipt.read_at);
        const allRead =
          receipts.length > 0 && receipts.every((receipt) => receipt.read_at);
        const lastRead = lastReadByConversation[conversationId];
        const message: Message = {
          id: String(row.id),
          conversationId,
          senderId: mine ? "me" : String(row.sender_id),
          text: row.deleted_for_everyone_at
            ? "Message deleted"
            : String(row.body || ""),
          type: mediaType,
          mediaPath: row.media_path ? String(row.media_path) : undefined,
          mediaUrl: mediaUrl || undefined,
          durationSeconds: row.media_duration_seconds
            ? Number(row.media_duration_seconds)
            : undefined,
          waveform: Array.isArray(row.waveform)
            ? (row.waveform as number[])
            : [],
          replyToId: row.reply_to_id ? String(row.reply_to_id) : undefined,
          forwardedFromId: row.forwarded_from_id
            ? String(row.forwarded_from_id)
            : undefined,
          storyId: row.story_id ? String(row.story_id) : undefined,
          createdAt: String(row.created_at),
          read: mine
            ? allRead
            : Boolean(
                lastRead &&
                new Date(String(row.created_at)) <= new Date(lastRead),
              ),
          deliveryStatus: mine
            ? allRead
              ? "read"
              : allDelivered
                ? "delivered"
                : "sending"
            : "delivered",
          reactions: reactionMap[String(row.id)]?.counts || {},
          myReaction: reactionMap[String(row.id)]?.mine,
          deletedForEveryone: Boolean(row.deleted_for_everyone_at),
          pinned: pinned.has(String(row.id)),
          seenByCount: readByOthers,
        };
        if (conversation.conversation_type === "group")
          (groupMessages[conversationId] ||= []).push(message);
        else {
          const other =
            conversation.user_a === user.id
              ? conversation.user_b
              : conversation.user_a;
          if (other) (messageMap[other] ||= []).push(message);
        }
      }
    }

    const groups: GroupConversation[] = await Promise.all(
      conversations
        .filter((row) => row.conversation_type === "group")
        .map(async (row) => {
          const members = participants.filter(
            (member) => member.conversation_id === row.id,
          );
          return {
            id: row.id,
            title: row.title || "VYBE Group",
            iconPath: row.icon_path,
            iconUrl: await signedMediaUrl(
              this.client,
              row.icon_path,
              "group-icons",
            ),
            ownerId: row.owner_id || "",
            memberIds: members
              .filter((member) => member.membership_status === "active")
              .map((member) => member.user_id),
            invitedIds: members
              .filter((member) => member.membership_status === "invited")
              .map((member) => member.user_id),
            lastMessageAt: row.last_message_at,
            createdAt: row.created_at,
            muted: mutedConversationIds.includes(row.id),
            pinnedMessageIds: (groupMessages[row.id] || [])
              .filter((message) => message.pinned)
              .map((message) => message.id),
          };
        }),
    );

    const storyRows = (storiesResult.data || []) as Array<
      Record<string, unknown>
    >;
    const storyIds = storyRows.map((row) => String(row.id));
    const [storyReactionResult, storyViewResult] = storyIds.length
      ? await Promise.all([
          this.client
            .from("story_reactions")
            .select("story_id,user_id,emoji")
            .in("story_id", storyIds),
          this.client
            .from("story_views")
            .select("story_id,viewer_id")
            .in("story_id", storyIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    const storyReactions: Record<
      string,
      { counts: Record<string, number>; mine?: string }
    > = {};
    (
      (storyReactionResult.data || []) as Array<{
        story_id: string;
        user_id: string;
        emoji: string;
      }>
    ).forEach((row) => {
      storyReactions[row.story_id] ||= { counts: {} };
      storyReactions[row.story_id].counts[row.emoji] =
        (storyReactions[row.story_id].counts[row.emoji] || 0) + 1;
      if (row.user_id === user.id)
        storyReactions[row.story_id].mine = row.emoji;
    });
    const storyViews: Record<string, string[]> = {};
    (
      (storyViewResult.data || []) as Array<{
        story_id: string;
        viewer_id: string;
      }>
    ).forEach((row) => (storyViews[row.story_id] ||= []).push(row.viewer_id));
    const stories: StoryItem[] = await Promise.all(
      storyRows.map(async (row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        mediaType: String(row.media_type) as StoryItem["mediaType"],
        mediaPath: row.media_path ? String(row.media_path) : null,
        mediaUrl: row.media_path
          ? await signedMediaUrl(
              this.client,
              String(row.media_path),
              "stories",
              1800,
            )
          : null,
        text: row.body ? String(row.body) : null,
        backgroundColor: String(row.background_color || DEFAULT_ACCENT),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        viewed: (storyViews[String(row.id)] || []).includes(user.id),
        reactionCounts: storyReactions[String(row.id)]?.counts || {},
        myReaction: storyReactions[String(row.id)]?.mine,
        viewerCount:
          String(row.user_id) === user.id
            ? (storyViews[String(row.id)] || []).length
            : undefined,
      })),
    );

    const notifications = (
      (notificationsResult.data || []) as Array<Record<string, unknown>>
    ).map((row): NotificationItem => {
      const type = notificationType(row);
      const actor = row.actor_id ? String(row.actor_id) : undefined;
      const entity = row.entity_id ? String(row.entity_id) : undefined;
      let href: string | undefined;
      if (
        String(row.title || "")
          .toLowerCase()
          .includes("video vybe") &&
        entity
      )
        href = `/solo?session=${entity}`;
      else if (type === "match") href = "/matches";
      else if (type === "story") href = "/stories";
      else if (type === "group" && entity) href = `/chat/group/${entity}`;
      else if ((type === "message" || type === "voice") && entity) {
        const group = conversations.find(
          (conversation) =>
            conversation.id === entity &&
            conversation.conversation_type === "group",
        );
        href = group
          ? `/chat/group/${entity}`
          : actor
            ? `/chat/${actor}`
            : "/chat";
      } else if (String(row.type) === "friend_request") href = "/requests";
      else if (String(row.type) === "friend_accepted") href = "/friends";
      else if (type === "profile" && actor) href = `/profile/${actor}`;
      else if (type === "moderation" || type === "safety") href = "/safety";
      return {
        id: String(row.id),
        type,
        title: String(row.title),
        body: String(row.body),
        createdAt: String(row.created_at),
        read: Boolean(row.read_at),
        userId: actor,
        entityId: entity,
        href,
      };
    });

    return {
      currentUserId: user.id,
      profile,
      currentProfile: {
        username: profile.username,
        displayName: profile.display_name || profile.username,
        bio: profile.bio || "",
        status: (PROFILE_STATUSES.includes(profile.status as never)
          ? profile.status
          : "✨ Looking for new friends") as CurrentProfile["status"],
        profileImage: await signedMediaUrl(
          this.client,
          profile.avatar_url,
          "profile-avatars",
        ),
        profileImagePath: profile.avatar_url,
        avatarChoice: profile.avatar_url || AVATAR_OPTIONS[0],
        bannerChoice:
          (await signedMediaUrl(
            this.client,
            profile.banner_url,
            "profile-banners",
          )) || BANNER_OPTIONS[0],
        bannerPath: profile.banner_url,
        dateOfBirth: profile.date_of_birth || undefined,
        favoriteMusic: profile.favorite_music || "",
        favoriteGames: profile.favorite_games || [],
        favoriteHobbies: profile.favorite_hobbies || [],
        schoolGrade: profile.school_grade || "",
        pronouns: profile.pronouns || "",
        favoriteSports: profile.favorite_sports || [],
        accentColor: profile.accent_color || DEFAULT_ACCENT,
        profileBadges: profile.profile_badges || [],
        profileCompletion: profileCompletion(profile),
        videoGender: profile.video_gender || "unspecified",
        countryCode: profile.country_code || "",
        countryName: profile.country_name || "",
        stateRegion: profile.state_region || "",
        city: profile.city || "",
        locationVisibility: profile.location_visibility || "hidden",
      },
      people,
      friendStatuses,
      matchStatuses,
      matches,
      incomingRequestIds,
      requestIdsByUser,
      messages: messageMap,
      conversationIdsByUser: { ...this.conversationIdsByUser },
      notifications,
      settings: mapSettings(
        settingsResult.data as Record<string, unknown> | null,
      ),
      stories,
      groups,
      groupMessages,
      mutedConversationIds,
      isAdmin: Boolean(adminResult.data),
    };
  }

  async loadDiscovery(filters: DiscoveryFilters) {
    await requireUser(this.client);
    const { data, error } = await this.client.rpc("get_discovery_profiles", {
      interest_filters: filters.interests,
      online_only: filters.onlineOnly,
      sort_mode: filters.sort,
      search_query: filters.query || "",
      page_offset: filters.offset || 0,
      page_limit: filters.limit || 20,
    });
    assertNoError(error, "Unable to load discovery");
    return Promise.all(
      ((data || []) as DiscoveryRow[]).map((row) =>
        rowToUser(this.client, row),
      ),
    );
  }
  async searchProfiles(query: string, offset = 0, limit = 20) {
    const clean = query.trim();
    return clean.length < 2
      ? []
      : this.loadDiscovery({
          interests: [],
          onlineOnly: false,
          sort: "compatibility",
          query: clean,
          offset,
          limit,
        });
  }
  async submitSwipe(userId: string, decision: "like" | "pass") {
    const { data, error } = await this.client.rpc("submit_swipe", {
      target_user: userId,
      swipe_value: decision,
    });
    assertNoError(error, "Unable to save your decision");
    const row = (Array.isArray(data) ? data[0] : data) as {
      matched?: boolean;
      match_id?: string | null;
    } | null;
    return {
      matched: Boolean(row?.matched),
      matchId: row?.match_id || undefined,
      targetId: userId,
    };
  }
  async undoLastPass() {
    const { data, error } = await this.client.rpc("undo_last_pass");
    assertNoError(error, "Unable to undo pass");
    return (data as string | null) || null;
  }
  async loadMatches() {
    const user = await requireUser(this.client);
    const { data, error } = await this.client
      .from("matches")
      .select("id,user_a,user_b,status,created_at,last_activity_at")
      .order("last_activity_at", { ascending: false });
    assertNoError(error, "Unable to load matches");
    return (
      (data || []) as Array<{
        id: string;
        user_a: string;
        user_b: string;
        status: "active" | "unmatched";
        created_at: string;
        last_activity_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      userId: row.user_a === user.id ? row.user_b : row.user_a,
      status: row.status,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
    }));
  }
  async unmatch(matchId: string) {
    const { error } = await this.client.rpc("unmatch", {
      match_to_close: matchId,
    });
    assertNoError(error, "Unable to unmatch");
  }

  async updateProfile(profile: CurrentProfile, interests: string[]) {
    const user = await requireUser(this.client);
    const { error } = await this.client
      .from("profiles")
      .update({
        username: profile.username,
        display_name: profile.displayName,
        bio: profile.bio,
        status: profile.status,
        interests,
        avatar_url:
          profile.profileImagePath ??
          (profile.profileImage?.startsWith("data:")
            ? null
            : profile.avatarChoice),
        banner_url: profile.bannerPath ?? profile.bannerChoice,
        favorite_music: profile.favoriteMusic || "",
        favorite_games: profile.favoriteGames || [],
        favorite_hobbies: profile.favoriteHobbies || [],
        school_grade: profile.schoolGrade || "",
        pronouns: profile.pronouns || "",
        favorite_sports: profile.favoriteSports || [],
        accent_color: profile.accentColor || DEFAULT_ACCENT,
        video_gender: profile.videoGender || "unspecified",
        country_code: (profile.countryCode || "").toUpperCase().slice(0, 2),
        country_name: profile.countryName || "",
        state_region: profile.stateRegion || "",
        city: profile.city || "",
        location_visibility: profile.locationVisibility || "hidden",
      })
      .eq("id", user.id);
    assertNoError(error, "Unable to save profile");
  }
  async uploadProfileMedia(
    kind: "avatar" | "banner",
    file: File,
    previousPath?: string | null,
  ) {
    const user = await requireUser(this.client);
    const bucket = kind === "avatar" ? "profile-avatars" : "profile-banners";
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    assertNoError(error, "Unable to upload image");
    if (
      previousPath &&
      !previousPath.startsWith("/") &&
      !previousPath.startsWith("http") &&
      !previousPath.startsWith("data:")
    )
      await this.client.storage.from(bucket).remove([previousPath]);
    return path;
  }
  async deleteProfileMedia(kind: "avatar" | "banner", path: string) {
    if (
      !path ||
      path.startsWith("/") ||
      path.startsWith("http") ||
      path.startsWith("data:")
    )
      return;
    await requireUser(this.client);
    const { error } = await this.client.storage
      .from(kind === "avatar" ? "profile-avatars" : "profile-banners")
      .remove([path]);
    assertNoError(error, "Unable to remove image");
  }

  async sendFriendRequest(userId: string) {
    const user = await requireUser(this.client);
    const { error } = await this.client
      .from("friend_requests")
      .insert({ sender_id: user.id, receiver_id: userId });
    assertNoError(error, "Unable to send friend request");
  }
  async acceptFriendRequest(requestId: string) {
    const { error } = await this.client.rpc("accept_friend_request", {
      request_id: requestId,
    });
    assertNoError(error, "Unable to accept request");
  }
  async declineFriendRequest(requestId: string) {
    const { error } = await this.client.rpc("decline_friend_request", {
      request_id: requestId,
    });
    assertNoError(error, "Unable to decline request");
  }
  async cancelFriendRequest(requestId: string) {
    const { error } = await this.client.rpc("cancel_friend_request", {
      request_id: requestId,
    });
    assertNoError(error, "Unable to cancel request");
  }
  async unfriend(userId: string) {
    const { error } = await this.client.rpc("unfriend", { other_user: userId });
    assertNoError(error, "Unable to unfriend");
  }
  async block(userId: string) {
    const { error } = await this.client.rpc("block_user", {
      other_user: userId,
    });
    assertNoError(error, "Unable to block user");
  }
  async unblock(userId: string) {
    const { error } = await this.client.rpc("unblock_user", {
      other_user: userId,
    });
    assertNoError(error, "Unable to unblock user");
  }
  async report(
    userId: string,
    reason: string,
    notes: string,
    targetType:
      "profile" | "message" | "story" | "group" | "video_session" = "profile",
    targetId?: string,
  ) {
    const { error } = await this.client.rpc("submit_content_report", {
      reported_user: userId,
      content_type: targetType,
      content_id: targetId || userId,
      report_reason: reason,
      report_notes: notes,
    });
    assertNoError(error, "Unable to submit report");
  }

  async sendMessage(input: SendMessageInput) {
    const user = await requireUser(this.client);
    let conversationId = input.conversationId;
    if (!conversationId && input.userId) {
      conversationId = this.conversationIdsByUser[input.userId];
      if (!conversationId) {
        const { data, error } = await this.client.rpc(
          "get_or_create_conversation",
          { other_user: input.userId },
        );
        assertNoError(error, "Unable to open conversation");
        conversationId = String(data);
        this.conversationIdsByUser[input.userId] = conversationId;
      }
    }
    if (!conversationId) throw new Error("Conversation is required");
    const { error } = await this.client.functions.invoke("moderate-content", {
      body: {
        action: "send_message",
        conversationId,
        recipientId: input.userId,
        senderId: user.id,
        text: input.text || "",
        messageType: input.type || "text",
        mediaPath: input.mediaPath,
        durationSeconds: input.durationSeconds,
        waveform: input.waveform || [],
        replyToId: input.replyToId,
        forwardedFromId: input.forwardedFromId,
        storyId: input.storyId,
      },
    });
    assertNoError(error, "Unable to send moderated message");
  }

  async uploadConversationMedia(
    kind: "voice" | "image",
    conversationId: string,
    file: Blob,
    filename: string,
  ) {
    const user = await requireUser(this.client);
    const bucket = kind === "voice" ? "voice-messages" : "chat-media";
    const extension =
      filename
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || (kind === "voice" ? "webm" : "jpg");
    const path = `${user.id}/${conversationId}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
    assertNoError(error, `Unable to upload ${kind}`);
    return path;
  }
  async markConversationReadById(
    conversationId: string,
    shareReceipt: boolean,
  ) {
    const { error } = await this.client.rpc("mark_conversation_read", {
      target_conversation: conversationId,
      share_receipts: shareReceipt,
    });
    assertNoError(error, "Unable to mark conversation read");
  }
  async markConversationRead(userId: string, shareReceipt: boolean) {
    const id = this.conversationIdsByUser[userId];
    if (id) await this.markConversationReadById(id, shareReceipt);
  }
  async reactToMessage(messageId: string, emoji: string | null) {
    const user = await requireUser(this.client);
    if (!emoji) {
      const { error } = await this.client
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id);
      assertNoError(error, "Unable to remove reaction");
      return;
    }
    const { error } = await this.client
      .from("message_reactions")
      .upsert(
        { message_id: messageId, user_id: user.id, emoji },
        { onConflict: "message_id,user_id" },
      );
    assertNoError(error, "Unable to react");
  }
  async deleteMessageForMe(messageId: string) {
    const { error } = await this.client.rpc("delete_message_for_me", {
      target_message: messageId,
    });
    assertNoError(error, "Unable to hide message");
  }
  async deleteMessageForEveryone(messageId: string) {
    const { error } = await this.client.rpc("delete_message_for_everyone", {
      target_message: messageId,
    });
    assertNoError(error, "Unable to delete message");
  }
  async toggleMessagePin(messageId: string, pinned: boolean) {
    const { error } = await this.client.rpc("toggle_message_pin", {
      target_message: messageId,
      pin_message: pinned,
    });
    assertNoError(error, "Unable to update pin");
  }
  async setConversationMuted(conversationId: string, muted: boolean) {
    const { error } = await this.client.rpc("set_conversation_muted", {
      target_conversation: conversationId,
      muted,
    });
    assertNoError(error, "Unable to update mute setting");
  }

  async uploadStoryMedia(file: File) {
    const user = await requireUser(this.client);
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") ||
      (file.type.startsWith("video/") ? "mp4" : "jpg");
    const path = `${user.id}/story-${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage
      .from("stories")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
    assertNoError(error, "Unable to upload story");
    return path;
  }
  async createStory(input: CreateStoryInput) {
    const { error } = await this.client.functions.invoke("moderate-content", {
      body: {
        action: "create_story",
        mediaType: input.mediaType,
        mediaPath: input.mediaPath,
        text: input.text || "",
        backgroundColor: input.backgroundColor,
      },
    });
    assertNoError(error, "Unable to publish story");
  }
  async deleteStory(storyId: string) {
    const { error } = await this.client
      .from("stories")
      .delete()
      .eq("id", storyId);
    assertNoError(error, "Unable to delete story");
  }
  async viewStory(storyId: string) {
    const { error } = await this.client.rpc("record_story_view", {
      target_story: storyId,
    });
    assertNoError(error, "Unable to record story view");
  }
  async reactToStory(storyId: string, emoji: string) {
    const { error } = await this.client.rpc("react_to_story", {
      target_story: storyId,
      reaction: emoji,
    });
    assertNoError(error, "Unable to react to story");
  }
  async replyToStory(story: StoryItem, text: string) {
    await this.sendMessage({
      userId: story.userId,
      text,
      type: "text",
      storyId: story.id,
    });
  }

  async createGroup(title: string, memberIds: string[]) {
    const { data, error } = await this.client.rpc("create_group_chat", {
      group_title: title,
      invited_users: memberIds,
    });
    assertNoError(error, "Unable to create group");
    return String(data);
  }
  async respondGroupInvite(groupId: string, accept: boolean) {
    const { error } = await this.client.rpc("respond_group_invite", {
      group_id: groupId,
      accept_invite: accept,
    });
    assertNoError(error, "Unable to respond to invite");
  }
  async updateGroup(groupId: string, title?: string, iconPath?: string) {
    const { error } = await this.client.rpc("update_group_chat", {
      group_id: groupId,
      group_title: title || null,
      group_icon_path: iconPath || null,
    });
    assertNoError(error, "Unable to update group");
  }
  async uploadGroupIcon(groupId: string, file: File) {
    const user = await requireUser(this.client);
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${groupId}/icon-${crypto.randomUUID()}.${extension}`;
    const { error } = await this.client.storage
      .from("group-icons")
      .upload(path, file, { contentType: file.type, upsert: false });
    assertNoError(error, "Unable to upload group icon");
    return path;
  }
  async removeGroupMember(groupId: string, memberId: string) {
    const { error } = await this.client.rpc("remove_group_member", {
      group_id: groupId,
      member_id: memberId,
    });
    assertNoError(error, "Unable to remove member");
  }
  async leaveGroup(groupId: string) {
    const { error } = await this.client.rpc("leave_group_chat", {
      group_id: groupId,
    });
    assertNoError(error, "Unable to leave group");
  }

  async markNotificationRead(notificationId: string) {
    const user = await requireUser(this.client);
    const { error } = await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", user.id);
    assertNoError(error, "Unable to mark notification read");
  }
  async markAllNotificationsRead() {
    const user = await requireUser(this.client);
    const { error } = await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    assertNoError(error, "Unable to mark notifications read");
  }
  async recordProfileInteraction(userId: string) {
    const { error } = await this.client.rpc("record_profile_interaction", {
      target_user: userId,
    });
    assertNoError(error, "Unable to record profile interaction");
  }
  async likeProfile(userId: string) {
    const { error } = await this.client.rpc("like_profile", {
      target_user: userId,
    });
    assertNoError(error, "Unable to like profile");
  }
  async updateSettings(settings: UserSettings) {
    const user = await requireUser(this.client);
    const { error } = await this.client
      .from("user_settings")
      .upsert({ user_id: user.id, ...toSettingsRow(settings) });
    assertNoError(error, "Unable to save settings");
  }
  async setPresence(isOnline: boolean) {
    const { error } = await this.client.rpc("set_presence", {
      online: isOnline,
    });
    assertNoError(error, "Unable to update presence");
  }
  async submitAppeal(reason: string) {
    const { error } = await this.client.rpc("submit_moderation_appeal", {
      appeal_reason: reason,
    });
    assertNoError(error, "Unable to submit appeal");
  }
  async isAdmin() {
    const { data, error } = await this.client.rpc("is_vybe_admin", {
      check_user: (await requireUser(this.client)).id,
    });
    assertNoError(error, "Unable to verify admin access");
    return Boolean(data);
  }
  async loadModerationCases(): Promise<ModerationCase[]> {
    const { data, error } = await this.client
      .from("moderation_flags")
      .select(
        "id,source_type,source_id,subject_user_id,reporter_id,categories,severity,status,hidden,summary,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    assertNoError(error, "Unable to load moderation cases");
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      sourceType: String(row.source_type) as ModerationCase["sourceType"],
      sourceId: String(row.source_id),
      subjectUserId: String(row.subject_user_id),
      reporterId: row.reporter_id ? String(row.reporter_id) : null,
      categories: (row.categories || []) as string[],
      severity: String(row.severity) as ModerationCase["severity"],
      status: String(row.status) as ModerationCase["status"],
      hidden: Boolean(row.hidden),
      summary: String(row.summary || ""),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }
  async loadModerationAppeals(): Promise<ModerationAppeal[]> {
    const { data, error } = await this.client
      .from("moderation_appeals")
      .select(
        "id,user_id,enforcement_status,reason,status,reviewed_by,reviewed_at,reviewer_notes,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    assertNoError(error, "Unable to load appeals");
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      enforcementStatus: String(
        row.enforcement_status,
      ) as ModerationAppeal["enforcementStatus"],
      reason: String(row.reason),
      status: String(row.status) as ModerationAppeal["status"],
      reviewerId: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewerNotes: row.reviewer_notes ? String(row.reviewer_notes) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    }));
  }
  async loadModerationLogs(): Promise<ModerationLog[]> {
    const { data, error } = await this.client
      .from("moderation_logs")
      .select(
        "id,admin_id,action,target_user_id,flag_id,source_type,source_id,notes,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    assertNoError(error, "Unable to load moderation logs");
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      adminId: String(row.admin_id),
      action: String(row.action) as ModerationLog["action"],
      targetUserId: row.target_user_id ? String(row.target_user_id) : null,
      flagId: row.flag_id ? String(row.flag_id) : null,
      sourceType: row.source_type ? String(row.source_type) : null,
      sourceId: row.source_id ? String(row.source_id) : null,
      notes: String(row.notes || ""),
      createdAt: String(row.created_at),
    }));
  }
  async searchAdminUsers(query: string): Promise<AdminUserSummary[]> {
    const clean = query.trim();
    if (clean.length < 2) return [];
    const { data, error } = await this.client
      .from("profiles")
      .select("id,username,display_name,created_at")
      .or(
        `username.ilike.%${clean.replace(/[%_,]/g, "")}%,display_name.ilike.%${clean.replace(/[%_,]/g, "")}%`,
      )
      .limit(25);
    assertNoError(error, "Unable to search users");
    const ids = ((data || []) as Array<{ id: string }>).map((row) => row.id);
    const enforcement = ids.length
      ? await this.client
          .from("account_enforcement")
          .select("user_id,status,suspended_until")
          .in("user_id", ids)
      : { data: [], error: null };
    const map = Object.fromEntries(
      (
        (enforcement.data || []) as Array<{
          user_id: string;
          status: AdminUserSummary["accountStatus"];
          suspended_until: string | null;
        }>
      ).map((row) => [row.user_id, row]),
    );
    return (
      (data || []) as Array<{
        id: string;
        username: string;
        display_name: string;
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      createdAt: row.created_at,
      accountStatus: map[row.id]?.status || "active",
      suspendedUntil: map[row.id]?.suspended_until,
    }));
  }
  async moderateCase(
    caseId: string,
    action:
      | "warn"
      | "suspend"
      | "ban"
      | "delete_message"
      | "delete_story"
      | "dismiss"
      | "restore",
    notes = "",
    suspensionHours = 24,
  ) {
    const { error } = await this.client.rpc("admin_moderation_action", {
      flag_to_action: caseId,
      action_name: action,
      action_notes: notes,
      suspension_hours: suspensionHours,
    });
    assertNoError(error, "Unable to apply moderation action");
  }
  async moderateUser(
    userId: string,
    action: "warn" | "suspend" | "ban" | "restore",
    notes = "",
    suspensionHours = 24,
  ) {
    const { error } = await this.client.rpc("admin_user_action", {
      target_user: userId,
      action_name: action,
      action_notes: notes,
      suspension_hours: suspensionHours,
    });
    assertNoError(error, "Unable to update account status");
  }
  async reviewAppeal(
    appealId: string,
    decision: "approved" | "denied",
    notes = "",
  ) {
    const { error } = await this.client.rpc("review_moderation_appeal", {
      appeal_to_review: appealId,
      decision,
      review_notes: notes,
    });
    assertNoError(error, "Unable to review appeal");
  }

  async subscribeToPrivateData(onChange: () => void) {
    const user = await requireUser(this.client);
    await this.authorizeRealtime();
    const channels: RealtimeChannel[] = [];
    const tables = [
      "friend_requests",
      "friendships",
      "matches",
      "swipe_decisions",
      "conversations",
      "conversation_participants",
      "messages",
      "message_reactions",
      "message_receipts",
      "message_pins",
      "notifications",
      "user_presence",
      "blocks",
      "stories",
      "story_reactions",
      "story_views",
      "moderation_appeals",
    ];
    tables.forEach((table, index) => {
      const channel = this.client
        .channel(`vybe-db-${table}-${index}-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          onChange,
        )
        .subscribe();
      channels.push(channel);
    });
    return () => {
      channels.forEach((channel) => {
        void this.client.removeChannel(channel);
      });
    };
  }
  async subscribeTyping(
    conversationId: string,
    onTyping: (userId: string, typing: boolean) => void,
  ) {
    const user = await requireUser(this.client);
    await this.authorizeRealtime();
    const channel = this.client.channel(`conversation:${conversationId}`, {
      config: { private: true, broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const value = payload as { userId?: string; typing?: boolean };
      if (value.userId && value.userId !== user.id)
        onTyping(value.userId, Boolean(value.typing));
    });
    await channel.subscribe();
    return {
      send: async (typing: boolean) => {
        await channel.send({
          type: "broadcast",
          event: "typing",
          payload: { userId: user.id, typing },
        });
      },
      unsubscribe: async () => {
        await this.client.removeChannel(channel);
      },
    };
  }
}

let platform: SupabasePlatformService | null = null;
export function getSupabasePlatformService() {
  platform ??= new SupabasePlatformService();
  return platform;
}

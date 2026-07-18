import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const migrationFiles = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrationFiles.length >= 10, "Expected the complete production migration chain including real group video");
const sql = (await Promise.all(migrationFiles.map((name) => readFile(path.join(migrationDir, name), "utf8")))).join("\n").toLowerCase();

const rlsTables = [
  "profiles", "friend_requests", "friendships", "blocks", "conversations", "conversation_participants",
  "messages", "message_reactions", "notifications", "user_presence", "user_settings", "moderation_reports",
  "age_assurance_cases", "parental_consent_cases", "discovery_preferences", "swipe_decisions", "matches",
  "match_participants", "user_action_events", "message_hidden_users", "message_pins", "message_receipts",
  "stories", "story_views", "story_reactions", "profile_likes", "admin_roles", "account_enforcement",
  "moderation_flags", "moderation_logs", "moderation_appeals", "video_match_preferences", "video_match_queue",
  "video_sessions", "video_session_participants", "video_session_events", "video_moderation_events",
  "video_restrictions", "video_matchmaking_logs", "group_video_sessions", "group_video_session_participants",
  "group_video_match_queue", "group_video_session_events", "group_video_moderation_events", "group_video_matchmaking_logs",
];
for (const table of rlsTables) {
  assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`), `${table} must have RLS enabled`);
}

const checks = [
  ["database-derived age bracket", /before\s+insert\s+or\s+update\s+on\s+public\.profiles[\s\S]*set_profile_derived_fields/],
  ["same-age social safety", /same_age_bracket[\s\S]*friend_requests/],
  ["block-aware social access", /is_blocked_between[\s\S]*can_message/],
  ["conversation participant recursion hotfix", /current_user_has_conversation_access[\s\S]*security definer[\s\S]*row_security = off[\s\S]*participants_select_conversation_member/],
  ["friend-or-match DM authorization", /can_message[\s\S]*are_friends[\s\S]*has_active_match/],
  ["trusted message validation", /validate_message[\s\S]*sender is not an active participant[\s\S]*friendship or active match required/],
  ["message receipts and notifications", /after_message_insert[\s\S]*message_receipts[\s\S]*notifications/],
  ["private stories expire", /create table if not exists public\.stories[\s\S]*expires_at[\s\S]*interval '24 hours/],
  ["story audience enforcement", /can_view_story[\s\S]*story_privacy/],
  ["private media buckets", /voice-messages[\s\S]*chat-media[\s\S]*stories[\s\S]*group-icons/],
  ["storage owned-folder writes", /storage_phase4_insert_own[\s\S]*storage\.foldername\(name\)\)\[1\]=auth\.uid\(\)::text/],
  ["storage relationship reads", /storage_phase4_select_authorized[\s\S]*can_access_conversation[\s\S]*can_view_story/],
  ["admin-only moderation queues", /moderation_flags_admin_only[\s\S]*moderation_logs_admin_only/],
  ["admin actions audited", /admin_moderation_action[\s\S]*moderation_logs/],
  ["serialized solo pairing", /try_pair_video_queue[\s\S]*pg_advisory_xact_lock[\s\S]*vybe:video-matchmaking:v2/],
  ["solo polling retries pairing", /get_video_queue_status[\s\S]*try_pair_video_queue/],
  ["solo repeat prevention only after real connection", /video_pair_repeat_blocked[\s\S]*connected_at is not null[\s\S]*interval '12 hours'/],
  ["solo room token membership helper", /can_access_video_session[\s\S]*video_sessions/],
  ["group tables and 2-4 limit", /create table if not exists public\.group_video_sessions[\s\S]*max_participants between 2 and 4/],
  ["serialized group pairing", /try_assign_group_video_queue[\s\S]*pg_advisory_xact_lock[\s\S]*vybe:group-video-matchmaking:v1/],
  ["group pairwise eligibility", /group_video_pair_eligible[\s\S]*video_pair_eligible[\s\S]*video_gender_allows[\s\S]*video_location_allows[\s\S]*video_pair_repeat_blocked/],
  ["cross-mode repeat prevention requires connected participants", /video_pair_repeat_blocked[\s\S]*group_video_session_participants[\s\S]*first_participant\.connected_at is not null[\s\S]*second_participant\.connected_at is not null/],
  ["group membership checks every participant", /group_video_user_fits_session[\s\S]*not exists[\s\S]*group_video_pair_eligible/],
  ["group polling retries assignment", /get_group_video_queue_status[\s\S]*try_assign_group_video_queue/],
  ["group tokens restricted to members", /current_user_in_group_video_session[\s\S]*membership_status='active'/],
  ["group reporting reaches review", /group_video_moderation_events[\s\S]*moderation_state='flagged'/],
  ["private Realtime group video topics", /group-video-session:%[\s\S]*current_user_in_group_video_session/],
  ["Realtime database publication", /alter publication supabase_realtime add table public\.group_video_match_queue/],
  ["profile reports remain valid", /content_type not in \('profile','message','story','group','video_session','group_video_session'\)/],
  ["report RPC preserves UUID return contract", /submit_content_report\([\s\S]*?\)\s*returns uuid[\s\S]*return report_id/],
];
for (const [label, pattern] of checks) assert.match(sql, pattern, label);

const sourceFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
await walk(path.join(root, "src"));
const source = (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n").toLowerCase();
assert.doesNotMatch(source, /next_public_vybe_data_mode|demomatchmakingservice|mockprofileservice|demosolomatch|demo credentials|simulated user/, "Production source must not contain demo runtime paths");
assert.match(source, /join_video_queue/, "Solo video service must call the real queue RPC");
assert.match(source, /join_group_video_queue/, "Group video service must call the real queue RPC");
assert.match(source, /invokeauthenticatedfunction[\s\S]*moderate-content/, "Protected Edge Function calls must include the authenticated token helper");

const transcriptRoute = (await readFile(path.join(root, "src", "app", "api", "video", "moderation", "transcript", "route.ts"), "utf8")).toLowerCase();
assert.match(transcriptRoute, /group_video_sessions/, "Speech moderation must authorize group video sessions");
assert.match(transcriptRoute, /group_video_session_participants/, "Speech moderation must verify group membership");
assert.match(transcriptRoute, /group_video_moderation_events/, "Group speech violations must reach the moderation queue");
assert.doesNotMatch(transcriptRoute, /insert\([^)]*transcript|raw_transcript|audio_blob/, "Speech moderation must not persist raw transcripts or audio");

const safetyWorker = (await readFile(path.join(root, "workers", "video-safety-agent", "agent.py"), "utf8")).toLowerCase();
assert.match(safetyWorker, /participant_connected/, "Safety worker must attach to participants who join after room creation");
assert.match(safetyWorker, /participant_disconnected/, "Safety worker must release participant sessions on disconnect");
assert.match(safetyWorker, /agentsession/, "Safety worker must run isolated in-memory speech sessions");

console.log(`✓ Production security contract passed: ${migrationFiles.length} migrations, ${rlsTables.length} RLS tables, real solo/group queues, private chat/story media, dynamic speech moderation, and no demo runtime source.`);

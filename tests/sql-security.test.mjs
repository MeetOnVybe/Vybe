import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
assert.ok(files.length >= 9, "Expected migrations through the Phase 5 root-cause matchmaking hotfix");
const sql = (await Promise.all(files.map((name) => readFile(path.join(migrationDir, name), "utf8")))).join("\n").toLowerCase();

const exposedTables = [
  "profiles",
  "friend_requests",
  "friendships",
  "blocks",
  "conversations",
  "conversation_participants",
  "messages",
  "message_reactions",
  "notifications",
  "user_presence",
  "user_settings",
  "moderation_reports",
  "age_assurance_cases",
  "parental_consent_cases",
  "discovery_preferences",
  "swipe_decisions",
  "matches",
  "match_participants",
  "user_action_events",
  "message_hidden_users",
  "message_pins",
  "message_receipts",
  "stories",
  "story_views",
  "story_reactions",
  "profile_likes",
  "admin_roles",
  "account_enforcement",
  "moderation_flags",
  "moderation_logs",
  "moderation_appeals",
  "video_match_preferences",
  "video_match_queue",
  "video_sessions",
  "video_session_participants",
  "video_session_events",
  "video_moderation_events",
  "video_restrictions",
  "video_matchmaking_logs",
];

for (const table of exposedTables) {
  assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`), `${table} must have RLS enabled`);
}

const requirements = [
  ["case-insensitive unique usernames", /create\s+extension\s+if\s+not\s+exists\s+citext[\s\S]*username\s+citext\s+not\s+null\s+unique/],
  ["server-derived age bracket trigger", /before\s+insert\s+or\s+update\s+on\s+public\.profiles[\s\S]*set_profile_derived_fields/],
  ["dynamic age calculation from DOB", /calculate_age_bracket\(date_of_birth\)\s*=\s*public\.current_age_bracket\(\)/],
  ["duplicate undirected request prevention", /friend_requests_unique_pair[\s\S]*least\(sender_id,\s*receiver_id\)[\s\S]*greatest\(sender_id,\s*receiver_id\)/],
  ["self-request prevention", /friend_requests_not_self\s+check\s*\(sender_id\s*<>\s*receiver_id\)/],
  ["blocked relationship guard", /is_blocked_between\(new\.sender_id,\s*new\.receiver_id\)/],
  ["same-bracket request guard", /same_age_bracket\(new\.sender_id,\s*new\.receiver_id\)/],
  ["accepted friendship required for messages", /validate_message[\s\S]*are_friends\(new\.sender_id,\s*new\.receiver_id\)/],
  ["authenticated sender enforcement", /new\.sender_id\s*<>\s*auth\.uid\(\)[\s\S]*only send messages as yourself/],
  ["receiver-only receipt policy", /messages_update_receiver[\s\S]*receiver_id\s*=\s*auth\.uid\(\)/],
  ["own unread cursor", /participants_update_own_read_cursor[\s\S]*user_id\s*=\s*auth\.uid\(\)/],
  ["notification column-only update", /grant\s+update\s*\(read_at\)\s+on\s+public\.notifications/],
  ["presence privacy preference", /presence_select_friends[\s\S]*show_online_status/],
  ["private storage folders", /storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/],
  ["private conversation realtime topic", /realtime\.topic\(\)\s+like\s+'conversation:%'[\s\S]*are_friends/],
  ["future age assurance placeholder", /create\s+table\s+if\s+not\s+exists\s+public\.age_assurance_cases/],
  ["future parental consent placeholder", /create\s+table\s+if\s+not\s+exists\s+public\.parental_consent_cases/],

  ["theme and discovery privacy preferences", /theme_preference[\s\S]*profile_visibility[\s\S]*presence_visibility[\s\S]*repeat_prevention/],
  ["unique active decision row per pair", /create\s+table\s+if\s+not\s+exists\s+public\.swipe_decisions[\s\S]*primary\s+key\s*\(actor_id,\s*target_id\)/],
  ["unique sorted match pair", /create\s+table\s+if\s+not\s+exists\s+public\.matches[\s\S]*matches_sorted[\s\S]*unique\s*\(user_a,\s*user_b\)/],
  ["discovery same-bracket and block guard", /get_discovery_profiles[\s\S]*profile_is_discoverable\(p\.id\)[\s\S]*swipe_decisions/],
  ["search and discovery rate limits", /check_vybe_rate_limit[\s\S]*'discovery'[\s\S]*'search'/],
  ["mutual like match creation", /submit_swipe[\s\S]*reverse_like[\s\S]*insert\s+into\s+public\.matches/],
  ["match notifications only on new active match", /if\s+not\s+was_active[\s\S]*it''s a vybe/],
  ["unmatch deactivates pair decisions", /function\s+public\.unmatch[\s\S]*update\s+public\.swipe_decisions[\s\S]*active\s*=\s*false/],
  ["friend-or-match messaging authorization", /can_message[\s\S]*are_friends[\s\S]*has_active_match/],
  ["profile interaction opt-in and rate limit", /record_profile_interaction[\s\S]*profile_interaction_notifications[\s\S]*profile_view/],
  ["match and decision rows protected by RLS", /alter\s+table\s+public\.swipe_decisions\s+enable\s+row\s+level\s+security[\s\S]*alter\s+table\s+public\.matches\s+enable\s+row\s+level\s+security/],
  ["match tables are not directly writable by clients", /revoke\s+all\s+on\s+public\.discovery_preferences,\s*public\.swipe_decisions,\s*public\.matches/],
  ["match realtime authorization follows can_message", /realtime\.topic\(\)\s+like\s+'conversation:%'[\s\S]*can_message/],
  ["discovery search indexes", /profiles_username_lower_idx[\s\S]*profiles_interests_gin_idx[\s\S]*swipe_actor_active_updated_idx[\s\S]*matches_user_a_status_idx/],
  ["public function execution revoked", /revoke\s+execute\s+on\s+function\s+public\.get_or_create_conversation\(uuid\)\s+from\s+public,\s*anon/],

  ["private stories expire and enforce audience", /create\s+table\s+if\s+not\s+exists\s+public\.stories[\s\S]*expires_at[\s\S]*can_view_story/],
  ["groups reuse conversation participants", /conversation_type[\s\S]*group[\s\S]*create_group_chat[\s\S]*conversation_participants/],
  ["group invites limited to friends and age bracket", /create_group_chat[\s\S]*are_friends[\s\S]*same_age_bracket/],
  ["voice and chat media storage private", /voice-messages[\s\S]*chat-media[\s\S]*storage_phase4_select_authorized/],
  ["message deletion and pins are authorization checked", /delete_message_for_everyone[\s\S]*can_access_conversation[\s\S]*toggle_message_pin/],
  ["message receipt rows are participant protected", /message_receipts[\s\S]*message_receipts_participant_select[\s\S]*message_receipts_own_update/],
  ["moderation queue and logs admin-only", /moderation_flags_admin_only[\s\S]*moderation_logs_admin_only/],
  ["admin user actions require admin role", /admin_user_action[\s\S]*is_vybe_admin\(auth\.uid\(\)\)/],
  ["appeal review requires admin and audit log", /review_moderation_appeal[\s\S]*is_vybe_admin[\s\S]*moderation_logs/],
  ["profile admin access does not expose date of birth", /grant\s+select\s*\([^)]*\)\s+on\s+public\.profiles[\s\S]*profiles_select_phase4[\s\S]*is_vybe_admin/],
  ["blocked users cannot use profile RLS bypass", /profiles_select_phase4[\s\S]*can_view_profile\(id,auth\.uid\(\)\)[\s\S]*not public\.is_blocked_between\(auth\.uid\(\),id\)/],
  ["automated severe content can be hidden", /moderation_state[\s\S]*hidden[\s\S]*moderation_flags/],
  ["private realtime supports group conversations", /realtime\.topic\(\)\s+like\s+'conversation:%'[\s\S]*can_access_conversation/],

  ["video identity and coarse location only", /video_gender[\s\S]*location_visibility[\s\S]*country_code[\s\S]*state_region[\s\S]*city/],
  ["video queue enforces server age and blocks", /video_pair_eligible[\s\S]*same_age_bracket[\s\S]*is_blocked_between/],
  ["mutual video gender preferences", /video_gender_allows\(gender_value[\s\S]*video_gender_allows\(vp\.gender_preference/],
  ["bilateral location filters", /video_location_allows\(me,q\.user_id,location_value\)[\s\S]*video_location_allows\(q\.user_id,me,vp\.location_filter\)/],
  ["city requires both users to share city", /when 'city'[\s\S]*a\.location_visibility = 'city'[\s\S]*b\.location_visibility = 'city'/],
  ["video queue prevents duplicate active calls", /guard_video_session_insert[\s\S]*already has an active video session/],
  ["video queue uses row locking", /for update of q skip locked/],
  ["video repeat prevention", /video_pair_repeat_blocked[\s\S]*repeat_prevention[\s\S]*connected_at is not null[\s\S]*interval '12 hours'/],
  ["video skip abuse restriction", /video_skip[\s\S]*too many rapid skips[\s\S]*interval '10 minutes'/],
  ["stale video session cleanup", /expire_stale_video_sessions[\s\S]*stale_timeout/],
  ["video tokens require session membership", /can_access_video_session[\s\S]*viewer_user in \(s\.user_a, s\.user_b\)/],
  ["video session writes use RPCs", /revoke all on public\.video_match_preferences[\s\S]*video_restrictions from anon, authenticated/],
  ["private video realtime topics", /video-session:%[\s\S]*can_access_video_session/],
  ["video reports enter moderator review", /route_video_report_to_review[\s\S]*review_required/],
  ["sensitive location columns not directly selectable", /revoke select, update on public\.profiles from authenticated[\s\S]*grant select \([\s\S]*profile_badges,created_at,updated_at/],
  ["conversation participant recursion hotfix", /current_user_has_conversation_access[\s\S]*security definer[\s\S]*row_security = off[\s\S]*participants_select_conversation_member[\s\S]*current_user_has_conversation_access\(conversation_id\)/],
  ["serialized concurrent video pairing", /try_pair_video_queue[\s\S]*pg_advisory_xact_lock[\s\S]*vybe:video-matchmaking:v2/],
  ["queue polling retries deterministic pairing", /get_video_queue_status[\s\S]*pairing_result := public\.try_pair_video_queue\(me\)/],
  ["queue heartbeat retries deterministic pairing", /heartbeat_video_queue[\s\S]*perform public\.try_pair_video_queue\(auth\.uid\(\)\)/],
  ["pairing excludes candidates in active sessions", /not exists \(\s*select 1\s*from public\.video_sessions active_session[\s\S]*q\.user_id in \(active_session\.user_a, active_session\.user_b\)/],
  ["orphan connecting sessions expire", /status = 'connecting'[\s\S]*interval '75 seconds'[\s\S]*connected_at is null/],
  ["matchmaking eligibility diagnostics", /video_pair_eligibility_reason[\s\S]*recent_connected_repeat[\s\S]*reasoncounts/],
  ["matchmaking structured logs", /create table if not exists public\.video_matchmaking_logs[\s\S]*queue_join_requested[\s\S]*match_created[\s\S]*token_issued/],
  ["queue join remains the mutation entrypoint", /join_video_queue[\s\S]*queue_join_requested[\s\S]*queue_joined[\s\S]*try_pair_video_queue/],
];
for (const [label, pattern] of requirements) assert.match(sql, pattern, `Missing security requirement: ${label}`);

const rls = await readFile(path.join(root, "supabase", "migrations", "202607160002_phase2_rls.sql"), "utf8");
const profileGrant = rls.match(/grant select \(([^)]+)\) on public\.profiles to authenticated;/i)?.[1] ?? "";
assert.ok(profileGrant, "Expected a column-level profile select grant");
assert.ok(!profileGrant.toLowerCase().includes("date_of_birth"), "Date of birth must not be exposed by normal profile SELECT grants");

const sourceFiles = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
await collect(path.join(root, "src"));
const sourceEntries = await Promise.all(sourceFiles.map(async (file) => ({ file, text: await readFile(file, "utf8") })));
const source = sourceEntries.map((entry) => entry.text).join("\n");
const browserSource = sourceEntries
  .filter((entry) => !entry.file.includes(`${path.sep}app${path.sep}api${path.sep}`) && !entry.file.endsWith(`${path.sep}lib${path.sep}supabase${path.sep}admin.ts`))
  .map((entry) => entry.text)
  .join("\n");
assert.ok(!/SUPABASE_SERVICE_ROLE/i.test(browserSource), "Browser source must not reference a Supabase service-role key");
assert.ok(!/LIVEKIT_API_SECRET/i.test(browserSource), "Browser source must not reference the LiveKit secret");
assert.match(source, /getClaims\(\)/, "Server proxy must validate claims before protected routes");
assert.match(source, /config:\s*\{\s*private:\s*true/, "Typing indicators must use private Realtime channels");
assert.match(source, /NEXT_PUBLIC_VYBE_DATA_MODE/, "Data mode must be explicit");
assert.match(source, /if \(hasSupabaseEnv\(\)\) return "supabase"/, "Configured Supabase environments must not silently fall back to demo mode");
assert.match(source, /get_video_session_state/, "LiveKit token issuance must validate the Supabase video session");
assert.match(source, /roomJoin:\s*true[\s\S]*room:\s*String\(row\.roomName\)/, "LiveKit tokens must be scoped to the authorized room");
assert.doesNotMatch(source, /roomRecord:\s*true/, "Video tokens must never allow room recording by default");
assert.match(source, /controlsList="nodownload noremoteplayback"/, "Video elements must discourage downloading and remote playback");

const moderationFunction = await readFile(path.join(root, "supabase", "functions", "moderate-content", "index.ts"), "utf8");
assert.match(moderationFunction, /omni-moderation-latest/, "AI moderation must use the server-side moderation endpoint when configured");
assert.match(moderationFunction, /SUPABASE_SERVICE_ROLE_KEY/, "The trusted moderation function must use a server-only service role secret");
assert.match(moderationFunction, /groom|predator|threat|harass|spam/i, "Rule moderation must cover teen-safety categories");
assert.match(moderationFunction, /moderate_video_frame[\s\S]*frameDataUrl[\s\S]*video_moderation_events/, "The trusted gateway must support ephemeral video-frame moderation");
assert.match(moderationFunction, /never inserted into Storage or Postgres/i, "Video moderation frames must not be stored");
assert.doesNotMatch(browserSource, /OPENAI_API_KEY/, "OpenAI moderation secrets must never appear in browser source");


const speechModerationRoute = await readFile(path.join(root, "src", "app", "api", "video", "moderation", "transcript", "route.ts"), "utf8");
assert.match(speechModerationRoute, /VIDEO_MODERATION_AGENT_SECRET/, "Live speech moderation must require a server-only agent secret");
assert.match(speechModerationRoute, /timingSafeEqual/, "The moderation agent secret must use timing-safe comparison");
assert.match(speechModerationRoute, /Raw speech transcripts are intentionally never written/, "Raw live speech transcripts must not be stored");
for (const category of ["predatory_behavior", "threats", "harassment", "hate_speech", "bullying", "spam"]) assert.match(speechModerationRoute, new RegExp(category), `Live speech moderation must cover ${category}`);
assert.match(speechModerationRoute, /omni-moderation-latest/, "Live speech moderation may use server-side AI enrichment");
assert.doesNotMatch(speechModerationRoute, /metadata:\s*\{[^}]*transcript/s, "Raw transcripts must not enter session-event metadata");

const tokenRoute = await readFile(path.join(root, "src", "app", "api", "video", "token", "route.ts"), "utf8");
assert.match(tokenRoute, /RoomAgentDispatch[\s\S]*VIDEO_SAFETY_AGENT_NAME/, "Authorized video tokens must support the named safety worker");
assert.match(tokenRoute, /authorization[\s\S]*Bearer[\s\S]*auth\.getUser\(bearer\)/, "The token route must support verified bearer auth for deterministic two-user tests");
assert.doesNotMatch(tokenRoute, /VIDEO_MODERATION_AGENT_SECRET/, "The moderation agent secret must never be embedded in room tokens");

const safetyAgent = await readFile(path.join(root, "workers", "video-safety-agent", "agent.py"), "utf8");
assert.match(safetyAgent, /never records,[\s\S]*raw transcripts/i, "The safety worker must document non-recording behavior");
assert.match(safetyAgent, /participant_identity/, "The safety worker must scope transcription to authorized participants");
assert.match(safetyAgent, /VIDEO_MODERATION_AGENT_SECRET/, "The safety worker must authenticate to the moderation gateway");
assert.doesNotMatch(safetyAgent, /print\(.*transcript/i, "The safety worker must not print transcripts");

const participantHotfix = await readFile(path.join(root, "supabase", "migrations", "202607160007_hotfix_conversation_participants_rls_recursion.sql"), "utf8");
assert.match(participantHotfix, /alter table public\.conversation_participants enable row level security/i, "The hotfix must keep conversation participant RLS enabled");
assert.match(participantHotfix, /security definer[\s\S]*set row_security = off/i, "The hotfix helper must bypass recursive RLS evaluation securely");
const participantPolicy = participantHotfix.match(/create policy participants_select_conversation_member[\s\S]*?using\s*\(([\s\S]*?)\);/i)?.[1] ?? "";
assert.ok(participantPolicy, "Expected the replacement conversation participant SELECT policy");
assert.doesNotMatch(participantPolicy, /from\s+public\.conversation_participants/i, "The replacement participant policy must not query its own table");
assert.match(participantPolicy, /current_user_has_conversation_access\(conversation_id\)/i, "The replacement participant policy must use the stable helper");

const matchmakingHotfix = await readFile(path.join(root, "supabase", "migrations", "202607160008_hotfix_video_matchmaking_pairing.sql"), "utf8");
assert.match(matchmakingHotfix, /alter publication supabase_realtime add table public\.video_match_queue/i, "The matchmaking hotfix must re-assert queue Realtime publication");
assert.match(matchmakingHotfix, /return public\.try_pair_video_queue\(me\)/i, "Queue join must finish through the deterministic pairing helper");
assert.match(matchmakingHotfix, /status = 'matched'[\s\S]*session_id = session_row\.id[\s\S]*where user_id in \(me,candidate\)/i, "Both queue rows must receive the same shared session");
assert.doesNotMatch(matchmakingHotfix, /disable row level security/i, "The matchmaking hotfix must never disable RLS");


const rootCauseHotfix = await readFile(path.join(root, "supabase", "migrations", "202607160009_hotfix_video_matchmaking_root_cause.sql"), "utf8");
assert.match(rootCauseHotfix, /video_pair_repeat_blocked[\s\S]*repeat_prevention[\s\S]*connected_at is not null/i, "Repeat prevention must ignore rooms where both users never connected");
assert.match(rootCauseHotfix, /get_video_matchmaking_diagnostics/i, "The hotfix must expose current-user-only diagnostics");
assert.match(rootCauseHotfix, /alter publication supabase_realtime add table public\.video_session_participants/i, "The hotfix must re-assert participant Realtime publication");
assert.doesNotMatch(rootCauseHotfix, /disable row level security/i, "The root-cause hotfix must never disable RLS");

const deterministicPairingTest = await readFile(path.join(root, "tests", "integration", "supabase-video-pairing.mjs"), "utf8");
assert.match(deterministicPairingTest, /TEST_SUPABASE_SERVICE_ROLE_KEY/, "The deterministic test must create isolated verified accounts server-side");
assert.match(deterministicPairingTest, /repeat_prevention[\s\S]*true/, "The deterministic test must verify real repeat-prevention defaults");
assert.doesNotMatch(deterministicPairingTest, /update\(\{\s*repeat_prevention:\s*false/i, "The deterministic test must not bypass repeat prevention");

console.log(`✓ VYBE authorization contract passed (${files.length} migrations, ${exposedTables.length} RLS tables).`);

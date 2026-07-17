import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadLocalEnv() {
  try {
    const text = await readFile(".env.local", "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      process.env[line.slice(0, index).trim()] ??= line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* CI may provide environment variables directly. */ }
}
await loadLocalEnv();

const required = [
  "TEST_SUPABASE_URL", "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_USER_A_EMAIL", "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL", "TEST_USER_B_PASSWORD",
  "TEST_USER_C_EMAIL", "TEST_USER_C_PASSWORD",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(`↷ Phase 5 cloud integration skipped. Missing: ${missing.join(", ")}`);
  process.exit(0);
}

const makeClient = () => createClient(
  process.env.TEST_SUPABASE_URL,
  process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  },
);
const a = makeClient();
const b = makeClient();
const c = makeClient();

function okay(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message || "unknown error"}`);
  return result.data;
}
async function signIn(client, email, password, label) {
  const result = await client.auth.signInWithPassword({ email, password });
  okay(result, `Sign in ${label}`);
  assert.ok(result.data.user && result.data.session, `${label} must be verified`);
  await client.realtime.setAuth(result.data.session.access_token);
  return result.data.user;
}
async function myProfile(client, label) {
  const data = okay(await client.rpc("get_my_profile"), `Load ${label} profile`);
  const row = Array.isArray(data) ? data[0] : data;
  assert.ok(row?.age_bracket, `${label} must complete onboarding`);
  return row;
}
async function endAnyActive(client, label) {
  const queue = okay(await client.rpc("get_video_queue_status"), `${label} queue status`);
  if (queue?.status === "matched" && queue.sessionId) {
    const ended = await client.rpc("end_video_session", { target_session: queue.sessionId, end_value: "end" });
    if (ended.error && !/access required/i.test(ended.error.message)) throw ended.error;
  }
  await client.rpc("leave_video_queue");
}

try {
  const userA = await signIn(a, process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD, "A");
  const userB = await signIn(b, process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD, "B");
  const userC = await signIn(c, process.env.TEST_USER_C_EMAIL, process.env.TEST_USER_C_PASSWORD, "C");
  const [profileA, profileB, profileC] = await Promise.all([
    myProfile(a, "A"), myProfile(b, "B"), myProfile(c, "C"),
  ]);
  assert.equal(profileA.age_bracket, profileB.age_bracket, "A and B must share an age bracket");
  assert.notEqual(profileA.age_bracket, profileC.age_bracket, "C must be in the other bracket");

  await Promise.all([endAnyActive(a, "A"), endAnyActive(b, "B"), endAnyActive(c, "C")]);
  await Promise.all([
    a.rpc("unblock_user", { other_user: userB.id }),
    b.rpc("unblock_user", { other_user: userA.id }),
  ]);
  okay(await a.from("profiles").update({
    video_gender: "girl", country_code: "US", country_name: "United States",
    state_region: "Florida", city: "Jacksonville", location_visibility: "city",
  }).eq("id", userA.id), "Set A video profile");
  okay(await b.from("profiles").update({
    video_gender: "boy", country_code: "US", country_name: "United States",
    state_region: "Florida", city: "Jacksonville", location_visibility: "city",
  }).eq("id", userB.id), "Set B video profile");
  okay(await c.from("profiles").update({
    video_gender: "girl", country_code: "US", country_name: "United States",
    state_region: "Florida", city: "Jacksonville", location_visibility: "city",
  }).eq("id", userC.id), "Set C video profile");
  await Promise.all([
    a.from("user_settings").update({ repeat_prevention: false }).eq("user_id", userA.id),
    b.from("user_settings").update({ repeat_prevention: false }).eq("user_id", userB.id),
    c.from("user_settings").update({ repeat_prevention: false }).eq("user_id", userC.id),
  ]);

  const aWaiting = okay(await a.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "city", camera_value: true, microphone_value: true,
  }), "A joins city queue");
  assert.equal(aWaiting.status, "waiting", "A should wait before B joins");

  const cWaiting = okay(await c.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "city", camera_value: true, microphone_value: true,
  }), "C joins other-bracket queue");
  assert.equal(cWaiting.status, "waiting", "Cross-bracket C must never match A");

  const bMatch = okay(await b.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "city", camera_value: true, microphone_value: true,
  }), "B joins matching queue");
  assert.equal(bMatch.status, "matched", "B should match A");
  assert.ok(bMatch.sessionId, "Matched session must have an ID");
  const sessionId = bMatch.sessionId;

  const aStatus = okay(await a.rpc("get_video_queue_status"), "A receives match");
  assert.equal(aStatus.sessionId, sessionId, "Both users must receive the same single session");
  const duplicate = okay(await a.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "city", camera_value: true, microphone_value: true,
  }), "A retries queue while active");
  assert.equal(duplicate.sessionId, sessionId, "Duplicate calls must reuse the active session");

  const [stateA, stateB] = await Promise.all([
    a.rpc("get_video_session_state", { target_session: sessionId }),
    b.rpc("get_video_session_state", { target_session: sessionId }),
  ]);
  okay(stateA, "A reads session");
  okay(stateB, "B reads session");
  assert.equal(stateA.data.peer.id, userB.id);
  assert.equal(stateB.data.peer.id, userA.id);
  assert.match(stateA.data.peer.locationLabel || "", /Jacksonville/i, "Bilateral city sharing should expose only the coarse city label");
  const cSession = await c.rpc("get_video_session_state", { target_session: sessionId });
  assert.ok(cSession.error, "A non-participant must not read or hijack the session");

  okay(await a.rpc("update_video_participant_state", {
    target_session: sessionId, connected: true, quality_value: "good", camera_value: true, microphone_value: true,
  }), "A connects");
  okay(await b.rpc("update_video_participant_state", {
    target_session: sessionId, connected: true, quality_value: "excellent", camera_value: true, microphone_value: false,
  }), "B connects");
  okay(await a.rpc("log_video_session_event", {
    target_session: sessionId, event_name: "camera_toggle", event_metadata: { enabled: false },
  }), "A logs camera toggle");
  const directSessionInsert = await a.from("video_sessions").insert({
    user_a: userA.id < userB.id ? userA.id : userB.id,
    user_b: userA.id < userB.id ? userB.id : userA.id,
    room_name: `spoof_${crypto.randomUUID()}`,
  });
  assert.ok(directSessionInsert.error, "Browser clients cannot create or spoof video sessions directly");

  okay(await b.rpc("end_video_session", { target_session: sessionId, end_value: "end" }), "B ends call");
  const endedAccess = await a.rpc("get_video_session_state", { target_session: sessionId });
  assert.ok(endedAccess.error, "Ended sessions must immediately stop token/session access");

  const secondA = okay(await a.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "anywhere", camera_value: false, microphone_value: false,
  }), "A rejoins queue");
  assert.equal(secondA.status, "waiting");
  const secondB = okay(await b.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "anywhere", camera_value: false, microphone_value: false,
  }), "B rematches A");
  assert.equal(secondB.status, "matched");
  okay(await b.rpc("block_user", { other_user: userA.id }), "B blocks A during session");
  const blockedAccess = await a.rpc("get_video_session_state", { target_session: secondB.sessionId });
  assert.ok(blockedAccess.error, "Blocking must immediately remove video-session access");
  const blockedQueue = okay(await a.rpc("join_video_queue", {
    gender_value: "everyone", location_value: "anywhere", camera_value: false, microphone_value: false,
  }), "A queues after block");
  assert.notEqual(blockedQueue.sessionId, secondB.sessionId, "Blocked users cannot rematch or reuse the blocked session");

  console.log("✓ Live Supabase Phase 5 age-isolated queue, mutual preferences, bilateral coarse location, unique sessions, participant-only access, call state, spoof prevention, end, block enforcement, and RLS flow passed.");
} finally {
  await Promise.allSettled([
    a.rpc("leave_video_queue"), b.rpc("leave_video_queue"), c.rpc("leave_video_queue"),
    a.auth.signOut(), b.auth.signOut(), c.auth.signOut(),
  ]);
}

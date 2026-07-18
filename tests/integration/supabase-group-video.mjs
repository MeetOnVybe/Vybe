import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { TokenVerifier } from "livekit-server-sdk";

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
  } catch {}
}
await loadLocalEnv();

const required = ["TEST_SUPABASE_URL", "TEST_SUPABASE_PUBLISHABLE_KEY", "TEST_SUPABASE_SERVICE_ROLE_KEY", "TEST_APP_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(`↷ Production group-video test skipped. Missing: ${missing.join(", ")}`);
  process.exit(0);
}

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } });
const clients = [makeClient(), makeClient(), makeClient(), makeClient()];
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
const password = `VybeGroup!${crypto.randomBytes(10).toString("hex")}`;
const dobForAge = (age) => { const value = new Date(); value.setUTCFullYear(value.getUTCFullYear() - age); return value.toISOString().slice(0, 10); };
const accounts = [
  { label: "A", email: `group-a-${suffix}@example.test`, username: `group_a_${suffix}`, displayName: "Group A", dob: dobForAge(14), gender: "girl" },
  { label: "B", email: `group-b-${suffix}@example.test`, username: `group_b_${suffix}`, displayName: "Group B", dob: dobForAge(14), gender: "boy" },
  { label: "C", email: `group-c-${suffix}@example.test`, username: `group_c_${suffix}`, displayName: "Group C", dob: dobForAge(14), gender: "other" },
  { label: "D", email: `group-d-${suffix}@example.test`, username: `group_d_${suffix}`, displayName: "Group D", dob: dobForAge(16), gender: "boy" },
];

function okay(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message || "unknown error"}`);
  return result.data;
}

async function createAccount(account) {
  const result = await admin.auth.admin.createUser({ email: account.email, password, email_confirm: true, user_metadata: { username: account.username, display_name: account.displayName, date_of_birth: account.dob } });
  const user = okay(result, `Create ${account.label}`)?.user;
  assert.ok(user);
  account.id = user.id;
}

async function signIn(client, account) {
  const result = await client.auth.signInWithPassword({ email: account.email, password });
  okay(result, `Sign in ${account.label}`);
  assert.ok(result.data.session && result.data.user);
  await client.realtime.setAuth(result.data.session.access_token);
  return result.data;
}

async function waitProfile(client, label) {
  for (let i = 0; i < 30; i += 1) {
    const result = await client.rpc("get_my_profile");
    if (!result.error) {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (row?.age_bracket) return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} profile trigger timed out`);
}

async function waitStatus(client, expectedSessionId, label, expectMatched = true) {
  for (let i = 0; i < 50; i += 1) {
    const status = okay(await client.rpc("get_group_video_queue_status"), `${label} queue status`);
    if (expectMatched && status?.status === "matched") {
      if (expectedSessionId) assert.equal(status.sessionId, expectedSessionId);
      return status;
    }
    if (!expectMatched && status?.status === "waiting") return status;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not reach expected group queue state`);
}

async function tokenFor(auth, sessionId, roomName) {
  const response = await fetch(`${process.env.TEST_APP_URL.replace(/\/$/, "")}/api/video/group-token?sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
  const body = await response.json();
  assert.equal(response.status, 201, body.error || "Group token route failed");
  assert.equal(body.session.id, sessionId);
  assert.equal(body.session.roomName, roomName);
  const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).verify(body.participant_token);
  assert.equal(claims.sub, auth.user.id);
  assert.equal(claims.video?.room, roomName);
  assert.equal(claims.video?.roomJoin, true);
  assert.notEqual(claims.video?.roomAdmin, true);
}

let auth = [];
let sessionId;
try {
  await Promise.all(accounts.map(createAccount));
  auth = await Promise.all(accounts.map((account, index) => signIn(clients[index], account)));
  const profiles = await Promise.all(accounts.map((account, index) => waitProfile(clients[index], account.label)));
  assert.equal(profiles[0].age_bracket, profiles[1].age_bracket);
  assert.equal(profiles[1].age_bracket, profiles[2].age_bracket);
  assert.notEqual(profiles[0].age_bracket, profiles[3].age_bracket);

  await Promise.all(accounts.map((account, index) => clients[index].from("profiles").update({ video_gender: account.gender, location_visibility: "hidden" }).eq("id", auth[index].user.id)))
    .then((results) => results.forEach((result, index) => okay(result, `Set ${accounts[index].label} video profile`)));

  const [joinA, joinB] = await Promise.all([
    clients[0].rpc("join_group_video_queue", { gender_value: "everyone", location_value: "anywhere", camera_value: true, microphone_value: true }),
    clients[1].rpc("join_group_video_queue", { gender_value: "everyone", location_value: "anywhere", camera_value: true, microphone_value: true }),
  ]);
  const results = [okay(joinA, "A joins group queue"), okay(joinB, "B joins group queue")];
  const immediate = results.find((value) => value?.status === "matched" && value.sessionId);
  assert.ok(immediate, "One concurrent join must create the group session");
  sessionId = immediate.sessionId;
  const [statusA, statusB] = await Promise.all([waitStatus(clients[0], sessionId, "A"), waitStatus(clients[1], sessionId, "B")]);
  assert.equal(statusA.sessionId, statusB.sessionId);

  const statusC = okay(await clients[2].rpc("join_group_video_queue", { gender_value: "everyone", location_value: "anywhere", camera_value: true, microphone_value: true }), "C joins open group room");
  const resolvedC = statusC.status === "matched" ? statusC : await waitStatus(clients[2], sessionId, "C");
  assert.equal(resolvedC.sessionId, sessionId, "Compatible third user must join the existing room");

  const statusD = okay(await clients[3].rpc("join_group_video_queue", { gender_value: "everyone", location_value: "anywhere", camera_value: true, microphone_value: true }), "D joins other bracket queue");
  assert.equal(statusD.status, "waiting", "Other age bracket must never join A/B/C room");
  await waitStatus(clients[3], null, "D", false);

  const states = await Promise.all([0, 1, 2].map((index) => clients[index].rpc("get_group_video_session_state", { target_session: sessionId })));
  const stateRows = states.map((result, index) => okay(result, `${accounts[index].label} reads group session`));
  const roomName = stateRows[0].roomName;
  assert.ok(roomName.startsWith("vybe_group_"));
  stateRows.forEach((row) => { assert.equal(row.id, sessionId); assert.equal(row.roomName, roomName); assert.equal(row.participants.length, 3); });

  const sessionRows = okay(await admin.from("group_video_sessions").select("id").in("status", ["forming", "connecting", "active", "reconnecting", "flagged"]), "Read active group sessions").filter((row) => row.id === sessionId);
  assert.equal(sessionRows.length, 1, "Exactly one shared active group session must exist");

  await Promise.all([0, 1, 2].map((index) => tokenFor(auth[index], sessionId, roomName)));

  const retries = await Promise.all([0, 1, 2].map((index) => clients[index].rpc("join_group_video_queue", { gender_value: "everyone", location_value: "anywhere", camera_value: true, microphone_value: true })));
  retries.forEach((result, index) => assert.equal(okay(result, `${accounts[index].label} idempotent group rejoin`).sessionId, sessionId));

  const queueRows = okay(await admin.from("group_video_match_queue").select("user_id,status,session_id").in("user_id", auth.slice(0, 3).map((item) => item.user.id)), "Read group queue rows");
  assert.equal(queueRows.length, 3);
  queueRows.forEach((row) => { assert.equal(row.status, "matched"); assert.equal(row.session_id, sessionId); });

  console.log("✓ Real group video passed: same-bracket A/B/C share exactly one room and valid tokens, D stays isolated, queue rows leave waiting, and retries cannot duplicate the call.");
} finally {
  if (sessionId && auth[0]) await clients[0].rpc("leave_group_video_session", { target_session: sessionId, end_value: "leave" }).catch(() => undefined);
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  await Promise.allSettled(accounts.filter((item) => item.id).map((item) => admin.auth.admin.deleteUser(item.id)));
}

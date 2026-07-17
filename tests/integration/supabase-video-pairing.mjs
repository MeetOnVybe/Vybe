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
      process.env[line.slice(0, index).trim()] ??= line
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // CI may provide environment variables directly.
  }
}
await loadLocalEnv();

const required = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_SUPABASE_SERVICE_ROLE_KEY",
  "TEST_APP_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(
    `↷ Deterministic Phase 5 two-user pairing test skipped. Missing: ${missing.join(", ")}`,
  );
  process.exit(0);
}

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const makeClient = () =>
  createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });

const a = makeClient();
const b = makeClient();
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const password = `VybeTest!${crypto.randomBytes(10).toString("hex")}`;
const dob = new Date();
dob.setUTCFullYear(dob.getUTCFullYear() - 14);
const dateOfBirth = dob.toISOString().slice(0, 10);
const accounts = [
  {
    label: "A",
    email: `vybe-video-a-${suffix}@example.test`,
    username: `video_a_${suffix}`,
    displayName: "Video Test A",
    gender: "girl",
  },
  {
    label: "B",
    email: `vybe-video-b-${suffix}@example.test`,
    username: `video_b_${suffix}`,
    displayName: "Video Test B",
    gender: "boy",
  },
];

function okay(result, label) {
  assert.equal(
    result.error,
    null,
    `${label}: ${result.error?.message || "unknown error"}`,
  );
  return result.data;
}

async function createVerifiedAccount(account) {
  const result = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: {
      username: account.username,
      display_name: account.displayName,
      date_of_birth: dateOfBirth,
    },
  });
  const user = okay(result, `Create verified ${account.label}`)?.user;
  assert.ok(user, `${account.label} user must be created`);
  account.id = user.id;
}

async function signIn(client, account) {
  const result = await client.auth.signInWithPassword({
    email: account.email,
    password,
  });
  okay(result, `Sign in ${account.label}`);
  assert.ok(result.data.user && result.data.session, `${account.label} must be verified`);
  await client.realtime.setAuth(result.data.session.access_token);
  return { user: result.data.user, session: result.data.session };
}

async function waitForProfile(client, account) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await client.rpc("get_my_profile");
    if (!result.error) {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (row?.age_bracket) return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${account.label} profile trigger did not complete`);
}

async function subscribeToOwnQueue(client, userId, label) {
  const events = [];
  const channel = client
    .channel(`test-video-queue-${label}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "video_match_queue",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => events.push(payload),
    );

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} queue Realtime subscription timed out`)),
      10_000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`${label} queue Realtime status: ${status}`));
      }
    });
  });
  return { channel, events };
}

async function waitForSharedSession(client, expectedSessionId, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = okay(
      await client.rpc("get_video_queue_status"),
      `${label} polls queue`,
    );
    if (status?.status === "matched" && status.sessionId) {
      assert.equal(status.sessionId, expectedSessionId, `${label} must receive shared session`);
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const diagnostics = okay(
    await client.rpc("get_video_matchmaking_diagnostics"),
    `${label} matchmaking diagnostics`,
  );
  throw new Error(`${label} did not receive shared session. Diagnostics: ${JSON.stringify(diagnostics)}`);
}

async function waitForRealtimeMatch(events, sessionId, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      events.some(
        (event) =>
          event.new?.status === "matched" && event.new?.session_id === sessionId,
      )
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not receive matched queue Realtime update`);
}

async function requestLiveKitToken(accessToken, sessionId, expectedUserId, expectedRoom) {
  const response = await fetch(
    `${process.env.TEST_APP_URL.replace(/\/$/, "")}/api/video/token?sessionId=${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const body = await response.json();
  assert.equal(response.status, 201, body.error || "Token route must authorize participant");
  assert.ok(body.participant_token, "LiveKit participant token is required");
  assert.equal(body.session?.id, sessionId);
  assert.equal(body.session?.roomName, expectedRoom);

  const verifier = new TokenVerifier(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
  const claims = await verifier.verify(body.participant_token);
  assert.equal(claims.sub, expectedUserId);
  assert.equal(claims.video?.room, expectedRoom);
  assert.equal(claims.video?.roomJoin, true);
  assert.notEqual(claims.video?.roomAdmin, true);
  assert.notEqual(claims.video?.roomRecord, true);
}

let authA;
let authB;
let queueA;
let queueB;
let sessionId;

try {
  await Promise.all(accounts.map(createVerifiedAccount));
  [authA, authB] = await Promise.all([
    signIn(a, accounts[0]),
    signIn(b, accounts[1]),
  ]);
  const [profileA, profileB] = await Promise.all([
    waitForProfile(a, accounts[0]),
    waitForProfile(b, accounts[1]),
  ]);
  assert.equal(profileA.age_bracket, profileB.age_bracket);

  await Promise.all([
    a.from("profiles").update({ video_gender: accounts[0].gender, location_visibility: "hidden" }).eq("id", authA.user.id),
    b.from("profiles").update({ video_gender: accounts[1].gender, location_visibility: "hidden" }).eq("id", authB.user.id),
  ]).then((results) => results.forEach((result, index) => okay(result, `Set ${accounts[index].label} video profile`)));

  // Do not disable repeat prevention. Fresh temporary accounts prove the real
  // production defaults, unlike the previous test that masked the bug.
  const [settingsA, settingsB] = await Promise.all([
    a.from("user_settings").select("repeat_prevention").eq("user_id", authA.user.id).single(),
    b.from("user_settings").select("repeat_prevention").eq("user_id", authB.user.id).single(),
  ]);
  assert.equal(okay(settingsA, "Read A repeat setting").repeat_prevention, true);
  assert.equal(okay(settingsB, "Read B repeat setting").repeat_prevention, true);

  queueA = await subscribeToOwnQueue(a, authA.user.id, "A");
  queueB = await subscribeToOwnQueue(b, authB.user.id, "B");

  const [joinA, joinB] = await Promise.all([
    a.rpc("join_video_queue", {
      gender_value: "everyone",
      location_value: "anywhere",
      camera_value: true,
      microphone_value: true,
    }),
    b.rpc("join_video_queue", {
      gender_value: "everyone",
      location_value: "anywhere",
      camera_value: true,
      microphone_value: true,
    }),
  ]);
  const resultA = okay(joinA, "A joins queue concurrently");
  const resultB = okay(joinB, "B joins queue concurrently");
  const immediateMatches = [resultA, resultB].filter(
    (result) => result?.status === "matched" && result.sessionId,
  );
  assert.equal(immediateMatches.length, 1, "Exactly one transaction creates the session");
  sessionId = immediateMatches[0].sessionId;

  const [statusA, statusB] = await Promise.all([
    waitForSharedSession(a, sessionId, "A"),
    waitForSharedSession(b, sessionId, "B"),
  ]);
  assert.equal(statusA.sessionId, statusB.sessionId);

  await Promise.all([
    waitForRealtimeMatch(queueA.events, sessionId, "A"),
    waitForRealtimeMatch(queueB.events, sessionId, "B"),
  ]);

  const [queueRowA, queueRowB, stateA, stateB] = await Promise.all([
    a.from("video_match_queue").select("status,session_id").eq("user_id", authA.user.id).single(),
    b.from("video_match_queue").select("status,session_id").eq("user_id", authB.user.id).single(),
    a.rpc("get_video_session_state", { target_session: sessionId }),
    b.rpc("get_video_session_state", { target_session: sessionId }),
  ]);
  assert.equal(okay(queueRowA, "Read A queue").status, "matched");
  assert.equal(okay(queueRowB, "Read B queue").status, "matched");
  assert.equal(queueRowA.data.session_id, sessionId);
  assert.equal(queueRowB.data.session_id, sessionId);
  assert.equal(okay(stateA, "Read A session").peer.id, authB.user.id);
  assert.equal(okay(stateB, "Read B session").peer.id, authA.user.id);
  assert.equal(stateA.data.roomName, stateB.data.roomName);

  await Promise.all([
    requestLiveKitToken(authA.session.access_token, sessionId, authA.user.id, stateA.data.roomName),
    requestLiveKitToken(authB.session.access_token, sessionId, authB.user.id, stateB.data.roomName),
  ]);

  const [retryA, retryB] = await Promise.all([
    a.rpc("join_video_queue", {
      gender_value: "everyone",
      location_value: "anywhere",
      camera_value: true,
      microphone_value: true,
    }),
    b.rpc("join_video_queue", {
      gender_value: "everyone",
      location_value: "anywhere",
      camera_value: true,
      microphone_value: true,
    }),
  ]);
  assert.equal(okay(retryA, "A idempotent rejoin").sessionId, sessionId);
  assert.equal(okay(retryB, "B idempotent rejoin").sessionId, sessionId);

  const activeSessions = okay(
    await admin
      .from("video_sessions")
      .select("id")
      .or(`user_a.eq.${authA.user.id},user_b.eq.${authA.user.id}`)
      .in("status", ["connecting", "active", "reconnecting", "flagged"]),
    "Read active sessions",
  ).filter((row) => row.id === sessionId);
  assert.equal(activeSessions.length, 1, "The pair must have exactly one active session");

  const [diagnosticsA, diagnosticsB] = await Promise.all([
    a.rpc("get_video_matchmaking_diagnostics"),
    b.rpc("get_video_matchmaking_diagnostics"),
  ]);
  assert.ok(okay(diagnosticsA, "A diagnostics").recentLogs.some((log) => log.event_type === "match_created"));
  assert.ok(okay(diagnosticsB, "B diagnostics").recentLogs.some((log) => log.event_type === "match_created"));

  console.log(
    "✓ Deterministic real-default two-user pairing passed: fresh verified users, repeat prevention ON, one shared session, both Realtime deliveries, valid room-scoped LiveKit tokens, both queue rows out of waiting, and idempotent duplicate prevention.",
  );
} finally {
  if (sessionId && authA) {
    await a.rpc("end_video_session", {
      target_session: sessionId,
      end_value: "end",
    }).catch(() => undefined);
  }
  await Promise.allSettled([
    queueA?.channel ? a.removeChannel(queueA.channel) : Promise.resolve(),
    queueB?.channel ? b.removeChannel(queueB.channel) : Promise.resolve(),
    a.auth.signOut(),
    b.auth.signOut(),
  ]);
  await Promise.allSettled(
    accounts
      .filter((account) => account.id)
      .map((account) => admin.auth.admin.deleteUser(account.id)),
  );
}

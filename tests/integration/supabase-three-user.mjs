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
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      process.env[key] ??= value;
    }
  } catch {
    // CI may provide environment variables directly.
  }
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
  console.log(`↷ Phase 3 cloud integration skipped. Missing: ${missing.join(", ")}`);
  process.exit(0);
}

const makeClient = () => createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
});
const a = makeClient();
const b = makeClient();
const c = makeClient();
const channels = [];

function assertOkay(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message || "unknown error"}`);
  return result.data;
}
function deferred(label, timeout = 15_000) {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeout);
  return { promise, resolve: (value) => { clearTimeout(timer); resolve(value); } };
}
async function subscribe(channel, label) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out subscribing to ${label}`)), 15_000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(error || new Error(`${label}: ${status}`)); }
    });
  });
}
async function signIn(client, email, password, label) {
  const result = await client.auth.signInWithPassword({ email, password });
  assertOkay(result, `Sign in ${label}`);
  assert.ok(result.data.user && result.data.session, `${label} must be a verified account`);
  await client.realtime.setAuth(result.data.session.access_token);
  return result.data.user;
}
async function profile(client, label) {
  const result = assertOkay(await client.rpc("get_my_profile"), `Load ${label} profile`);
  const row = Array.isArray(result) ? result[0] : result;
  assert.ok(row?.age_bracket && row?.username, `${label} needs a completed profile`);
  return row;
}
async function resetPair(userA, userB) {
  await a.rpc("unblock_user", { other_user: userB.id });
  await b.rpc("unblock_user", { other_user: userA.id });
  await a.rpc("unfriend", { other_user: userB.id });
  const existing = assertOkay(await a.from("matches").select("id,status,user_a,user_b"), "Read existing A/B matches");
  for (const match of existing.filter((row) => row.user_a === userA.id && row.user_b === userB.id || row.user_a === userB.id && row.user_b === userA.id)) {
    if (match.status === "active") assertOkay(await a.rpc("unmatch", { match_to_close: match.id }), "Reset active match");
  }
  await a.from("friend_requests").delete().or(`and(sender_id.eq.${userA.id},receiver_id.eq.${userB.id}),and(sender_id.eq.${userB.id},receiver_id.eq.${userA.id})`);
  await b.from("friend_requests").delete().or(`and(sender_id.eq.${userA.id},receiver_id.eq.${userB.id}),and(sender_id.eq.${userB.id},receiver_id.eq.${userA.id})`);
  // A pass followed by the ten-minute undo RPC safely deactivates any prior decision row without privileged credentials.
  assertOkay(await a.rpc("submit_swipe", { target_user: userB.id, swipe_value: "pass" }), "Reset A decision");
  assert.equal(assertOkay(await a.rpc("undo_last_pass"), "Deactivate A decision"), userB.id);
  assertOkay(await b.rpc("submit_swipe", { target_user: userA.id, swipe_value: "pass" }), "Reset B decision");
  assert.equal(assertOkay(await b.rpc("undo_last_pass"), "Deactivate B decision"), userA.id);
}

try {
  const userA = await signIn(a, process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD, "User A");
  const userB = await signIn(b, process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD, "User B");
  const userC = await signIn(c, process.env.TEST_USER_C_EMAIL, process.env.TEST_USER_C_PASSWORD, "User C");
  assert.equal(new Set([userA.id, userB.id, userC.id]).size, 3, "Three distinct verified users are required");

  const [profileA, profileB, profileC] = await Promise.all([profile(a, "A"), profile(b, "B"), profile(c, "C")]);
  assert.equal(profileA.age_bracket, profileB.age_bracket, "Users A and B must share an age bracket");
  assert.notEqual(profileA.age_bracket, profileC.age_bracket, "User C must be in the other age bracket");

  for (const [client, user] of [[a, userA], [b, userB]]) {
    assertOkay(await client.from("user_settings").update({
      profile_visibility: "discovery", presence_visibility: "precise", show_online_status: true,
      notifications_enabled: true, profile_interaction_notifications: true, read_receipts: true,
      repeat_prevention: true,
    }).eq("user_id", user.id), "Enable Phase 3 test settings");
  }
  await resetPair(userA, userB);

  const searchB = assertOkay(await a.rpc("get_discovery_profiles", {
    interest_filters: [], online_only: false, sort_mode: "compatibility", search_query: profileB.username,
    page_offset: 0, page_limit: 20,
  }), "A searches for B");
  assert.equal(searchB.length, 1, "A must discover B in the same age bracket");
  assert.equal(searchB[0].id, userB.id);
  assert.ok(Number.isInteger(searchB[0].compatibility_score), "Compatibility must be deterministic and numeric");

  const searchC = assertOkay(await a.rpc("get_discovery_profiles", {
    interest_filters: [], online_only: false, sort_mode: "compatibility", search_query: profileC.username,
    page_offset: 0, page_limit: 20,
  }), "A searches for C");
  assert.equal(searchC.length, 0, "A must never discover C across age brackets");

  const spoofedDecision = await a.from("swipe_decisions").insert({ actor_id: userB.id, target_id: userA.id, decision: "like" });
  assert.ok(spoofedDecision.error, "Clients must not insert or spoof swipe decisions directly");

  const firstLike = assertOkay(await a.rpc("submit_swipe", { target_user: userB.id, swipe_value: "like" }), "A likes B")?.[0];
  assert.equal(firstLike.matched, false, "A's first one-way like must not create a match");

  const notificationA = deferred("A match notification");
  const notificationB = deferred("B match notification");
  const channelA = a.channel(`phase3-notification-a-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userA.id}` }, (payload) => {
      if (payload.new.title === "It's a VYBE") notificationA.resolve(payload.new);
    });
  const channelB = b.channel(`phase3-notification-b-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userB.id}` }, (payload) => {
      if (payload.new.title === "It's a VYBE") notificationB.resolve(payload.new);
    });
  channels.push([a, channelA], [b, channelB]);
  await subscribe(channelA, "A match notifications");
  await subscribe(channelB, "B match notifications");

  const secondLike = assertOkay(await b.rpc("submit_swipe", { target_user: userA.id, swipe_value: "like" }), "B likes A")?.[0];
  assert.equal(secondLike.matched, true, "B's reciprocal like must create the match");
  assert.ok(secondLike.match_id, "Mutual match must return its unique ID");
  const [eventA, eventB] = await Promise.all([notificationA.promise, notificationB.promise]);
  assert.equal(eventA.entity_id, secondLike.match_id);
  assert.equal(eventB.entity_id, secondLike.match_id);

  const matchesA = assertOkay(await a.from("matches").select("id,status,user_a,user_b").eq("id", secondLike.match_id), "A reads match");
  const matchesB = assertOkay(await b.from("matches").select("id,status,user_a,user_b").eq("id", secondLike.match_id), "B reads match");
  const matchesC = assertOkay(await c.from("matches").select("id,status,user_a,user_b").eq("id", secondLike.match_id), "C cannot read match");
  assert.equal(matchesA.length, 1); assert.equal(matchesB.length, 1); assert.equal(matchesC.length, 0);

  const notificationCountBeforeResult = await a.from("notifications").select("id", { count: "exact", head: true }).eq("entity_id", secondLike.match_id);
  assert.equal(notificationCountBeforeResult.error, null, `Count initial match notifications: ${notificationCountBeforeResult.error?.message || "unknown error"}`);
  const notificationCountBefore = notificationCountBeforeResult.count;
  const duplicateLike = assertOkay(await b.rpc("submit_swipe", { target_user: userA.id, swipe_value: "like" }), "Repeat B like")?.[0];
  assert.equal(duplicateLike.match_id, secondLike.match_id, "Repeated active likes must reuse one match pair");
  const uniqueMatch = assertOkay(await a.from("matches").select("id").eq("id", secondLike.match_id), "Verify unique match");
  assert.equal(uniqueMatch.length, 1, "Mutual pair must be created only once");
  const notificationCountAfterResult = await a.from("notifications").select("id", { count: "exact", head: true }).eq("entity_id", secondLike.match_id);
  assert.equal(notificationCountAfterResult.error, null);
  assert.equal(notificationCountAfterResult.count, notificationCountBefore, "Repeated active likes must not duplicate match notifications");

  const conversationId = assertOkay(await a.rpc("get_or_create_conversation", { other_user: userB.id }), "Create match conversation");
  assert.ok(conversationId, "Match conversation ID is required");
  const messageEvent = deferred("B real-time match message");
  const messageChannel = b.channel(`phase3-message-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${userB.id}` }, (payload) => messageEvent.resolve(payload.new));
  channels.push([b, messageChannel]);
  await subscribe(messageChannel, "B match message channel");

  const uniqueText = `Phase 3 match chat ${crypto.randomUUID()}`;
  assertOkay(await a.from("messages").insert({ conversation_id: conversationId, sender_id: userA.id, receiver_id: userB.id, body: uniqueText, client_nonce: crypto.randomUUID() }), "A sends match message");
  const received = await messageEvent.promise;
  assert.equal(received.body, uniqueText, "B must receive the match message in real time");
  const messageId = received.id;

  const unread = assertOkay(await b.from("notifications").select("id,read_at").eq("type", "message").eq("entity_id", conversationId).is("read_at", null), "B reads unread message notification");
  assert.ok(unread.length >= 1, "Match message must create an unread notification");

  const typingEvent = deferred("private match typing");
  const typingB = b.channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on("broadcast", { event: "typing" }, ({ payload }) => typingEvent.resolve(payload));
  const typingA = a.channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
  channels.push([b, typingB], [a, typingA]);
  await subscribe(typingB, "B private match typing");
  await subscribe(typingA, "A private match typing");
  await typingA.send({ type: "broadcast", event: "typing", payload: { userId: userA.id, typing: true } });
  const typing = await typingEvent.promise;
  assert.equal(typing.userId, userA.id); assert.equal(typing.typing, true);

  const now = new Date().toISOString();
  assertOkay(await b.from("conversation_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("user_id", userB.id), "B updates unread cursor");
  assertOkay(await b.from("messages").update({ delivered_at: now, read_at: now }).eq("id", messageId).eq("receiver_id", userB.id), "B writes delivered/read receipt");
  const receipt = assertOkay(await a.from("messages").select("delivered_at,read_at").eq("id", messageId).single(), "A reads receipt");
  assert.ok(receipt.delivered_at && receipt.read_at);
  assertOkay(await b.from("message_reactions").upsert({ message_id: messageId, user_id: userB.id, emoji: "💙" }), "B reacts");
  assert.equal(assertOkay(await a.from("message_reactions").select("emoji").eq("message_id", messageId).single(), "A reads reaction").emoji, "💙");

  assertOkay(await a.from("user_settings").update({ theme_preference: "light" }).eq("user_id", userA.id), "A saves light theme");
  assert.equal(assertOkay(await a.from("user_settings").select("theme_preference").eq("user_id", userA.id).single(), "A reloads theme").theme_preference, "light");

  assertOkay(await b.from("user_settings").update({ presence_visibility: "recently", show_online_status: true }).eq("user_id", userB.id), "B chooses broad presence");
  assertOkay(await b.rpc("set_presence", { online: true }), "B sets presence");
  const broadPresence = assertOkay(await a.rpc("get_discovery_profiles", { interest_filters: [], online_only: false, sort_mode: "random", search_query: profileB.username, page_offset: 0, page_limit: 20 }), "A reads broad presence");
  assert.equal(broadPresence[0].presence_state, "recently");
  assert.equal(broadPresence[0].last_seen_at, null, "Broad presence must hide precise last-seen time");

  assertOkay(await a.rpc("unmatch", { match_to_close: secondLike.match_id }), "A unmatches B");
  const postUnmatchConversation = await a.rpc("get_or_create_conversation", { other_user: userB.id });
  assert.ok(postUnmatchConversation.error, "Unmatching must remove match-only chat access immediately");
  const hiddenMessages = assertOkay(await a.from("messages").select("id").eq("conversation_id", conversationId), "Messages after unmatch");
  assert.equal(hiddenMessages.length, 0, "Match-only messages must become inaccessible after unmatch");

  assertOkay(await b.rpc("block_user", { other_user: userA.id }), "B blocks A");
  const blockedDiscovery = assertOkay(await a.rpc("get_discovery_profiles", { interest_filters: [], online_only: false, sort_mode: "random", search_query: profileB.username, page_offset: 0, page_limit: 20 }), "A searches blocked B");
  assert.equal(blockedDiscovery.length, 0, "Blocks must remove discovery and search visibility");
  const blockedSend = await a.from("messages").insert({ conversation_id: conversationId, sender_id: userA.id, receiver_id: userB.id, body: "must fail", client_nonce: crypto.randomUUID() });
  assert.ok(blockedSend.error, "Blocks must prevent future messages");

  assertOkay(await b.rpc("unblock_user", { other_user: userA.id }), "Cleanup unblock");
  assertOkay(await a.from("user_settings").update({ theme_preference: "system" }).eq("user_id", userA.id), "Cleanup theme");
  assertOkay(await b.from("user_settings").update({ presence_visibility: "precise" }).eq("user_id", userB.id), "Cleanup presence");
  console.log("✓ Live Supabase Phase 3 three-account discovery, age isolation, mutual match, realtime chat, presence, theme, unmatch, and block flow passed.");
} finally {
  for (const [client, channel] of channels) await client.removeChannel(channel).catch(() => undefined);
  await Promise.all([a.auth.signOut().catch(() => undefined), b.auth.signOut().catch(() => undefined), c.auth.signOut().catch(() => undefined)]);
}

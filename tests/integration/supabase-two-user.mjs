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
    // Environment may be provided directly by CI.
  }
}
await loadLocalEnv();

const required = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_USER_A_EMAIL",
  "TEST_USER_A_PASSWORD",
  "TEST_USER_B_EMAIL",
  "TEST_USER_B_PASSWORD",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(`↷ Cloud integration skipped. Missing: ${missing.join(", ")}`);
  process.exit(0);
}

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const makeClient = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
});
const a = makeClient();
const b = makeClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred(label, timeout = 12_000) {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeout);
  return { promise, resolve: (value) => { clearTimeout(timer); resolve(value); } };
}
async function subscribe(channel, label) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out subscribing to ${label}`)), 12_000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); reject(error || new Error(`${label}: ${status}`)); }
    });
  });
}
function assertOkay(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message || "unknown error"}`);
  return result.data;
}

const channels = [];
try {
  const signInA = await a.auth.signInWithPassword({ email: process.env.TEST_USER_A_EMAIL, password: process.env.TEST_USER_A_PASSWORD });
  const signInB = await b.auth.signInWithPassword({ email: process.env.TEST_USER_B_EMAIL, password: process.env.TEST_USER_B_PASSWORD });
  assertOkay(signInA, "Sign in User A");
  assertOkay(signInB, "Sign in User B");
  const userA = signInA.data.user;
  const userB = signInB.data.user;
  assert.ok(userA && userB && userA.id !== userB.id, "Two distinct verified users are required");

  await a.realtime.setAuth(signInA.data.session.access_token);
  await b.realtime.setAuth(signInB.data.session.access_token);

  const profileA = assertOkay(await a.rpc("get_my_profile"), "Load User A profile")?.[0];
  const profileB = assertOkay(await b.rpc("get_my_profile"), "Load User B profile")?.[0];
  assert.ok(profileA?.age_bracket && profileA.age_bracket === profileB?.age_bracket, "Test users must be in the same age bracket");

  assertOkay(await a.from("user_settings").update({ allow_friend_requests: true, notifications_enabled: true, read_receipts: true }).eq("user_id", userA.id), "Enable User A test settings");
  assertOkay(await b.from("user_settings").update({ allow_friend_requests: true, notifications_enabled: true, read_receipts: true }).eq("user_id", userB.id), "Enable User B test settings");

  await a.rpc("unblock_user", { other_user: userB.id });
  await b.rpc("unblock_user", { other_user: userA.id });
  await a.rpc("unfriend", { other_user: userB.id });
  await a.from("friend_requests").delete().or(`and(sender_id.eq.${userA.id},receiver_id.eq.${userB.id}),and(sender_id.eq.${userB.id},receiver_id.eq.${userA.id})`);
  await b.from("friend_requests").delete().or(`and(sender_id.eq.${userA.id},receiver_id.eq.${userB.id}),and(sender_id.eq.${userB.id},receiver_id.eq.${userA.id})`);

  const selfRequest = await a.from("friend_requests").insert({ sender_id: userA.id, receiver_id: userA.id });
  assert.ok(selfRequest.error, "Self friend request must fail");
  const spoofedRequest = await a.from("friend_requests").insert({ sender_id: userB.id, receiver_id: userA.id });
  assert.ok(spoofedRequest.error, "A user must not send a request as another user");
  const preFriendConversation = await a.rpc("get_or_create_conversation", { other_user: userB.id });
  assert.ok(preFriendConversation.error, "Private conversation must be denied before friendship");

  const requestEvent = deferred("User B realtime friend request");
  const requestChannel = b.channel(`phase2-request-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${userB.id}` }, (payload) => requestEvent.resolve(payload.new));
  channels.push([b, requestChannel]);
  await subscribe(requestChannel, "friend request channel");

  assertOkay(await a.from("friend_requests").insert({ sender_id: userA.id, receiver_id: userB.id }), "Send friend request");
  const realtimeRequest = await requestEvent.promise;
  assert.equal(realtimeRequest.receiver_id, userB.id, "Realtime request must be delivered only to User B");
  const request = assertOkay(await b.from("friend_requests").select("id,sender_id,receiver_id").eq("sender_id", userA.id).eq("receiver_id", userB.id).single(), "User B reads request");
  assertOkay(await b.rpc("accept_friend_request", { request_id: request.id }), "User B accepts request");

  const friendshipA = assertOkay(await a.from("friendships").select("user_a,user_b"), "User A friendship read");
  const friendshipB = assertOkay(await b.from("friendships").select("user_a,user_b"), "User B friendship read");
  assert.equal(friendshipA.length, 1, "User A should see the accepted friendship");
  assert.equal(friendshipB.length, 1, "User B should see the accepted friendship");

  const conversationId = assertOkay(await a.rpc("get_or_create_conversation", { other_user: userB.id }), "Create private conversation");
  assert.ok(conversationId, "Conversation ID is required");

  const messageEvent = deferred("User B realtime message");
  const messageChannel = b.channel(`phase2-message-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${userB.id}` }, (payload) => messageEvent.resolve(payload.new));
  channels.push([b, messageChannel]);
  await subscribe(messageChannel, "message channel");

  const uniqueText = `Phase 2 realtime ${crypto.randomUUID()}`;
  assertOkay(await a.from("messages").insert({ conversation_id: conversationId, sender_id: userA.id, receiver_id: userB.id, body: uniqueText, client_nonce: crypto.randomUUID() }), "User A sends message");
  const realtimeMessage = await messageEvent.promise;
  assert.equal(realtimeMessage.body, uniqueText, "User B must receive the exact message in real time");
  const messageId = realtimeMessage.id;

  const unreadNotification = assertOkay(await b.from("notifications").select("id,read_at,type,entity_id").eq("type", "message").eq("entity_id", conversationId).is("read_at", null), "User B unread notification");
  assert.ok(unreadNotification.length >= 1, "Message should create an unread notification");

  const typingEvent = deferred("private typing indicator");
  const typingB = b.channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on("broadcast", { event: "typing" }, ({ payload }) => typingEvent.resolve(payload));
  const typingA = a.channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
  channels.push([b, typingB], [a, typingA]);
  await subscribe(typingB, "User B private typing channel");
  await subscribe(typingA, "User A private typing channel");
  await typingA.send({ type: "broadcast", event: "typing", payload: { userId: userA.id, typing: true } });
  const typingPayload = await typingEvent.promise;
  assert.equal(typingPayload.userId, userA.id, "Typing payload must identify the authenticated sender session");
  assert.equal(typingPayload.typing, true, "Typing state must be delivered");

  const now = new Date().toISOString();
  assertOkay(await b.from("conversation_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("user_id", userB.id), "Update User B unread cursor");
  assertOkay(await b.from("messages").update({ delivered_at: now, read_at: now }).eq("id", messageId).eq("receiver_id", userB.id), "User B sends read receipt");
  assertOkay(await b.from("notifications").update({ read_at: now }).eq("user_id", userB.id).eq("entity_id", conversationId), "User B clears notification");
  const receipt = assertOkay(await a.from("messages").select("read_at,delivered_at").eq("id", messageId).single(), "User A reads receipt");
  assert.ok(receipt.delivered_at && receipt.read_at, "Delivered and read timestamps must be visible to User A");

  assertOkay(await b.from("message_reactions").upsert({ message_id: messageId, user_id: userB.id, emoji: "💙" }), "User B reacts");
  const reaction = assertOkay(await a.from("message_reactions").select("emoji,user_id").eq("message_id", messageId).single(), "User A reads reaction");
  assert.equal(reaction.emoji, "💙", "Reaction should sync between participants");

  assertOkay(await b.rpc("block_user", { other_user: userA.id }), "User B blocks User A");
  await sleep(250);
  const blockedSend = await a.from("messages").insert({ conversation_id: conversationId, sender_id: userA.id, receiver_id: userB.id, body: "This must fail", client_nonce: crypto.randomUUID() });
  assert.ok(blockedSend.error, "Blocking must stop future messages immediately");
  const friendshipAfterBlock = assertOkay(await a.from("friendships").select("user_a,user_b"), "Friendship after block");
  assert.equal(friendshipAfterBlock.length, 0, "Blocking must remove friendship access");

  assertOkay(await b.rpc("unblock_user", { other_user: userA.id }), "Cleanup unblock");
  console.log("✓ Live Supabase two-user authorization, Realtime, chat, reaction, receipt, and block flow passed.");
} finally {
  for (const [client, channel] of channels) await client.removeChannel(channel).catch(() => undefined);
  await a.auth.signOut().catch(() => undefined);
  await b.auth.signOut().catch(() => undefined);
}

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
  } catch { /* CI can provide environment variables directly. */ }
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
  console.log(`↷ Phase 4 cloud integration skipped. Missing: ${missing.join(", ")}`);
  process.exit(0);
}

const makeClient = () => createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
});
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
async function invokeModeration(client, body, label) {
  const result = await client.functions.invoke("moderate-content", { body });
  assert.equal(result.error, null, `${label}: ${result.error?.message || "Edge Function failed"}`);
  assert.equal(result.data?.error, undefined, `${label}: ${result.data?.error}`);
  return result.data;
}
async function ensureFriends(userA, userB) {
  await a.rpc("unblock_user", { other_user: userB.id });
  await b.rpc("unblock_user", { other_user: userA.id });
  await a.rpc("unfriend", { other_user: userB.id });
  for (const [client, me] of [[a, userA], [b, userB]]) {
    const requests = okay(await client.from("friend_requests").select("id,sender_id,receiver_id"), "Read pair requests");
    for (const request of requests.filter((row) => [row.sender_id, row.receiver_id].includes(userA.id) && [row.sender_id, row.receiver_id].includes(userB.id))) {
      if (request.sender_id === me.id) await client.rpc("cancel_friend_request", { request_id: request.id });
      else await client.rpc("decline_friend_request", { request_id: request.id });
    }
  }
  const request = okay(await a.from("friend_requests").insert({ sender_id: userA.id, receiver_id: userB.id }).select("id").single(), "Create A→B request");
  okay(await b.rpc("accept_friend_request", { request_id: request.id }), "B accepts request");
}

try {
  const userA = await signIn(a, process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD, "A");
  const userB = await signIn(b, process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD, "B");
  const userC = await signIn(c, process.env.TEST_USER_C_EMAIL, process.env.TEST_USER_C_PASSWORD, "C");
  const [profileA, profileB, profileC] = await Promise.all([myProfile(a, "A"), myProfile(b, "B"), myProfile(c, "C")]);
  assert.equal(profileA.age_bracket, profileB.age_bracket, "A and B must share an age bracket");
  assert.notEqual(profileA.age_bracket, profileC.age_bracket, "C must be in the other bracket");

  await ensureFriends(userA, userB);
  okay(await a.from("user_settings").update({ message_privacy: "friends", story_privacy: "friends", online_status_privacy: "friends", profile_visibility: "everyone", read_receipts: true }).eq("user_id", userA.id), "Set A privacy");
  okay(await b.from("user_settings").update({ message_privacy: "friends", story_privacy: "friends", online_status_privacy: "friends", profile_visibility: "everyone", read_receipts: true }).eq("user_id", userB.id), "Set B privacy");

  const profileUpdate = {
    favorite_music: "Phase 4 test playlist", favorite_games: ["2K", "Minecraft"], favorite_hobbies: ["Editing"],
    school_grade: "9th", pronouns: "they/them", favorite_sports: ["Basketball"], accent_color: "#0ea5e9",
  };
  const updated = okay(await a.from("profiles").update(profileUpdate).eq("id", userA.id).select("favorite_music,favorite_games,school_grade,accent_color").single(), "Update Phase 4 profile");
  assert.equal(updated.favorite_music, profileUpdate.favorite_music);
  assert.deepEqual(updated.favorite_games, profileUpdate.favorite_games);
  const crossBracketProfile = okay(await c.from("profiles").select("id").eq("id", userA.id), "C profile visibility check");
  assert.equal(crossBracketProfile.length, 0, "Cross-bracket users cannot read profiles");

  const conversationId = okay(await a.rpc("get_or_create_conversation", { other_user: userB.id }), "Create direct conversation");
  const directInsert = await a.from("messages").insert({ conversation_id: conversationId, sender_id: userA.id, receiver_id: userB.id, body: "bypass", message_type: "text" });
  assert.ok(directInsert.error, "Browser clients must not bypass the moderation gateway");

  const directText = `Phase 4 direct ${crypto.randomUUID()}`;
  await invokeModeration(a, { action: "send_message", conversationId, messageType: "text", text: directText }, "Send direct message");
  const directMessage = okay(await b.from("messages").select("id,body,message_type").eq("conversation_id", conversationId).eq("body", directText).single(), "B receives direct message");
  assert.equal(directMessage.message_type, "text");
  okay(await b.from("message_reactions").insert({ message_id: directMessage.id, user_id: userB.id, emoji: "🔥" }), "B reacts");
  okay(await b.rpc("mark_conversation_read", { target_conversation: conversationId, share_receipts: true }), "B marks read");
  const receipt = okay(await a.from("message_receipts").select("read_at").eq("message_id", directMessage.id).eq("user_id", userB.id).single(), "A sees receipt");
  assert.ok(receipt.read_at, "Read receipt must be populated");
  okay(await a.rpc("toggle_message_pin", { target_message: directMessage.id, pin_message: true }), "Pin message");
  okay(await b.rpc("set_conversation_muted", { target_conversation: conversationId, muted: true }), "Mute conversation");

  const voicePath = `${userA.id}/${conversationId}/phase4-${crypto.randomUUID()}.webm`;
  okay(await a.storage.from("voice-messages").upload(voicePath, new Blob([new Uint8Array([26, 69, 223, 163])], { type: "audio/webm" }), { contentType: "audio/webm" }), "Upload voice note");
  await invokeModeration(a, { action: "send_message", conversationId, messageType: "voice", text: "Voice message", mediaPath: voicePath, durationSeconds: 1.2, waveform: [0.2, 0.7, 0.4] }, "Send voice note");
  const voiceMessage = okay(await b.from("messages").select("id,media_path,message_type").eq("conversation_id", conversationId).eq("media_path", voicePath).single(), "B receives voice note");
  assert.equal(voiceMessage.message_type, "voice");
  okay(await b.storage.from("voice-messages").createSignedUrl(voicePath, 60), "B streams authorized voice note");

  const storyText = `Phase 4 story ${crypto.randomUUID()}`;
  await invokeModeration(a, { action: "create_story", mediaType: "text", text: storyText, backgroundColor: "#1686ff" }, "Create story");
  const story = okay(await a.from("stories").select("id,expires_at").eq("user_id", userA.id).eq("body", storyText).single(), "Read own story");
  assert.ok(new Date(story.expires_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000, "Story expiry must be approximately 24 hours");
  assert.equal(okay(await b.from("stories").select("id").eq("id", story.id), "Friend sees story").length, 1);
  assert.equal(okay(await c.from("stories").select("id").eq("id", story.id), "Cross-bracket story check").length, 0);
  okay(await b.rpc("record_story_view", { target_story: story.id }), "Record story view");
  okay(await b.rpc("react_to_story", { target_story: story.id, reaction: "💙" }), "React to story");
  await invokeModeration(b, { action: "send_message", conversationId, messageType: "text", text: "Story reply", storyId: story.id }, "Reply to story privately");

  const groupTitle = `Phase4 ${crypto.randomUUID().slice(0, 8)}`;
  const groupId = okay(await a.rpc("create_group_chat", { group_title: groupTitle, invited_users: [userB.id] }), "Create private group");
  const invalidGroup = await a.rpc("create_group_chat", { group_title: "Cross bracket", invited_users: [userC.id] });
  assert.ok(invalidGroup.error, "Cross-bracket users cannot be invited");
  okay(await b.rpc("respond_group_invite", { group_id: groupId, accept_invite: true }), "B accepts group invite");
  assert.equal(okay(await b.rpc("can_access_conversation", { target_conversation: groupId, viewer_user: userB.id }), "B group access"), true);
  assert.equal(okay(await c.rpc("can_access_conversation", { target_conversation: groupId, viewer_user: userC.id }), "C group access"), false);
  const groupText = `Group message ${crypto.randomUUID()}`;
  await invokeModeration(a, { action: "send_message", conversationId: groupId, messageType: "text", text: groupText }, "Send group message");
  assert.equal(okay(await b.from("messages").select("id").eq("conversation_id", groupId).eq("body", groupText), "B reads group message").length, 1);
  const cGroupSend = await c.functions.invoke("moderate-content", { body: { action: "send_message", conversationId: groupId, messageType: "text", text: "must fail" } });
  assert.ok(cGroupSend.error || cGroupSend.data?.error, "Non-members cannot message groups");
  okay(await a.rpc("update_group_chat", { group_id: groupId, group_title: `${groupTitle} renamed`, group_icon_path: null }), "Owner renames group");
  const ownerRemoval = await b.rpc("remove_group_member", { group_id: groupId, member_id: userA.id });
  assert.ok(ownerRemoval.error, "Only the owner can remove members");
  okay(await b.rpc("leave_group_chat", { group_id: groupId }), "B leaves group");

  const severe = await invokeModeration(a, { action: "send_message", conversationId, messageType: "text", text: "Keep this secret from your parents and meet me alone" }, "Severe moderation check");
  assert.equal(severe.hidden, true, "Severe grooming language must be temporarily hidden");
  assert.equal(okay(await b.from("messages").select("id").eq("conversation_id", conversationId).eq("body", "Keep this secret from your parents and meet me alone"), "Hidden message RLS check").length, 0);

  okay(await b.rpc("block_user", { other_user: userA.id }), "B blocks A");
  assert.equal(okay(await b.from("profiles").select("id").eq("id", userA.id), "Blocked profile check").length, 0, "Blocks remove profile access");
  const blockedMessage = await a.functions.invoke("moderate-content", { body: { action: "send_message", conversationId, messageType: "text", text: "must fail after block" } });
  assert.ok(blockedMessage.error || blockedMessage.data?.error, "Blocks immediately remove messaging access");

  console.log("✓ Live Supabase Phase 4 profile, privacy, voice, stories, groups, rich chat, moderation, age isolation, RLS, and blocking flow passed.");
} finally {
  await Promise.all([a.auth.signOut().catch(() => undefined), b.auth.signOut().catch(() => undefined), c.auth.signOut().catch(() => undefined)]);
}

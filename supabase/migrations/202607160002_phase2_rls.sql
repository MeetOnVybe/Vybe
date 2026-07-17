-- VYBE Phase 2 RLS and least-privilege grants.

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.user_presence enable row level security;
alter table public.user_settings enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.age_assurance_cases enable row level security;
alter table public.parental_consent_cases enable row level security;

-- Profiles: authenticated users can discover safe fields only within their age bracket.
-- date_of_birth is intentionally excluded from direct grants and returned only by get_my_profile().
revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, age_bracket, bio, status, interests, avatar_url, banner_url, created_at, updated_at) on public.profiles to authenticated;
grant update (username, display_name, bio, status, interests, avatar_url, banner_url) on public.profiles to authenticated;

create policy profiles_select_same_bracket
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (
    age_bracket is not null
    and age_bracket = public.current_age_bracket()
    and not public.is_blocked_between(auth.uid(), id)
  )
);

create policy profiles_update_own
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Friend requests are private to the sender and receiver.
grant select, insert, delete on public.friend_requests to authenticated;
create policy friend_requests_select_involved on public.friend_requests for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy friend_requests_insert_sender on public.friend_requests for insert to authenticated
with check (sender_id = auth.uid());
create policy friend_requests_delete_involved on public.friend_requests for delete to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

-- Accepted friendships are visible only to the involved users and disappear from access when blocked.
grant select, delete on public.friendships to authenticated;
create policy friendships_select_involved on public.friendships for select to authenticated
using ((user_a = auth.uid() or user_b = auth.uid()) and not public.is_blocked_between(user_a, user_b));
create policy friendships_delete_involved on public.friendships for delete to authenticated
using (user_a = auth.uid() or user_b = auth.uid());

-- Block rows are private to the blocker. Security-definer helpers check both directions.
grant select, insert, delete on public.blocks to authenticated;
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete_own on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Conversations and participants are private to accepted, unblocked participants.
grant select on public.conversations to authenticated;
create policy conversations_select_participant on public.conversations for select to authenticated
using (
  (user_a = auth.uid() or user_b = auth.uid())
  and public.are_friends(user_a, user_b)
);

grant select on public.conversation_participants to authenticated;
create policy participants_select_conversation_member on public.conversation_participants for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
      and public.are_friends(c.user_a, c.user_b)
  )
);

-- Messages: participants can read. Sender inserts only as themselves. Receiver can update receipt columns only.
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (delivered_at, read_at) on public.messages to authenticated;
create policy messages_select_participant on public.messages for select to authenticated
using (
  (sender_id = auth.uid() or receiver_id = auth.uid())
  and public.are_friends(sender_id, receiver_id)
  and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
);
create policy messages_insert_sender on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.are_friends(sender_id, receiver_id)
  and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid())
);
create policy messages_update_receiver on public.messages for update to authenticated
using (receiver_id = auth.uid() and public.are_friends(sender_id, receiver_id))
with check (receiver_id = auth.uid() and public.are_friends(sender_id, receiver_id));

-- Reactions: only participants can read; a user can create/update/delete only their own reaction.
grant select, insert, update, delete on public.message_reactions to authenticated;
create policy reactions_select_participant on public.message_reactions for select to authenticated
using (exists (
  select 1 from public.messages m
  where m.id = message_id
    and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    and public.are_friends(m.sender_id, m.receiver_id)
));
create policy reactions_insert_own on public.message_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (
  select 1 from public.messages m where m.id = message_id and (m.sender_id = auth.uid() or m.receiver_id = auth.uid()) and public.are_friends(m.sender_id, m.receiver_id)
));
create policy reactions_update_own on public.message_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete_own on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- Notifications are user-owned.
grant select, update, delete on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Presence: users update themselves. Only accepted, unblocked friends can read it.
grant select, insert, update on public.user_presence to authenticated;
create policy presence_select_friends on public.user_presence for select to authenticated
using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
create policy presence_insert_own on public.user_presence for insert to authenticated with check (user_id = auth.uid());
create policy presence_update_own on public.user_presence for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Settings are fully private to their owner.
grant select, insert, update on public.user_settings to authenticated;
create policy settings_select_own on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy settings_insert_own on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy settings_update_own on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports: reporters may create and view only their own reports; moderation uses server-side/admin access.
grant select, insert on public.moderation_reports to authenticated;
create policy reports_select_own on public.moderation_reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert_own on public.moderation_reports for insert to authenticated with check (reporter_id = auth.uid());

-- Future assurance records are visible only to their owner. Creation/update is reserved for future trusted providers.
grant select on public.age_assurance_cases to authenticated;
grant select on public.parental_consent_cases to authenticated;
create policy age_assurance_select_own on public.age_assurance_cases for select to authenticated using (user_id = auth.uid());
create policy parental_consent_select_own on public.parental_consent_cases for select to authenticated using (user_id = auth.uid());

-- Storage writes are scoped to /<auth.uid()>/... in each private bucket.
create policy storage_select_profile_media
on storage.objects for select to authenticated
using (bucket_id in ('profile-avatars', 'profile-banners'));

create policy storage_insert_own_profile_media
on storage.objects for insert to authenticated
with check (
  bucket_id in ('profile-avatars', 'profile-banners')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy storage_update_own_profile_media
on storage.objects for update to authenticated
using (
  bucket_id in ('profile-avatars', 'profile-banners')
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('profile-avatars', 'profile-banners')
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy storage_delete_own_profile_media
on storage.objects for delete to authenticated
using (
  bucket_id in ('profile-avatars', 'profile-banners')
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Realtime private-channel authorization. Topics are conversation:<uuid> or user:<uuid>.
alter table realtime.messages enable row level security;

create policy vybe_realtime_read
on realtime.messages for select to authenticated
using (
  (
    realtime.topic() like 'conversation:%'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id::text = split_part(realtime.topic(), ':', 2)
        and cp.user_id = auth.uid()
    )
  )
  or realtime.topic() = 'user:' || auth.uid()::text
);

create policy vybe_realtime_write
on realtime.messages for insert to authenticated
with check (
  (
    realtime.topic() like 'conversation:%'
    and exists (
      select 1 from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where cp.conversation_id::text = split_part(realtime.topic(), ':', 2)
        and cp.user_id = auth.uid()
        and public.are_friends(c.user_a, c.user_b)
    )
  )
  or realtime.topic() = 'user:' || auth.uid()::text
);

-- RPC execution grants. No service-role key is required by the application.
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_date_of_birth(date) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.unfriend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.set_presence(boolean) to authenticated;

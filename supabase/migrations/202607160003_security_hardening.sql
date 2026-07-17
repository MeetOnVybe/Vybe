-- VYBE Phase 2 hardening: narrow function/table privileges and close blocked-user realtime edges.

-- Security-definer functions are not executable by PUBLIC unless explicitly granted below.
revoke execute on function public.calculate_age_bracket(date) from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.are_friends(uuid, uuid) from public, anon;
revoke execute on function public.current_age_bracket() from public, anon;
revoke execute on function public.same_age_bracket(uuid, uuid) from public, anon;
revoke execute on function public.accept_friend_request(uuid) from public, anon;
revoke execute on function public.decline_friend_request(uuid) from public, anon;
revoke execute on function public.cancel_friend_request(uuid) from public, anon;
revoke execute on function public.unfriend(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
revoke execute on function public.get_or_create_conversation(uuid) from public, anon;
revoke execute on function public.set_presence(boolean) from public, anon;
revoke execute on function public.get_my_profile() from public, anon;
revoke execute on function public.update_my_date_of_birth(date) from public, anon, authenticated;

-- Helper functions are needed by RLS for signed-in members. Date-of-birth changes are intentionally not client-executable.
grant execute on function public.calculate_age_bracket(date) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.current_age_bracket() to authenticated;
grant execute on function public.same_age_bracket(uuid, uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.unfriend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.set_presence(boolean) to authenticated;
grant execute on function public.get_my_profile() to authenticated;

-- Notification content is server/trigger-owned. Members may only update read state.
revoke all on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Presence is written only through set_presence(), which always uses auth.uid().
revoke all on public.user_presence from authenticated;
grant select on public.user_presence to authenticated;

-- Reactions are unavailable as soon as friendship access is blocked or removed.
drop policy if exists reactions_update_own on public.message_reactions;
drop policy if exists reactions_delete_own on public.message_reactions;
create policy reactions_update_own_friend_message
on public.message_reactions for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages m
    where m.id = message_id
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
      and public.are_friends(m.sender_id, m.receiver_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages m
    where m.id = message_id
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
      and public.are_friends(m.sender_id, m.receiver_id)
  )
);
create policy reactions_delete_own_friend_message
on public.message_reactions for delete to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.messages m
    where m.id = message_id
      and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
      and public.are_friends(m.sender_id, m.receiver_id)
  )
);

-- Private conversation channels require both membership and a currently valid friendship.
drop policy if exists vybe_realtime_read on realtime.messages;
create policy vybe_realtime_read
on realtime.messages for select to authenticated
using (
  (
    realtime.topic() like 'conversation:%'
    and exists (
      select 1
      from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where cp.conversation_id::text = split_part(realtime.topic(), ':', 2)
        and cp.user_id = auth.uid()
        and public.are_friends(c.user_a, c.user_b)
    )
  )
  or realtime.topic() = 'user:' || auth.uid()::text
);

-- A blocker may still see the safe profile fields needed to identify and unblock that account.
drop policy if exists profiles_select_same_bracket on public.profiles;
create policy profiles_select_same_bracket
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
  or (
    age_bracket is not null
    and age_bracket = public.current_age_bracket()
    and not public.is_blocked_between(auth.uid(), id)
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.blocks;
  exception when duplicate_object then null;
  end;
end $$;

-- A participant's unread cursor is private and writable only by that participant.
revoke all on public.conversation_participants from authenticated;
grant select on public.conversation_participants to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
drop policy if exists participants_update_own_read_cursor on public.conversation_participants;
create policy participants_update_own_read_cursor
on public.conversation_participants for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Respect the target member's online-status privacy preference at the database boundary.
drop policy if exists presence_select_friends on public.user_presence;
create policy presence_select_friends
on public.user_presence for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.are_friends(auth.uid(), user_id)
    and coalesce((select us.show_online_status from public.user_settings us where us.user_id = user_presence.user_id), false)
  )
);

-- Age access is calculated from date of birth at query time, so birthdays cannot leave stale security boundaries.
create or replace function public.current_age_bracket()
returns public.vybe_age_bracket
language sql
stable
security definer
set search_path = public
as $$
  select public.calculate_age_bracket(date_of_birth) from public.profiles where id = auth.uid();
$$;

create or replace function public.same_age_bracket(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.calculate_age_bracket(p1.date_of_birth) is not null
     and public.calculate_age_bracket(p1.date_of_birth) = public.calculate_age_bracket(p2.date_of_birth)
  from public.profiles p1 cross join public.profiles p2
  where p1.id = first_user and p2.id = second_user;
$$;

drop policy if exists profiles_select_same_bracket on public.profiles;
create policy profiles_select_same_bracket
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
  or (
    date_of_birth is not null
    and public.calculate_age_bracket(date_of_birth) = public.current_age_bracket()
    and not public.is_blocked_between(auth.uid(), id)
  )
);

-- Return NULL outside the supported range so expired profiles are filtered instead of breaking unrelated queries.
create or replace function public.calculate_age_bracket(date_of_birth date)
returns public.vybe_age_bracket
language plpgsql
stable
set search_path = public
as $$
declare
  years_old integer;
begin
  if date_of_birth is null then return null; end if;
  years_old := date_part('year', age(current_date, date_of_birth));
  if years_old between 13 and 15 then return '13-15'::public.vybe_age_bracket; end if;
  if years_old between 16 and 17 then return '16-17'::public.vybe_age_bracket; end if;
  return null;
end;
$$;

create or replace function public.set_profile_derived_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.username := lower(trim(new.username::text));
  new.display_name := trim(new.display_name);
  new.bio := trim(new.bio);
  new.age_bracket := public.calculate_age_bracket(new.date_of_birth);
  if new.date_of_birth is not null and new.age_bracket is null then
    raise exception 'VYBE currently supports ages 13 through 17';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Refresh the signed-in member's stored bracket whenever their cloud profile is loaded.
create or replace function public.get_my_profile()
returns table (
  id uuid, username text, display_name text, date_of_birth date, age_bracket public.vybe_age_bracket,
  bio text, status text, interests text[], avatar_url text, banner_url text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set age_bracket = public.calculate_age_bracket(p.date_of_birth)
  where p.id = auth.uid()
    and p.age_bracket is distinct from public.calculate_age_bracket(p.date_of_birth);

  return query
  select p.id, p.username::text, p.display_name, p.date_of_birth, p.age_bracket, p.bio, p.status,
         p.interests, p.avatar_url, p.banner_url, p.created_at, p.updated_at
  from public.profiles p
  where p.id = auth.uid();
end;
$$;

-- Read a friend's presence preference through a narrow security-definer helper instead of exposing settings rows.
create or replace function public.can_view_presence(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user = auth.uid()
    or (
      public.are_friends(auth.uid(), target_user)
      and coalesce((select us.show_online_status from public.user_settings us where us.user_id = target_user), false)
    );
$$;
revoke execute on function public.can_view_presence(uuid) from public, anon;
grant execute on function public.can_view_presence(uuid) to authenticated;

drop policy if exists presence_select_friends on public.user_presence;
create policy presence_select_friends
on public.user_presence for select to authenticated
using (public.can_view_presence(user_id));

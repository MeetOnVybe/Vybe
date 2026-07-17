-- VYBE Phase 3: discovery, decisions, mutual matches, match chat, search, theme and privacy preferences.
-- Phase 2 friendship and chat behavior remains intact. Friendship and matching are independent relationships.

alter table public.user_settings
  add column if not exists profile_interaction_notifications boolean not null default false,
  add column if not exists theme_preference text not null default 'system'
    check (theme_preference in ('system', 'dark', 'light')),
  add column if not exists profile_visibility text not null default 'discovery'
    check (profile_visibility in ('discovery', 'connections')),
  add column if not exists presence_visibility text not null default 'precise'
    check (presence_visibility in ('precise', 'recently', 'hidden')),
  add column if not exists repeat_prevention boolean not null default true;

create table if not exists public.discovery_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interest_filters text[] not null default '{}',
  online_only boolean not null default false,
  sort_mode text not null default 'random' check (sort_mode in ('random', 'new', 'compatibility')),
  repeat_prevention boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint discovery_preferences_interest_limit check (cardinality(interest_filters) <= 10)
);

create table if not exists public.swipe_decisions (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check (decision in ('like', 'pass')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  constraint swipe_decisions_not_self check (actor_id <> target_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'unmatched')),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unmatched_at timestamptz,
  unmatched_by uuid references public.profiles(id) on delete set null,
  constraint matches_sorted check (user_a < user_b),
  constraint matches_not_self check (user_a <> user_b),
  unique (user_a, user_b)
);

create table if not exists public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.user_action_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_username_lower_idx on public.profiles (lower(username::text));
create index if not exists profiles_display_name_lower_idx on public.profiles (lower(display_name));
create index if not exists profiles_interests_gin_idx on public.profiles using gin (interests);
create index if not exists profiles_bracket_created_idx on public.profiles (age_bracket, created_at desc);
create index if not exists swipe_actor_active_updated_idx on public.swipe_decisions (actor_id, active, updated_at desc);
create index if not exists swipe_target_like_idx on public.swipe_decisions (target_id, actor_id) where active and decision = 'like';
create index if not exists matches_user_a_status_idx on public.matches (user_a, status, last_activity_at desc);
create index if not exists matches_user_b_status_idx on public.matches (user_b, status, last_activity_at desc);
create index if not exists match_participants_user_idx on public.match_participants (user_id, match_id);
create index if not exists action_events_user_action_time_idx on public.user_action_events (user_id, action, created_at desc);
create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc nulls last);

create or replace function public.has_active_match(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where user_a = least(first_user, second_user)
      and user_b = greatest(first_user, second_user)
      and status = 'active'
  ) and not public.is_blocked_between(first_user, second_user);
$$;

create or replace function public.can_message(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_blocked_between(first_user, second_user)
    and (public.are_friends(first_user, second_user) or public.has_active_match(first_user, second_user));
$$;

create or replace function public.are_connected(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.are_friends(first_user, second_user) or public.has_active_match(first_user, second_user);
$$;

create or replace function public.profile_is_discoverable(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user <> auth.uid()
    and public.same_age_bracket(auth.uid(), target_user)
    and not public.is_blocked_between(auth.uid(), target_user)
    and coalesce((select profile_visibility = 'discovery' from public.user_settings where user_id = target_user), true);
$$;

create or replace function public.check_vybe_rate_limit(action_name text, allowed_count integer, window_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select count(*) into recent_count
  from public.user_action_events
  where user_id = auth.uid()
    and action = action_name
    and created_at > now() - make_interval(secs => window_seconds);
  if recent_count >= allowed_count then raise exception 'Please slow down and try again shortly'; end if;
  insert into public.user_action_events (user_id, action) values (auth.uid(), action_name);
end;
$$;

create or replace function public.vybe_compatibility(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with mine as (select interests from public.profiles where id = auth.uid()),
       theirs as (select interests from public.profiles where id = target_user),
       shared as (
         select count(*)::integer as count
         from unnest(coalesce((select interests from mine), '{}')) item
         where item = any(coalesce((select interests from theirs), '{}'))
       ),
       totals as (
         select greatest(1, cardinality(coalesce((select interests from mine), '{}')) + cardinality(coalesce((select interests from theirs), '{}'))) as total
       )
  select least(99, greatest(45, 45 + round(((2.0 * shared.count) / totals.total) * 54)::integer))
  from shared, totals;
$$;

create or replace function public.mutual_friend_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with my_friends as (
    select case when user_a = auth.uid() then user_b else user_a end as friend_id
    from public.friendships where user_a = auth.uid() or user_b = auth.uid()
  ), their_friends as (
    select case when user_a = target_user then user_b else user_a end as friend_id
    from public.friendships where user_a = target_user or user_b = target_user
  )
  select count(*)::integer from my_friends join their_friends using (friend_id);
$$;

create or replace function public.get_discovery_profiles(
  interest_filters text[] default '{}',
  online_only boolean default false,
  sort_mode text default 'random',
  search_query text default '',
  page_offset integer default 0,
  page_limit integer default 20
)
returns table (
  id uuid, username text, display_name text, age_bracket public.vybe_age_bracket,
  bio text, status text, interests text[], avatar_url text, banner_url text,
  created_at timestamptz, compatibility_score integer, mutual_friends_count integer,
  presence_state text, last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_vybe_rate_limit(case when trim(search_query) = '' then 'discovery' else 'search' end, case when trim(search_query) = '' then 180 else 90 end, 3600);
  page_limit := least(greatest(page_limit, 1), 30);
  page_offset := greatest(page_offset, 0);
  return query
  select p.id, p.username::text, p.display_name, public.calculate_age_bracket(p.date_of_birth), p.bio, p.status,
         p.interests, p.avatar_url, p.banner_url, p.created_at,
         public.vybe_compatibility(p.id), public.mutual_friend_count(p.id),
         case
           when us.presence_visibility = 'hidden' then 'offline'
           when us.presence_visibility = 'recently' then case when up.last_seen_at > now() - interval '24 hours' then 'recently' else 'offline' end
           when coalesce(up.is_online, false) then 'online'
           when up.last_seen_at > now() - interval '24 hours' then 'recently'
           else 'offline'
         end,
         case when us.presence_visibility = 'precise' then up.last_seen_at else null end
  from public.profiles p
  left join public.user_settings us on us.user_id = p.id
  left join public.user_presence up on up.user_id = p.id
  where public.profile_is_discoverable(p.id)
    and (cardinality(coalesce(interest_filters, '{}')) = 0 or p.interests && interest_filters)
    and (not online_only or (coalesce(up.is_online, false) and coalesce(us.presence_visibility, 'precise') = 'precise'))
    and (
      trim(search_query) = ''
      or lower(p.username::text) like '%' || lower(trim(search_query)) || '%'
      or lower(p.display_name) like '%' || lower(trim(search_query)) || '%'
      or exists (select 1 from unnest(p.interests) i where lower(i) like '%' || lower(trim(search_query)) || '%')
    )
    and (
      not coalesce((select repeat_prevention from public.user_settings where user_id = auth.uid()), true)
      or not exists (select 1 from public.swipe_decisions sd where sd.actor_id = auth.uid() and sd.target_id = p.id and sd.active)
    )
  order by
    case when sort_mode = 'new' then extract(epoch from p.created_at) end desc nulls last,
    case when sort_mode = 'compatibility' then public.vybe_compatibility(p.id) end desc nulls last,
    case when sort_mode = 'random' then md5(p.id::text || auth.uid()::text || current_date::text) end,
    p.created_at desc
  offset page_offset limit page_limit;
end;
$$;

create or replace function public.submit_swipe(target_user uuid, swipe_value text)
returns table (matched boolean, match_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_match_id uuid;
  reverse_like boolean;
  was_active boolean := false;
begin
  perform public.check_vybe_rate_limit('swipe', 120, 3600);
  if swipe_value not in ('like', 'pass') then raise exception 'Invalid swipe decision'; end if;
  if not public.profile_is_discoverable(target_user) then raise exception 'Profile is not eligible for discovery'; end if;

  insert into public.swipe_decisions (actor_id, target_id, decision, active, updated_at)
  values (auth.uid(), target_user, swipe_value, true, now())
  on conflict (actor_id, target_id) do update
  set decision = excluded.decision, active = true, updated_at = now();

  reverse_like := swipe_value = 'like' and exists (
    select 1 from public.swipe_decisions
    where actor_id = target_user and target_id = auth.uid() and decision = 'like' and active
  );

  if reverse_like then
    select exists (
      select 1 from public.matches
      where user_a = least(auth.uid(), target_user)
        and user_b = greatest(auth.uid(), target_user)
        and status = 'active'
    ) into was_active;

    insert into public.matches (user_a, user_b, status, created_at, last_activity_at, unmatched_at, unmatched_by)
    values (least(auth.uid(), target_user), greatest(auth.uid(), target_user), 'active', now(), now(), null, null)
    on conflict (user_a, user_b) do update
      set status = 'active', last_activity_at = now(), unmatched_at = null, unmatched_by = null
    returning id into new_match_id;

    insert into public.match_participants (match_id, user_id)
    values (new_match_id, auth.uid()), (new_match_id, target_user)
    on conflict do nothing;

    if not was_active then
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values
        (auth.uid(), target_user, 'system', 'It''s a VYBE', 'You liked each other. Your private match chat is ready.', new_match_id),
        (target_user, auth.uid(), 'system', 'It''s a VYBE', 'You liked each other. Your private match chat is ready.', new_match_id);
    end if;
  end if;

  return query select reverse_like, new_match_id;
end;
$$;

create or replace function public.undo_last_pass()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select target_id into target
  from public.swipe_decisions
  where actor_id = auth.uid() and decision = 'pass' and active and updated_at > now() - interval '10 minutes'
  order by updated_at desc limit 1;
  if target is null then return null; end if;
  update public.swipe_decisions set active = false, updated_at = now() where actor_id = auth.uid() and target_id = target;
  return target;
end;
$$;

create or replace function public.unmatch(match_to_close uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches
  set status = 'unmatched', unmatched_at = now(), unmatched_by = auth.uid(), last_activity_at = now()
  where id = match_to_close and status = 'active' and (user_a = auth.uid() or user_b = auth.uid());
  if not found then raise exception 'Active match not found'; end if;
  update public.swipe_decisions sd
  set active = false, updated_at = now()
  from public.matches m
  where m.id = match_to_close
    and ((sd.actor_id = m.user_a and sd.target_id = m.user_b) or (sd.actor_id = m.user_b and sd.target_id = m.user_a));
end;
$$;

create or replace function public.record_profile_interaction(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_username text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user = auth.uid() then return; end if;
  if not public.same_age_bracket(auth.uid(), target_user) or public.is_blocked_between(auth.uid(), target_user) then
    raise exception 'Profile interaction is not allowed';
  end if;
  if not (public.profile_is_discoverable(target_user) or public.are_connected(auth.uid(), target_user)) then
    raise exception 'Profile interaction is not allowed';
  end if;
  if not coalesce((select notifications_enabled and profile_interaction_notifications from public.user_settings where user_id = target_user), false) then
    return;
  end if;
  perform public.check_vybe_rate_limit('profile_view', 60, 3600);
  if exists (
    select 1 from public.notifications
    where user_id = target_user and actor_id = auth.uid() and title = 'Profile view'
      and created_at > now() - interval '24 hours'
  ) then return; end if;
  select username::text into actor_username from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, actor_id, type, title, body)
  values (target_user, auth.uid(), 'system', 'Profile view', '@' || actor_username || ' viewed your profile.');
end;
$$;

create or replace function public.get_or_create_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare conversation_id uuid;
begin
  if not public.can_message(auth.uid(), other_user) then raise exception 'Friendship or active match required'; end if;
  insert into public.conversations (user_a, user_b)
  values (least(auth.uid(), other_user), greatest(auth.uid(), other_user))
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning id into conversation_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_id, auth.uid()), (conversation_id, other_user)
  on conflict do nothing;
  return conversation_id;
end;
$$;

create or replace function public.validate_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> auth.uid() then raise exception 'You may only send messages as yourself'; end if;
  if not public.can_message(new.sender_id, new.receiver_id) then raise exception 'Friendship or active match required'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id
      and c.user_a = least(new.sender_id, new.receiver_id)
      and c.user_b = greatest(new.sender_id, new.receiver_id)
  ) then raise exception 'Invalid conversation'; end if;
  new.body := trim(new.body);
  return new;
end;
$$;

create or replace function public.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.matches set last_activity_at = new.created_at
    where user_a = least(new.sender_id, new.receiver_id) and user_b = greatest(new.sender_id, new.receiver_id) and status = 'active';
  insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
  values (new.receiver_id, new.sender_id, 'message', 'New message', left(new.body, 120), new.conversation_id);
  return new;
end;
$$;

-- RLS for new tables.
alter table public.discovery_preferences enable row level security;
alter table public.swipe_decisions enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.user_action_events enable row level security;

revoke all on public.discovery_preferences, public.swipe_decisions, public.matches, public.match_participants, public.user_action_events from anon, authenticated;
grant select, insert, update on public.discovery_preferences to authenticated;
grant select on public.swipe_decisions to authenticated;
grant select on public.matches, public.match_participants to authenticated;

create policy discovery_preferences_own on public.discovery_preferences for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy swipe_decisions_select_own on public.swipe_decisions for select to authenticated using (actor_id = auth.uid());
create policy matches_select_participant on public.matches for select to authenticated
using ((user_a = auth.uid() or user_b = auth.uid()) and not public.is_blocked_between(user_a, user_b));
create policy match_participants_select_own_match on public.match_participants for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()) and not public.is_blocked_between(m.user_a, m.user_b)));

-- Profiles remain same-bracket, block-aware, and now respect discovery visibility for non-connections.
drop policy if exists profiles_select_same_bracket on public.profiles;
create policy profiles_select_same_bracket on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
  or (
    date_of_birth is not null
    and public.calculate_age_bracket(date_of_birth) = public.current_age_bracket()
    and not public.is_blocked_between(auth.uid(), id)
    and (
      public.are_connected(auth.uid(), id)
      or coalesce((select us.profile_visibility = 'discovery' from public.user_settings us where us.user_id = profiles.id), true)
    )
  )
);

-- Conversation/message/reaction policies accept either an active friendship or an active match.
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant on public.conversations for select to authenticated
using ((user_a = auth.uid() or user_b = auth.uid()) and public.can_message(user_a, user_b));

drop policy if exists participants_select_conversation_member on public.conversation_participants;
create policy participants_select_conversation_member on public.conversation_participants for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid()) and public.can_message(c.user_a, c.user_b)));

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages for select to authenticated
using (public.can_message(sender_id, receiver_id) and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));

drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages for insert to authenticated
with check (sender_id = auth.uid() and public.can_message(sender_id, receiver_id) and exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));

drop policy if exists messages_update_receiver on public.messages;
create policy messages_update_receiver on public.messages for update to authenticated
using (receiver_id = auth.uid() and public.can_message(sender_id, receiver_id))
with check (receiver_id = auth.uid() and public.can_message(sender_id, receiver_id));

drop policy if exists reactions_select_participant on public.message_reactions;
create policy reactions_select_participant on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m where m.id = message_id and (m.sender_id = auth.uid() or m.receiver_id = auth.uid()) and public.can_message(m.sender_id, m.receiver_id)));

drop policy if exists reactions_insert_own on public.message_reactions;
create policy reactions_insert_own on public.message_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and (m.sender_id = auth.uid() or m.receiver_id = auth.uid()) and public.can_message(m.sender_id, m.receiver_id)));

drop policy if exists reactions_update_own_friend_message on public.message_reactions;
drop policy if exists reactions_delete_own_friend_message on public.message_reactions;
create policy reactions_update_own_connection_message on public.message_reactions for update to authenticated
using (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.can_message(m.sender_id, m.receiver_id)))
with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.can_message(m.sender_id, m.receiver_id)));
create policy reactions_delete_own_connection_message on public.message_reactions for delete to authenticated
using (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.can_message(m.sender_id, m.receiver_id)));

-- Presence privacy supports exact, broad recently-active, or hidden states.
drop policy if exists presence_select_friends on public.user_presence;
create policy presence_select_connections on public.user_presence for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.are_connected(auth.uid(), user_id)
    and coalesce((select us.presence_visibility <> 'hidden' from public.user_settings us where us.user_id = user_presence.user_id), false)
  )
);

-- Private realtime topics follow current friendship-or-match access immediately.
drop policy if exists vybe_realtime_read on realtime.messages;
create policy vybe_realtime_read on realtime.messages for select to authenticated
using (
  (
    realtime.topic() like 'conversation:%'
    and exists (
      select 1 from public.conversation_participants cp
      join public.conversations c on c.id = cp.conversation_id
      where cp.conversation_id::text = split_part(realtime.topic(), ':', 2)
        and cp.user_id = auth.uid()
        and public.can_message(c.user_a, c.user_b)
    )
  )
  or realtime.topic() = 'user:' || auth.uid()::text
);

-- Narrow function execution.
revoke execute on function public.has_active_match(uuid, uuid) from public, anon;
revoke execute on function public.can_message(uuid, uuid) from public, anon;
revoke execute on function public.are_connected(uuid, uuid) from public, anon;
revoke execute on function public.profile_is_discoverable(uuid) from public, anon;
revoke execute on function public.check_vybe_rate_limit(text, integer, integer) from public, anon;
revoke execute on function public.vybe_compatibility(uuid) from public, anon;
revoke execute on function public.mutual_friend_count(uuid) from public, anon;
revoke execute on function public.get_discovery_profiles(text[], boolean, text, text, integer, integer) from public, anon;
revoke execute on function public.submit_swipe(uuid, text) from public, anon;
revoke execute on function public.undo_last_pass() from public, anon;
revoke execute on function public.unmatch(uuid) from public, anon;
revoke execute on function public.record_profile_interaction(uuid) from public, anon;

grant execute on function public.has_active_match(uuid, uuid) to authenticated;
grant execute on function public.can_message(uuid, uuid) to authenticated;
grant execute on function public.are_connected(uuid, uuid) to authenticated;
grant execute on function public.profile_is_discoverable(uuid) to authenticated;
grant execute on function public.vybe_compatibility(uuid) to authenticated;
grant execute on function public.mutual_friend_count(uuid) to authenticated;
grant execute on function public.get_discovery_profiles(text[], boolean, text, text, integer, integer) to authenticated;
grant execute on function public.submit_swipe(uuid, text) to authenticated;
grant execute on function public.undo_last_pass() to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;
grant execute on function public.record_profile_interaction(uuid) to authenticated;

-- Realtime replication for match and decision changes used by private account subscriptions.
do $$
begin
  begin alter publication supabase_realtime add table public.matches; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.swipe_decisions; exception when duplicate_object then null; end;
end $$;

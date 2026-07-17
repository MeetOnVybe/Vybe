-- VYBE Phase 2: accounts, profiles, friendships, private chat, presence, and notifications.
-- Apply with `supabase db push` or paste into the Supabase SQL editor in order.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.vybe_age_bracket as enum ('13-15', '16-17');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vybe_notification_type as enum ('friend_request', 'friend_accepted', 'message', 'safety', 'system');
exception when duplicate_object then null;
end $$;

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
  raise exception 'VYBE currently supports ages 13 through 17';
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name text not null default '',
  date_of_birth date,
  age_bracket public.vybe_age_bracket,
  bio text not null default '',
  status text not null default '✨ Looking for new friends',
  interests text[] not null default '{}',
  avatar_url text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (char_length(display_name) <= 40),
  constraint profiles_bio_length check (char_length(bio) <= 160),
  constraint profiles_interest_limit check (cardinality(interests) <= 10)
);

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
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_derived_fields on public.profiles;
create trigger profiles_derived_fields
before insert or update on public.profiles
for each row execute function public.set_profile_derived_fields();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  requested_dob date;
begin
  requested_username := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'vybe_' || substr(new.id::text, 1, 8));
  begin
    requested_dob := nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date;
  exception when others then
    requested_dob := null;
  end;

  insert into public.profiles (id, username, display_name, date_of_birth)
  values (
    new.id,
    requested_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), requested_username),
    requested_dob
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.user_presence (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_unique_pair
on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));

create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_sorted check (user_a < user_b),
  constraint friendships_not_self check (user_a <> user_b)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_sorted check (user_a < user_b),
  constraint conversations_not_self check (user_a <> user_b),
  unique (user_a, user_b)
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  client_nonce uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  constraint messages_not_self check (sender_id <> receiver_id),
  constraint messages_body_length check (char_length(trim(body)) between 1 and 1000),
  unique (sender_id, client_nonce)
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists messages_receiver_unread_idx on public.messages(receiver_id, read_at) where read_at is null;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint reactions_emoji_length check (char_length(emoji) between 1 and 16)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type public.vybe_notification_type not null,
  title text not null,
  body text not null,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notifications_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  animations_enabled boolean not null default true,
  show_online_status boolean not null default true,
  read_receipts boolean not null default true,
  allow_friend_requests boolean not null default true,
  blur_sensitive_previews boolean not null default false,
  safety_reminders boolean not null default true,
  glow_intensity text not null default 'full' check (glow_intensity in ('subtle', 'full')),
  compact_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint reports_not_self check (reporter_id <> reported_id),
  constraint reports_notes_length check (char_length(notes) <= 1000)
);

-- Placeholders for future professional providers. No browser workflow is enabled in Phase 2.
create table if not exists public.age_assurance_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text,
  provider_reference text,
  status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parental_consent_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text,
  provider_reference text,
  status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-create the auth trigger after all referenced tables exist.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_blocked_between(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = first_user and blocked_id = second_user)
       or (blocker_id = second_user and blocked_id = first_user)
  );
$$;

create or replace function public.are_friends(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(first_user, second_user)
      and user_b = greatest(first_user, second_user)
  ) and not public.is_blocked_between(first_user, second_user);
$$;

create or replace function public.current_age_bracket()
returns public.vybe_age_bracket
language sql
stable
security definer
set search_path = public
as $$
  select age_bracket from public.profiles where id = auth.uid();
$$;

create or replace function public.same_age_bracket(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p1.age_bracket is not null and p1.age_bracket = p2.age_bracket
  from public.profiles p1 cross join public.profiles p2
  where p1.id = first_user and p2.id = second_user;
$$;

create or replace function public.validate_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id <> auth.uid() then raise exception 'You may only send requests as yourself'; end if;
  if not public.same_age_bracket(new.sender_id, new.receiver_id) then raise exception 'Age brackets must match'; end if;
  if public.is_blocked_between(new.sender_id, new.receiver_id) then raise exception 'Friend request unavailable'; end if;
  if public.are_friends(new.sender_id, new.receiver_id) then raise exception 'Already friends'; end if;
  if not coalesce((select allow_friend_requests from public.user_settings where user_id = new.receiver_id), true) then
    raise exception 'This user is not accepting friend requests';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_friend_request_trigger on public.friend_requests;
create trigger validate_friend_request_trigger
before insert on public.friend_requests
for each row execute function public.validate_friend_request();

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
  values (new.receiver_id, new.sender_id, 'friend_request', 'New friend request', 'Someone wants to connect with you.', new.id);
  return new;
end;
$$;

drop trigger if exists notify_friend_request_trigger on public.friend_requests;
create trigger notify_friend_request_trigger
after insert on public.friend_requests
for each row execute function public.notify_friend_request();

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.friend_requests%rowtype;
begin
  select * into request_row from public.friend_requests where id = request_id for update;
  if request_row.id is null then raise exception 'Request not found'; end if;
  if request_row.receiver_id <> auth.uid() then raise exception 'Only the receiver can accept'; end if;
  if public.is_blocked_between(request_row.sender_id, request_row.receiver_id) then raise exception 'Request unavailable'; end if;
  if not public.same_age_bracket(request_row.sender_id, request_row.receiver_id) then raise exception 'Age brackets must match'; end if;

  insert into public.friendships (user_a, user_b, created_by)
  values (least(request_row.sender_id, request_row.receiver_id), greatest(request_row.sender_id, request_row.receiver_id), auth.uid())
  on conflict do nothing;
  delete from public.friend_requests where id = request_id;
  insert into public.notifications (user_id, actor_id, type, title, body)
  values (request_row.sender_id, request_row.receiver_id, 'friend_accepted', 'Friend request accepted', 'You can now chat privately.');
end;
$$;

create or replace function public.decline_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friend_requests where id = request_id and receiver_id = auth.uid();
  if not found then raise exception 'Request not found'; end if;
end;
$$;

create or replace function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friend_requests where id = request_id and sender_id = auth.uid();
  if not found then raise exception 'Request not found'; end if;
end;
$$;

create or replace function public.unfriend(other_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
  where user_a = least(auth.uid(), other_user) and user_b = greatest(auth.uid(), other_user);
end;
$$;

create or replace function public.block_user(other_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if other_user = auth.uid() then raise exception 'Cannot block yourself'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), other_user) on conflict do nothing;
  delete from public.friend_requests where (sender_id = auth.uid() and receiver_id = other_user) or (sender_id = other_user and receiver_id = auth.uid());
  delete from public.friendships where user_a = least(auth.uid(), other_user) and user_b = greatest(auth.uid(), other_user);
end;
$$;

create or replace function public.unblock_user(other_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = other_user;
end;
$$;

create or replace function public.get_or_create_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id uuid;
begin
  if not public.are_friends(auth.uid(), other_user) then raise exception 'Accepted friendship required'; end if;
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
  if not public.are_friends(new.sender_id, new.receiver_id) then raise exception 'Accepted friendship required'; end if;
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

drop trigger if exists validate_message_trigger on public.messages;
create trigger validate_message_trigger
before insert on public.messages
for each row execute function public.validate_message();

create or replace function public.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
  values (new.receiver_id, new.sender_id, 'message', 'New message', left(new.body, 120), new.conversation_id);
  return new;
end;
$$;

drop trigger if exists after_message_insert_trigger on public.messages;
create trigger after_message_insert_trigger
after insert on public.messages
for each row execute function public.after_message_insert();

create or replace function public.set_presence(online boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_presence (user_id, is_online, last_seen_at, updated_at)
  values (auth.uid(), online, now(), now())
  on conflict (user_id) do update
  set is_online = excluded.is_online,
      last_seen_at = now(),
      updated_at = now();
end;
$$;

create or replace function public.get_my_profile()
returns table (
  id uuid, username text, display_name text, date_of_birth date, age_bracket public.vybe_age_bracket,
  bio text, status text, interests text[], avatar_url text, banner_url text, created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username::text, p.display_name, p.date_of_birth, p.age_bracket, p.bio, p.status,
         p.interests, p.avatar_url, p.banner_url, p.created_at, p.updated_at
  from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.update_my_date_of_birth(new_date_of_birth date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set date_of_birth = new_date_of_birth where id = auth.uid();
end;
$$;

-- Buckets are private; clients generate signed URLs. Object paths must start with the authenticated user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('profile-banners', 'profile-banners', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Enable Postgres Changes for the private social tables where available.
do $$
declare table_name text;
begin
  foreach table_name in array array['friend_requests','friendships','messages','message_reactions','notifications','user_presence'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

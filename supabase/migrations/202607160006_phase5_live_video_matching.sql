-- VYBE Phase 5: secure one-to-one video matching, privacy-safe location filters,
-- age-isolated queueing, LiveKit room authorization, safety logs and video moderation.
-- Phase 4 friends, matches, chat, stories, groups and admin systems remain authoritative.

-- ---------------------------------------------------------------------------
-- Profile matching identity and optional coarse location.
-- Never store GPS, street address, ZIP, school, distance or live location.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists video_gender text not null default 'unspecified',
  add column if not exists country_code text not null default '',
  add column if not exists country_name text not null default '',
  add column if not exists state_region text not null default '',
  add column if not exists city text not null default '',
  add column if not exists location_visibility text not null default 'hidden';

alter table public.profiles drop constraint if exists profiles_video_gender_check;
alter table public.profiles add constraint profiles_video_gender_check
  check (video_gender in ('girl','boy','other','unspecified'));
alter table public.profiles drop constraint if exists profiles_location_visibility_check;
alter table public.profiles add constraint profiles_location_visibility_check
  check (location_visibility in ('hidden','country','state','city'));
alter table public.profiles drop constraint if exists profiles_country_code_length;
alter table public.profiles add constraint profiles_country_code_length
  check (char_length(country_code) <= 2);
alter table public.profiles drop constraint if exists profiles_country_name_length;
alter table public.profiles add constraint profiles_country_name_length
  check (char_length(country_name) <= 80);
alter table public.profiles drop constraint if exists profiles_state_region_length;
alter table public.profiles add constraint profiles_state_region_length
  check (char_length(state_region) <= 100);
alter table public.profiles drop constraint if exists profiles_city_length;
alter table public.profiles add constraint profiles_city_length
  check (char_length(city) <= 100);

-- Keep the narrow signed-in profile RPC current with all Phase 4/5 fields.
drop function if exists public.get_my_profile();
create function public.get_my_profile()
returns table (
  id uuid, username text, display_name text, date_of_birth date, age_bracket public.vybe_age_bracket,
  bio text, status text, interests text[], avatar_url text, banner_url text,
  favorite_music text, favorite_games text[], favorite_hobbies text[], school_grade text, pronouns text,
  favorite_sports text[], accent_color text, profile_badges text[],
  video_gender text, country_code text, country_name text, state_region text, city text, location_visibility text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set age_bracket=public.calculate_age_bracket(p.date_of_birth)
  where p.id=auth.uid() and p.age_bracket is distinct from public.calculate_age_bracket(p.date_of_birth);
  return query select p.id,p.username::text,p.display_name,p.date_of_birth,p.age_bracket,p.bio,p.status,p.interests,p.avatar_url,p.banner_url,
    p.favorite_music,p.favorite_games,p.favorite_hobbies,p.school_grade,p.pronouns,p.favorite_sports,p.accent_color,p.profile_badges,
    p.video_gender,p.country_code,p.country_name,p.state_region,p.city,p.location_visibility,p.created_at,p.updated_at
  from public.profiles p where p.id=auth.uid();
end;
$$;
revoke execute on function public.get_my_profile() from public,anon;
grant execute on function public.get_my_profile() to authenticated;

create index if not exists profiles_video_bracket_gender_idx
  on public.profiles(age_bracket, video_gender, created_at desc);
create index if not exists profiles_video_country_idx
  on public.profiles(age_bracket, country_code) where country_code <> '';
create index if not exists profiles_video_state_idx
  on public.profiles(age_bracket, country_code, lower(state_region)) where state_region <> '';
create index if not exists profiles_video_city_idx
  on public.profiles(age_bracket, country_code, lower(state_region), lower(city)) where city <> '';


-- Prevent sensitive birth/location fields from being selected directly through PostgREST.
-- The owner-only get_my_profile RPC returns them to the signed-in user, while video
-- peers receive only the privacy-filtered label from get_video_session_state.
revoke select, update on public.profiles from authenticated;
grant select (
  id,username,display_name,age_bracket,bio,status,interests,avatar_url,banner_url,
  favorite_music,favorite_games,favorite_hobbies,school_grade,pronouns,
  favorite_sports,accent_color,profile_badges,created_at,updated_at
) on public.profiles to authenticated;
grant update (
  username,display_name,date_of_birth,bio,status,interests,avatar_url,banner_url,
  favorite_music,favorite_games,favorite_hobbies,school_grade,pronouns,
  favorite_sports,accent_color,video_gender,country_code,country_name,
  state_region,city,location_visibility
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Preferences, queue, sessions, participants, safety events and restrictions.
-- ---------------------------------------------------------------------------
create table if not exists public.video_match_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gender_preference text not null default 'everyone'
    check (gender_preference in ('girls','boys','everyone')),
  location_filter text not null default 'anywhere'
    check (location_filter in ('anywhere','country','state','city')),
  camera_enabled boolean not null default true,
  microphone_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.video_match_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'waiting'
    check (status in ('waiting','matched','cancelled','restricted')),
  session_id uuid,
  entered_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  attempt_nonce uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_sessions (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  room_name text not null unique,
  status text not null default 'connecting'
    check (status in ('connecting','active','reconnecting','ended','flagged')),
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  end_reason text,
  last_activity_at timestamptz not null default now(),
  moderation_state text not null default 'clear'
    check (moderation_state in ('clear','flagged','severe','reviewed')),
  hidden_until_review boolean not null default false,
  constraint video_sessions_sorted check (user_a < user_b),
  constraint video_sessions_not_self check (user_a <> user_b)
);

alter table public.video_match_queue
  drop constraint if exists video_match_queue_session_id_fkey;
alter table public.video_match_queue
  add constraint video_match_queue_session_id_fkey
  foreign key (session_id) references public.video_sessions(id) on delete set null;

create table if not exists public.video_session_participants (
  session_id uuid not null references public.video_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  connection_quality text not null default 'unknown'
    check (connection_quality in ('unknown','excellent','good','poor','lost')),
  camera_enabled boolean not null default true,
  microphone_enabled boolean not null default true,
  primary key (session_id, user_id)
);

create table if not exists public.video_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.video_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.video_moderation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.video_sessions(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  categories text[] not null default '{}',
  severity text not null default 'low'
    check (severity in ('low','medium','high','critical')),
  provider text not null default 'manual',
  summary text not null default '',
  hidden boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.video_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','restricted','review_required')),
  reason text not null default '',
  strike_count integer not null default 0 check (strike_count >= 0),
  restricted_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index if not exists video_queue_waiting_idx
  on public.video_match_queue(status, heartbeat_at desc, entered_at)
  where status = 'waiting';
create index if not exists video_sessions_user_a_status_idx
  on public.video_sessions(user_a, status, last_activity_at desc);
create index if not exists video_sessions_user_b_status_idx
  on public.video_sessions(user_b, status, last_activity_at desc);
create index if not exists video_sessions_pair_history_idx
  on public.video_sessions(user_a, user_b, created_at desc);
create index if not exists video_session_events_session_time_idx
  on public.video_session_events(session_id, created_at desc);
create index if not exists video_session_events_user_type_idx
  on public.video_session_events(user_id, event_type, created_at desc);
create index if not exists video_moderation_pending_idx
  on public.video_moderation_events(severity, created_at desc) where reviewed_at is null;
create index if not exists video_restrictions_active_idx
  on public.video_restrictions(status, restricted_until);

-- Existing moderation/report queues accept video sessions as a source.
alter table public.moderation_reports drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check
  check (target_type in ('profile','message','story','group','video_session'));
alter table public.moderation_flags drop constraint if exists moderation_flags_source_type_check;
alter table public.moderation_flags add constraint moderation_flags_source_type_check
  check (source_type in ('message','story','profile','report','video_session'));

-- ---------------------------------------------------------------------------
-- Security and matching helpers.
-- ---------------------------------------------------------------------------
create or replace function public.video_user_can_participate(check_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.account_can_participate(check_user)
    and coalesce((
      select status = 'active'
        or (status = 'restricted' and restricted_until is not null and restricted_until <= now())
      from public.video_restrictions where user_id = check_user
    ), true)
    and exists (
      select 1 from public.profiles
      where id = check_user
        and age_bracket in ('13-15','16-17')
        and video_gender <> 'unspecified'
    );
$$;

create or replace function public.video_gender_allows(preference text, target_gender text)
returns boolean
language sql immutable set search_path = public as $$
  select case preference
    when 'girls' then target_gender = 'girl'
    when 'boys' then target_gender = 'boy'
    else target_gender in ('girl','boy','other')
  end;
$$;

create or replace function public.video_location_allows(requester uuid, target uuid, requested_filter text)
returns boolean
language sql stable security definer set search_path = public as $$
  with a as (
    select country_code, state_region, city, location_visibility from public.profiles where id = requester
  ), b as (
    select country_code, state_region, city, location_visibility from public.profiles where id = target
  )
  select case requested_filter
    when 'anywhere' then true
    when 'country' then
      a.location_visibility in ('country','state','city') and b.location_visibility in ('country','state','city')
      and a.country_code <> '' and lower(a.country_code) = lower(b.country_code)
    when 'state' then
      a.location_visibility in ('state','city') and b.location_visibility in ('state','city')
      and a.country_code <> '' and lower(a.country_code) = lower(b.country_code)
      and a.state_region <> '' and lower(a.state_region) = lower(b.state_region)
    when 'city' then
      a.location_visibility = 'city' and b.location_visibility = 'city'
      and a.country_code <> '' and lower(a.country_code) = lower(b.country_code)
      and a.state_region <> '' and lower(a.state_region) = lower(b.state_region)
      and a.city <> '' and lower(a.city) = lower(b.city)
    else false
  end from a, b;
$$;

create or replace function public.video_pair_eligible(first_user uuid, second_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select first_user <> second_user
    and public.video_user_can_participate(first_user)
    and public.video_user_can_participate(second_user)
    and public.same_age_bracket(first_user, second_user)
    and not public.is_blocked_between(first_user, second_user);
$$;

create or replace function public.can_access_video_session(target_session uuid, viewer_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.video_sessions s
    where s.id = target_session
      and viewer_user in (s.user_a, s.user_b)
      and public.video_pair_eligible(s.user_a, s.user_b)
      and s.status in ('connecting','active','reconnecting','flagged')
  );
$$;

create or replace function public.video_location_label(target_user uuid, viewer_user uuid default auth.uid())
returns text
language sql stable security definer set search_path = public as $$
  select case p.location_visibility
    when 'country' then nullif(p.country_name, '')
    when 'state' then nullif(concat_ws(', ', nullif(p.state_region,''), nullif(p.country_name,'')), '')
    when 'city' then nullif(concat_ws(', ', nullif(p.city,''), nullif(p.state_region,''), nullif(p.country_name,'')), '')
    else null
  end
  from public.profiles p
  where p.id = target_user
    and public.same_age_bracket(target_user, viewer_user)
    and not public.is_blocked_between(target_user, viewer_user);
$$;

create or replace function public.expire_stale_video_sessions()
returns void
language plpgsql security definer set search_path = public as $$
declare stale_ids uuid[];
begin
  select coalesce(array_agg(s.id), '{}'::uuid[]) into stale_ids
  from public.video_sessions s
  where s.status in ('connecting','active','reconnecting','flagged')
    and not exists (
      select 1 from public.video_session_participants p
      where p.session_id=s.id and p.last_heartbeat_at>now()-interval '90 seconds'
    );
  if coalesce(array_length(stale_ids,1),0)=0 then return; end if;
  update public.video_sessions set status='ended',ended_at=coalesce(ended_at,now()),end_reason='stale_timeout',last_activity_at=now()
  where id=any(stale_ids) and status<>'ended';
  update public.video_session_participants set disconnected_at=coalesce(disconnected_at,now()),connection_quality='lost'
  where session_id=any(stale_ids);
  update public.video_match_queue set status='cancelled',session_id=null,updated_at=now()
  where session_id=any(stale_ids);
end;
$$;

create or replace function public.guard_video_session_insert()
returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.video_sessions s
    where s.status in ('connecting','active','reconnecting','flagged')
      and (new.user_a in (s.user_a,s.user_b) or new.user_b in (s.user_a,s.user_b))
  ) then raise exception 'A participant already has an active video session'; end if;
  return new;
end;
$$;
drop trigger if exists guard_video_session_insert on public.video_sessions;
create trigger guard_video_session_insert before insert on public.video_sessions
for each row execute function public.guard_video_session_insert();

-- ---------------------------------------------------------------------------
-- Queue and session RPCs. These are the only client mutation path.
-- ---------------------------------------------------------------------------
create or replace function public.save_video_match_preferences(
  gender_value text,
  location_value text,
  camera_value boolean default true,
  microphone_value boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if gender_value not in ('girls','boys','everyone') then raise exception 'Invalid gender preference'; end if;
  if location_value not in ('anywhere','country','state','city') then raise exception 'Invalid location filter'; end if;
  if location_value = 'city' and not exists (
    select 1 from public.profiles where id = auth.uid() and location_visibility = 'city' and city <> ''
  ) then raise exception 'City matching requires city sharing'; end if;
  insert into public.video_match_preferences(user_id,gender_preference,location_filter,camera_enabled,microphone_enabled,updated_at)
  values(auth.uid(),gender_value,location_value,camera_value,microphone_value,now())
  on conflict(user_id) do update set
    gender_preference=excluded.gender_preference,
    location_filter=excluded.location_filter,
    camera_enabled=excluded.camera_enabled,
    microphone_enabled=excluded.microphone_enabled,
    updated_at=now();
end;
$$;

create or replace function public.join_video_queue(
  gender_value text default 'everyone',
  location_value text default 'anywhere',
  camera_value boolean default true,
  microphone_value boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  candidate uuid;
  candidate_pref public.video_match_preferences%rowtype;
  my_gender text;
  session_row public.video_sessions%rowtype;
  retry_seconds integer;
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform public.check_vybe_rate_limit('video_queue_join', 45, 3600);
  perform public.expire_stale_video_sessions();
  perform public.save_video_match_preferences(gender_value,location_value,camera_value,microphone_value);

  if not public.video_user_can_participate(me) then
    select greatest(0, extract(epoch from (restricted_until-now()))::integer)
      into retry_seconds from public.video_restrictions where user_id=me and restricted_until>now();
    return jsonb_build_object('status','restricted','retryAfterSeconds',coalesce(retry_seconds,0),'restrictionReason',coalesce((select reason from public.video_restrictions where user_id=me),'Complete your video profile or contact Safety Center.'));
  end if;

  select video_gender into my_gender from public.profiles where id=me;

  -- Reuse an existing active session rather than creating duplicates.
  select * into session_row from public.video_sessions
  where me in (user_a,user_b) and status in ('connecting','active','reconnecting','flagged')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  update public.video_match_queue set status='cancelled',updated_at=now()
  where status='waiting' and heartbeat_at < now()-interval '45 seconds';

  insert into public.video_match_queue(user_id,status,session_id,entered_at,heartbeat_at,attempt_nonce,updated_at)
  values(me,'waiting',null,now(),now(),gen_random_uuid(),now())
  on conflict(user_id) do update set status='waiting',session_id=null,entered_at=now(),heartbeat_at=now(),attempt_nonce=gen_random_uuid(),updated_at=now();

  select q.user_id into candidate
  from public.video_match_queue q
  join public.video_match_preferences vp on vp.user_id=q.user_id
  join public.profiles p on p.id=q.user_id
  where q.status='waiting'
    and q.user_id<>me
    and q.heartbeat_at>now()-interval '35 seconds'
    and public.video_pair_eligible(me,q.user_id)
    and public.video_gender_allows(gender_value,p.video_gender)
    and public.video_gender_allows(vp.gender_preference,my_gender)
    and public.video_location_allows(me,q.user_id,location_value)
    and public.video_location_allows(q.user_id,me,vp.location_filter)
    and not exists (
      select 1 from public.video_sessions recent
      where recent.user_a=least(me,q.user_id) and recent.user_b=greatest(me,q.user_id)
        and recent.created_at>now()-interval '12 hours'
        and coalesce((select repeat_prevention from public.user_settings where user_id=me),true)
        and coalesce((select repeat_prevention from public.user_settings where user_id=q.user_id),true)
    )
  order by q.entered_at asc, random()
  for update of q skip locked
  limit 1;

  if candidate is null then
    return jsonb_build_object('status','waiting');
  end if;
  select * into candidate_pref from public.video_match_preferences where user_id=candidate;

  insert into public.video_sessions(user_a,user_b,room_name,status)
  values(least(me,candidate),greatest(me,candidate),'vybe_'||replace(gen_random_uuid()::text,'-',''),'connecting')
  returning * into session_row;

  insert into public.video_session_participants(session_id,user_id,camera_enabled,microphone_enabled)
  values
    (session_row.id,me,camera_value,microphone_value),
    (session_row.id,candidate,candidate_pref.camera_enabled,candidate_pref.microphone_enabled);

  update public.video_match_queue set status='matched',session_id=session_row.id,heartbeat_at=now(),updated_at=now()
  where user_id in (me,candidate);

  insert into public.video_session_events(session_id,user_id,event_type,metadata)
  values(session_row.id,me,'matched',jsonb_build_object('source','queue')),
        (session_row.id,candidate,'matched',jsonb_build_object('source','queue'));

  insert into public.notifications(user_id,actor_id,type,title,body,entity_id)
  values(candidate,me,'system','Video VYBE ready','Your secure one-on-one video match is ready.',session_row.id),
        (me,candidate,'system','Video VYBE ready','Your secure one-on-one video match is ready.',session_row.id);

  return jsonb_build_object('status','matched','sessionId',session_row.id);
end;
$$;

create or replace function public.get_video_queue_status()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  session_row public.video_sessions%rowtype;
  queue_row public.video_match_queue%rowtype;
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform public.expire_stale_video_sessions();
  select * into session_row from public.video_sessions
  where me in (user_a,user_b) and status in ('connecting','active','reconnecting','flagged')
  order by created_at desc limit 1;
  if found then return jsonb_build_object('status','matched','sessionId',session_row.id); end if;
  select * into queue_row from public.video_match_queue where user_id=me;
  if not found then return jsonb_build_object('status','idle'); end if;
  if queue_row.status='waiting' and queue_row.heartbeat_at<now()-interval '45 seconds' then
    update public.video_match_queue set status='cancelled',session_id=null,updated_at=now() where user_id=me;
    return jsonb_build_object('status','cancelled');
  end if;
  if queue_row.status='matched' and not exists (
    select 1 from public.video_sessions s where s.id=queue_row.session_id and s.status in ('connecting','active','reconnecting','flagged')
  ) then
    update public.video_match_queue set status='cancelled',session_id=null,updated_at=now() where user_id=me;
    return jsonb_build_object('status','cancelled');
  end if;
  return jsonb_build_object('status',queue_row.status,'sessionId',queue_row.session_id);
end;
$$;

create or replace function public.heartbeat_video_queue()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.video_match_queue set heartbeat_at=now(),updated_at=now()
  where user_id=auth.uid() and status in ('waiting','matched');
  update public.video_session_participants set last_heartbeat_at=now()
  where user_id=auth.uid() and exists (
    select 1 from public.video_sessions s where s.id=session_id and s.status in ('connecting','active','reconnecting','flagged')
  );
end;
$$;

create or replace function public.leave_video_queue()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.video_match_queue set status='cancelled',session_id=null,updated_at=now()
  where user_id=auth.uid() and status='waiting';
end;
$$;

create or replace function public.get_video_session_state(target_session uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.video_sessions%rowtype;
  peer_id uuid;
  p public.profiles%rowtype;
begin
  if me is null or not public.can_access_video_session(target_session,me) then raise exception 'Video session access required'; end if;
  select * into s from public.video_sessions where id=target_session;
  peer_id := case when s.user_a=me then s.user_b else s.user_a end;
  select * into p from public.profiles where id=peer_id;
  return jsonb_build_object(
    'id',s.id,'roomName',s.room_name,'status',s.status,'createdAt',s.created_at,
    'connectedAt',s.connected_at,'endedAt',s.ended_at,'hiddenUntilReview',s.hidden_until_review,
    'peer',jsonb_build_object(
      'id',p.id,'username',p.username::text,'displayName',p.display_name,'avatarPath',p.avatar_url,
      'bannerPath',p.banner_url,'bio',p.bio,'status',p.status,'interests',p.interests,
      'ageBracket',p.age_bracket,'compatibilityScore',public.vybe_compatibility(peer_id),
      'locationLabel',public.video_location_label(peer_id,me)
    )
  );
end;
$$;

create or replace function public.update_video_participant_state(
  target_session uuid,
  connected boolean default true,
  quality_value text default 'unknown',
  camera_value boolean default true,
  microphone_value boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
declare active_count integer;
begin
  if not public.can_access_video_session(target_session,auth.uid()) then raise exception 'Video session access required'; end if;
  if quality_value not in ('unknown','excellent','good','poor','lost') then quality_value:='unknown'; end if;
  update public.video_session_participants set
    connected_at=case when connected then coalesce(connected_at,now()) else connected_at end,
    disconnected_at=case when connected then null else now() end,
    last_heartbeat_at=now(),connection_quality=quality_value,
    camera_enabled=camera_value,microphone_enabled=microphone_value
  where session_id=target_session and user_id=auth.uid();
  select count(*) into active_count from public.video_session_participants
  where session_id=target_session and connected_at is not null and disconnected_at is null;
  update public.video_sessions set
    status=case when active_count=2 then 'active' else case when status='active' then 'reconnecting' else status end end,
    connected_at=case when active_count=2 then coalesce(connected_at,now()) else connected_at end,
    last_activity_at=now()
  where id=target_session and status<>'ended';
end;
$$;

create or replace function public.log_video_session_event(target_session uuid, event_name text, event_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_video_session(target_session,auth.uid()) then raise exception 'Video session access required'; end if;
  if event_name not in ('permission_granted','permission_denied','connected','reconnecting','reconnected','quality','camera_toggle','microphone_toggle','profile_view','friend_request','like','chat_open','moderation_sample') then
    raise exception 'Unsupported video event';
  end if;
  perform public.check_vybe_rate_limit('video_event',240,3600);
  insert into public.video_session_events(session_id,user_id,event_type,metadata)
  values(target_session,auth.uid(),event_name,coalesce(event_metadata,'{}'::jsonb));
  update public.video_sessions set last_activity_at=now() where id=target_session;
end;
$$;

create or replace function public.end_video_session(target_session uuid, end_value text default 'end')
returns void
language plpgsql security definer set search_path = public as $$
declare s public.video_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into s from public.video_sessions where id=target_session and auth.uid() in (user_a,user_b) for update;
  if not found then raise exception 'Video session access required'; end if;
  if end_value not in ('skip','end','disconnect','block','report','moderation') then end_value:='end'; end if;
  if end_value='skip' then
    perform public.check_vybe_rate_limit('video_skip',20,3600);
  end if;
  update public.video_sessions set status='ended',ended_at=coalesce(ended_at,now()),ended_by=auth.uid(),end_reason=end_value,last_activity_at=now()
  where id=target_session and status<>'ended';
  update public.video_session_participants set disconnected_at=coalesce(disconnected_at,now()),connection_quality='lost'
  where session_id=target_session;
  update public.video_match_queue set status='cancelled',session_id=null,updated_at=now()
  where user_id in (s.user_a,s.user_b);
  insert into public.video_session_events(session_id,user_id,event_type,metadata)
  values(target_session,auth.uid(),'ended',jsonb_build_object('reason',end_value));

  -- Fast repeated skipping is throttled without permanently punishing normal use.
  if end_value='skip' and (
    select count(*) from public.video_session_events e
    where e.user_id=auth.uid() and e.event_type='ended'
      and e.metadata->>'reason'='skip' and e.created_at>now()-interval '15 minutes'
  ) >= 12 then
    insert into public.video_restrictions(user_id,status,reason,strike_count,restricted_until,updated_at)
    values(auth.uid(),'restricted','Too many rapid skips. Take a short break before matching again.',1,now()+interval '10 minutes',now())
    on conflict(user_id) do update set
      status='restricted',reason=excluded.reason,
      strike_count=public.video_restrictions.strike_count+1,
      restricted_until=greatest(coalesce(public.video_restrictions.restricted_until,now()),excluded.restricted_until),
      updated_at=now();
  end if;
end;
$$;


-- Reports about a video session are routed into the existing moderation queue. Three
-- distinct reports in 24 hours place the reported account into human review; the
-- video itself is never recorded or stored by this trigger.
create or replace function public.route_video_report_to_review()
returns trigger
language plpgsql security definer set search_path = public as $$
declare report_count integer;
begin
  if new.target_type <> 'video_session' or new.target_id is null then return new; end if;
  if not exists (
    select 1 from public.video_sessions s
    where s.id=new.target_id and new.reporter_id in (s.user_a,s.user_b)
      and new.reported_id in (s.user_a,s.user_b) and new.reporter_id<>new.reported_id
  ) then raise exception 'Invalid video report relationship'; end if;

  insert into public.video_moderation_events(session_id,subject_user_id,submitted_by,categories,severity,provider,summary,hidden)
  values(new.target_id,new.reported_id,new.reporter_id,array[new.reason],
    case when lower(new.reason) in ('nudity','sexual content','predatory behavior','threats') then 'high' else 'medium' end,
    'user_report',left(coalesce(new.notes,''),500),false);

  update public.video_sessions set moderation_state='flagged',last_activity_at=now()
  where id=new.target_id and moderation_state='clear';

  select count(distinct r.reporter_id) into report_count
  from public.moderation_reports r
  where r.reported_id=new.reported_id and r.target_type='video_session'
    and r.created_at>now()-interval '24 hours';

  if report_count >= 3 then
    insert into public.video_restrictions(user_id,status,reason,strike_count,updated_at)
    values(new.reported_id,'review_required','Multiple independent safety reports require moderator review.',1,now())
    on conflict(user_id) do update set
      status='review_required',reason=excluded.reason,
      strike_count=public.video_restrictions.strike_count+1,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists route_video_report_to_review on public.moderation_reports;
create trigger route_video_report_to_review
after insert on public.moderation_reports
for each row when (new.target_type='video_session')
execute function public.route_video_report_to_review();

-- Admin-only video restriction workflow reuses existing admin roles and audit logs.
create or replace function public.admin_set_video_restriction(
  target_user uuid,
  restriction_status text,
  reason_text text default '',
  duration_hours integer default 24
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_vybe_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if restriction_status not in ('active','restricted','review_required') then raise exception 'Invalid restriction'; end if;
  insert into public.video_restrictions(user_id,status,reason,strike_count,restricted_until,updated_at,updated_by)
  values(target_user,restriction_status,left(reason_text,1000),case when restriction_status='active' then 0 else 1 end,
    case when restriction_status='restricted' then now()+make_interval(hours=>least(greatest(duration_hours,1),720)) else null end,now(),auth.uid())
  on conflict(user_id) do update set
    status=excluded.status,reason=excluded.reason,
    strike_count=case when excluded.status='active' then 0 else public.video_restrictions.strike_count+1 end,
    restricted_until=excluded.restricted_until,updated_at=now(),updated_by=auth.uid();
  insert into public.moderation_logs(admin_id,action,target_user_id,source_type,notes)
  values(auth.uid(),case when restriction_status='active' then 'restore' else 'suspend' end,target_user,'video_session',left(reason_text,1500));
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants and realtime publication.
-- ---------------------------------------------------------------------------
alter table public.video_match_preferences enable row level security;
alter table public.video_match_queue enable row level security;
alter table public.video_sessions enable row level security;
alter table public.video_session_participants enable row level security;
alter table public.video_session_events enable row level security;
alter table public.video_moderation_events enable row level security;
alter table public.video_restrictions enable row level security;

revoke all on public.video_match_preferences, public.video_match_queue, public.video_sessions,
  public.video_session_participants, public.video_session_events, public.video_moderation_events,
  public.video_restrictions from anon, authenticated;
grant select on public.video_match_preferences, public.video_match_queue, public.video_sessions,
  public.video_session_participants, public.video_session_events, public.video_moderation_events,
  public.video_restrictions to authenticated;

create policy video_preferences_own_select on public.video_match_preferences
  for select to authenticated using (user_id=auth.uid());
create policy video_queue_own_select on public.video_match_queue
  for select to authenticated using (user_id=auth.uid());
create policy video_sessions_participant_or_admin on public.video_sessions
  for select to authenticated using (auth.uid() in (user_a,user_b) or public.is_vybe_admin(auth.uid()));
create policy video_participants_session_member on public.video_session_participants
  for select to authenticated using (public.can_access_video_session(session_id,auth.uid()) or public.is_vybe_admin(auth.uid()));
create policy video_events_participant_or_admin on public.video_session_events
  for select to authenticated using (public.can_access_video_session(session_id,auth.uid()) or public.is_vybe_admin(auth.uid()));
create policy video_moderation_admin_only on public.video_moderation_events
  for select to authenticated using (public.is_vybe_admin(auth.uid()));
create policy video_restrictions_own_or_admin on public.video_restrictions
  for select to authenticated using (user_id=auth.uid() or public.is_vybe_admin(auth.uid()));

-- Profile owners may update only their own coarse location and video identity through the existing profile policy.
-- The Phase 4 profiles update policy already enforces id = auth.uid().

revoke execute on function public.expire_stale_video_sessions() from public,anon,authenticated;
revoke execute on function public.save_video_match_preferences(text,text,boolean,boolean) from public,anon;
revoke execute on function public.join_video_queue(text,text,boolean,boolean) from public,anon;
revoke execute on function public.get_video_queue_status() from public,anon;
revoke execute on function public.heartbeat_video_queue() from public,anon;
revoke execute on function public.leave_video_queue() from public,anon;
revoke execute on function public.get_video_session_state(uuid) from public,anon;
revoke execute on function public.update_video_participant_state(uuid,boolean,text,boolean,boolean) from public,anon;
revoke execute on function public.log_video_session_event(uuid,text,jsonb) from public,anon;
revoke execute on function public.end_video_session(uuid,text) from public,anon;
revoke execute on function public.admin_set_video_restriction(uuid,text,text,integer) from public,anon;

grant execute on function public.save_video_match_preferences(text,text,boolean,boolean) to authenticated;
grant execute on function public.join_video_queue(text,text,boolean,boolean) to authenticated;
grant execute on function public.get_video_queue_status() to authenticated;
grant execute on function public.heartbeat_video_queue() to authenticated;
grant execute on function public.leave_video_queue() to authenticated;
grant execute on function public.get_video_session_state(uuid) to authenticated;
grant execute on function public.update_video_participant_state(uuid,boolean,text,boolean,boolean) to authenticated;
grant execute on function public.log_video_session_event(uuid,text,jsonb) to authenticated;
grant execute on function public.end_video_session(uuid,text) to authenticated;
grant execute on function public.admin_set_video_restriction(uuid,text,text,integer) to authenticated;

-- Private Realtime topics are authorized only for the queue owner or session participants.
drop policy if exists vybe_realtime_read on realtime.messages;
drop policy if exists vybe_realtime_write on realtime.messages;
create policy vybe_realtime_read on realtime.messages for select to authenticated using (
  (realtime.topic() like 'typing:%' and public.can_access_conversation((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'video-session:%' and public.can_access_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
);
create policy vybe_realtime_write on realtime.messages for insert to authenticated with check (
  (realtime.topic() like 'typing:%' and public.can_access_conversation((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'video-session:%' and public.can_access_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
);

do $$ begin
  begin alter publication supabase_realtime add table public.video_match_queue; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.video_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.video_session_participants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.video_restrictions; exception when duplicate_object then null; end;
end $$;

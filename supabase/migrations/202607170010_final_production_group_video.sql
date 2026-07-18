-- VYBE final production group-video and realtime reliability migration.
--
-- Adds real 2-4 person Group Match while reusing the Phase 5 profile,
-- preference, age, block, restriction, moderation, notification and LiveKit
-- authorization architecture. No location coordinates or raw media are stored.

-- ---------------------------------------------------------------------------
-- Group video data model.
-- ---------------------------------------------------------------------------
create table if not exists public.group_video_sessions (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique default ('vybe_group_' || replace(gen_random_uuid()::text, '-', '')),
  age_bracket public.vybe_age_bracket not null,
  status text not null default 'forming' check (status in ('forming','connecting','active','reconnecting','flagged','ended')),
  max_participants integer not null default 4 check (max_participants between 2 and 4),
  moderation_state text not null default 'clear' check (moderation_state in ('clear','flagged','severe','reviewed')),
  hidden_until_review boolean not null default false,
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  end_reason text,
  last_activity_at timestamptz not null default now()
);

create table if not exists public.group_video_session_participants (
  session_id uuid not null references public.group_video_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  membership_status text not null default 'active' check (membership_status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  connection_quality text not null default 'unknown' check (connection_quality in ('unknown','excellent','good','poor','lost')),
  camera_enabled boolean not null default true,
  microphone_enabled boolean not null default true,
  primary key (session_id,user_id)
);

create table if not exists public.group_video_match_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','matched','cancelled','restricted')),
  session_id uuid references public.group_video_sessions(id) on delete set null,
  entered_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  attempt_nonce uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_video_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.group_video_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.group_video_moderation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_video_sessions(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  categories text[] not null default '{}',
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  provider text not null default 'automated',
  summary text not null default '',
  hidden boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_video_matchmaking_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  peer_user_ids uuid[] not null default '{}',
  session_id uuid references public.group_video_sessions(id) on delete set null,
  event_type text not null check (event_type in (
    'queue_join_requested','queue_joined','eligibility_scan','session_created',
    'session_joined','queue_status_delivered','queue_left','restricted',
    'stale_session_closed','token_requested','token_issued'
  )),
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists group_video_queue_waiting_idx
  on public.group_video_match_queue(status,heartbeat_at,entered_at)
  where status='waiting';
create index if not exists group_video_sessions_open_idx
  on public.group_video_sessions(age_bracket,status,created_at)
  where status in ('forming','connecting','active','reconnecting');
create index if not exists group_video_participants_user_active_idx
  on public.group_video_session_participants(user_id,membership_status,last_heartbeat_at desc);
create index if not exists group_video_participants_session_active_idx
  on public.group_video_session_participants(session_id,membership_status,connected_at);
create index if not exists group_video_events_session_time_idx
  on public.group_video_session_events(session_id,created_at desc);
create index if not exists group_video_moderation_pending_idx
  on public.group_video_moderation_events(severity,created_at desc)
  where reviewed_at is null;
create index if not exists group_video_logs_user_time_idx
  on public.group_video_matchmaking_logs(user_id,created_at desc);

-- Repeat prevention is shared across Solo and Group Match. Only real connected
-- encounters count: abandoned queues, failed token handoffs, and never-connected
-- rooms never lock two users out of matching again.
create or replace function public.video_pair_repeat_blocked(
  first_user uuid,
  second_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    coalesce((select repeat_prevention from public.user_settings where user_id=first_user),true)
    and coalesce((select repeat_prevention from public.user_settings where user_id=second_user),true)
    and (
      exists (
        select 1
        from public.video_sessions recent
        where recent.user_a=least(first_user,second_user)
          and recent.user_b=greatest(first_user,second_user)
          and recent.connected_at is not null
          and recent.created_at>now()-interval '12 hours'
      )
      or exists (
        select 1
        from public.group_video_sessions recent_group
        join public.group_video_session_participants first_participant
          on first_participant.session_id=recent_group.id
         and first_participant.user_id=first_user
         and first_participant.connected_at is not null
        join public.group_video_session_participants second_participant
          on second_participant.session_id=recent_group.id
         and second_participant.user_id=second_user
         and second_participant.connected_at is not null
        where recent_group.connected_at is not null
          and recent_group.created_at>now()-interval '12 hours'
      )
    );
$$;

revoke execute on function public.video_pair_repeat_blocked(uuid,uuid)
  from public,anon,authenticated;

-- Existing generic moderation queues may reference a group-video session.
alter table public.moderation_reports drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check
  check (target_type in ('profile','message','story','group','video_session','group_video_session'));
alter table public.moderation_flags drop constraint if exists moderation_flags_source_type_check;
alter table public.moderation_flags add constraint moderation_flags_source_type_check
  check (source_type in ('message','story','profile','report','video_session','group_video_session'));

-- ---------------------------------------------------------------------------
-- Secure helpers. These are not directly executable by browser roles.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_in_group_video_session(
  target_session uuid,
  viewer_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select viewer_user is not null and exists (
    select 1
    from public.group_video_session_participants participant
    join public.group_video_sessions session_row on session_row.id=participant.session_id
    where participant.session_id=target_session
      and participant.user_id=viewer_user
      and participant.membership_status='active'
      and session_row.status in ('forming','connecting','active','reconnecting','flagged')
  );
$$;

create or replace function public.group_video_pair_eligible(first_user uuid, second_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  first_pref public.video_match_preferences%rowtype;
  second_pref public.video_match_preferences%rowtype;
  first_gender text;
  second_gender text;
begin
  if not public.video_pair_eligible(first_user,second_user) then return false; end if;
  select * into first_pref from public.video_match_preferences where user_id=first_user;
  if not found then return false; end if;
  select * into second_pref from public.video_match_preferences where user_id=second_user;
  if not found then return false; end if;
  select video_gender into first_gender from public.profiles where id=first_user;
  if not found or first_gender is null then return false; end if;
  select video_gender into second_gender from public.profiles where id=second_user;
  if not found or second_gender is null then return false; end if;
  return public.video_gender_allows(first_pref.gender_preference,second_gender)
    and public.video_gender_allows(second_pref.gender_preference,first_gender)
    and public.video_location_allows(first_user,second_user,first_pref.location_filter)
    and public.video_location_allows(second_user,first_user,second_pref.location_filter)
    and not public.video_pair_repeat_blocked(first_user,second_user);
end;
$$;

create or replace function public.group_video_user_fits_session(target_user uuid,target_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.video_user_can_participate(target_user)
    and exists (
      select 1 from public.group_video_sessions session_row
      join public.profiles target_profile on target_profile.id=target_user
      where session_row.id=target_session
        and session_row.status in ('forming','connecting','active','reconnecting')
        and session_row.age_bracket=target_profile.age_bracket
        and session_row.created_at>now()-interval '4 minutes'
        and (
          select count(*) from public.group_video_session_participants participant
          where participant.session_id=session_row.id and participant.membership_status='active'
        ) < session_row.max_participants
    )
    and not exists (
      select 1 from public.group_video_session_participants participant
      where participant.session_id=target_session
        and participant.membership_status='active'
        and not public.group_video_pair_eligible(target_user,participant.user_id)
    );
$$;

create or replace function public.write_group_video_log(
  target_user uuid,
  event_name text,
  peers uuid[] default '{}',
  target_session uuid default null,
  reason_value text default null,
  event_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if target_user is null then return; end if;
  if event_name not in (
    'queue_join_requested','queue_joined','eligibility_scan','session_created',
    'session_joined','queue_status_delivered','queue_left','restricted',
    'stale_session_closed','token_requested','token_issued'
  ) then raise exception 'Unsupported group-video log event'; end if;
  if event_name in ('eligibility_scan','queue_status_delivered') and exists (
    select 1 from public.group_video_matchmaking_logs recent
    where recent.user_id=target_user
      and recent.event_type=event_name
      and recent.reason_code is not distinct from nullif(reason_value,'')
      and recent.session_id is not distinct from target_session
      and recent.created_at>now()-interval '10 seconds'
  ) then return; end if;
  insert into public.group_video_matchmaking_logs(
    user_id,peer_user_ids,session_id,event_type,reason_code,metadata
  ) values (
    target_user,coalesce(peers,'{}'::uuid[]),target_session,event_name,
    nullif(reason_value,''),coalesce(event_metadata,'{}'::jsonb)
  );
end;
$$;

create or replace function public.expire_stale_group_video_sessions()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  stale record;
  active_count integer;
begin
  update public.group_video_match_queue
  set status='cancelled',session_id=null,updated_at=now()
  where status='waiting' and heartbeat_at<now()-interval '45 seconds';

  for stale in
    select session_row.id
    from public.group_video_sessions session_row
    where session_row.status in ('forming','connecting','active','reconnecting','flagged')
      and (
        (session_row.status in ('forming','connecting') and session_row.created_at<now()-interval '90 seconds' and session_row.connected_at is null)
        or not exists (
          select 1 from public.group_video_session_participants participant
          where participant.session_id=session_row.id
            and participant.membership_status='active'
            and participant.last_heartbeat_at>now()-interval '100 seconds'
        )
      )
    for update of session_row skip locked
  loop
    update public.group_video_sessions
    set status='ended',ended_at=coalesce(ended_at,now()),end_reason='stale_timeout',last_activity_at=now()
    where id=stale.id and status<>'ended';
    update public.group_video_session_participants
    set membership_status=case when membership_status='active' then 'left' else membership_status end,
        disconnected_at=coalesce(disconnected_at,now()),connection_quality='lost'
    where session_id=stale.id;
    update public.group_video_match_queue
    set status='cancelled',session_id=null,updated_at=now()
    where session_id=stale.id;
    insert into public.group_video_session_events(session_id,event_type,metadata)
    values(stale.id,'stale_session_closed','{}'::jsonb);
  end loop;

  -- A group room remains usable with two or more active members. End abandoned
  -- one-person rooms after a reconnect grace period.
  for stale in
    select session_row.id
    from public.group_video_sessions session_row
    where session_row.status in ('active','reconnecting','flagged')
      and session_row.last_activity_at<now()-interval '75 seconds'
    for update of session_row skip locked
  loop
    select count(*) into active_count
    from public.group_video_session_participants participant
    where participant.session_id=stale.id
      and participant.membership_status='active'
      and participant.last_heartbeat_at>now()-interval '100 seconds';
    if active_count<2 then
      update public.group_video_sessions
      set status='ended',ended_at=coalesce(ended_at,now()),end_reason='not_enough_participants',last_activity_at=now()
      where id=stale.id and status<>'ended';
      update public.group_video_match_queue
      set status='cancelled',session_id=null,updated_at=now()
      where session_id=stale.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deterministic serialized assignment.
-- ---------------------------------------------------------------------------
create or replace function public.try_assign_group_video_queue(requesting_user uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
  my_queue public.group_video_match_queue%rowtype;
  session_row public.group_video_sessions%rowtype;
  candidate uuid;
  my_age public.vybe_age_bracket;
  peer_ids uuid[];
  active_count integer;
begin
  if me is null or requesting_user is distinct from me then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vybe:group-video-matchmaking:v1',0));
  perform public.expire_stale_group_video_sessions();

  select session.* into session_row
  from public.group_video_sessions session
  join public.group_video_session_participants participant on participant.session_id=session.id
  where participant.user_id=me and participant.membership_status='active'
    and session.status in ('forming','connecting','active','reconnecting','flagged')
  order by session.created_at desc limit 1;
  if found then
    update public.group_video_match_queue set status='matched',session_id=session_row.id,heartbeat_at=now(),updated_at=now()
    where user_id=me;
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select * into my_queue from public.group_video_match_queue where user_id=me for update;
  if not found then return jsonb_build_object('status','idle'); end if;
  if my_queue.status<>'waiting' then return jsonb_build_object('status',my_queue.status,'sessionId',my_queue.session_id); end if;
  if my_queue.heartbeat_at<now()-interval '45 seconds' then
    update public.group_video_match_queue set status='cancelled',session_id=null,updated_at=now() where user_id=me;
    return jsonb_build_object('status','cancelled');
  end if;
  if not public.video_user_can_participate(me) then
    update public.group_video_match_queue set status='restricted',session_id=null,updated_at=now() where user_id=me;
    perform public.write_group_video_log(me,'restricted','{}',null,'account_not_eligible','{}');
    return jsonb_build_object('status','restricted','restrictionReason','Your account is not eligible for live video right now.');
  end if;

  select age_bracket into my_age from public.profiles where id=me;

  -- Prefer a compatible forming room; joining is still pairwise checked against
  -- every active participant, so no later member can bypass safety filters.
  select session.* into session_row
  from public.group_video_sessions session
  where public.group_video_user_fits_session(me,session.id)
  order by (
    select count(*) from public.group_video_session_participants participant
    where participant.session_id=session.id and participant.membership_status='active'
  ) desc, session.created_at
  limit 1
  for update of session skip locked;

  if found then
    insert into public.group_video_session_participants(session_id,user_id)
    values(session_row.id,me)
    on conflict(session_id,user_id) do update set
      membership_status='active',joined_at=now(),disconnected_at=null,last_heartbeat_at=now();
    update public.group_video_match_queue set status='matched',session_id=session_row.id,heartbeat_at=now(),updated_at=now()
    where user_id=me;
    update public.group_video_sessions set status='connecting',last_activity_at=now() where id=session_row.id and status='forming';
    select coalesce(array_agg(user_id),'{}'::uuid[]) into peer_ids
    from public.group_video_session_participants
    where session_id=session_row.id and membership_status='active' and user_id<>me;
    perform public.write_group_video_log(me,'session_joined',peer_ids,session_row.id,'open_room','{}');
    insert into public.notifications(user_id,type,title,body,entity_id)
    values(me,'system','Group VYBE ready','Your secure group video match is ready.',session_row.id);
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select queue_row.user_id into candidate
  from public.group_video_match_queue queue_row
  where queue_row.status='waiting'
    and queue_row.user_id<>me
    and queue_row.heartbeat_at>now()-interval '35 seconds'
    and public.group_video_pair_eligible(me,queue_row.user_id)
    and not exists (
      select 1 from public.group_video_session_participants participant
      join public.group_video_sessions active_session on active_session.id=participant.session_id
      where participant.user_id=queue_row.user_id and participant.membership_status='active'
        and active_session.status in ('forming','connecting','active','reconnecting','flagged')
    )
  order by queue_row.entered_at,queue_row.user_id
  limit 1
  for update of queue_row skip locked;

  if candidate is null then
    perform public.write_group_video_log(me,'eligibility_scan','{}',null,'no_eligible_candidate','{}');
    return jsonb_build_object('status','waiting');
  end if;

  insert into public.group_video_sessions(age_bracket,status,max_participants)
  values(my_age,'connecting',4)
  returning * into session_row;
  insert into public.group_video_session_participants(session_id,user_id)
  values(session_row.id,me),(session_row.id,candidate);
  update public.group_video_match_queue
  set status='matched',session_id=session_row.id,heartbeat_at=now(),updated_at=now()
  where user_id in (me,candidate);
  perform public.write_group_video_log(me,'session_created',array[candidate],session_row.id,'paired','{}');
  perform public.write_group_video_log(candidate,'session_created',array[me],session_row.id,'paired','{}');
  insert into public.group_video_session_events(session_id,event_type,metadata)
  values(session_row.id,'session_created',jsonb_build_object('participantCount',2));
  insert into public.notifications(user_id,actor_id,type,title,body,entity_id)
  values
    (me,candidate,'system','Group VYBE ready','Your secure group video match is ready.',session_row.id),
    (candidate,me,'system','Group VYBE ready','Your secure group video match is ready.',session_row.id);
  return jsonb_build_object('status','matched','sessionId',session_row.id);
end;
$$;

create or replace function public.join_group_video_queue(
  gender_value text default 'everyone',
  location_value text default 'anywhere',
  camera_value boolean default true,
  microphone_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform public.check_vybe_rate_limit('group_video_queue_join',45,3600);
  perform public.write_group_video_log(me,'queue_join_requested','{}',null,null,
    jsonb_build_object('genderPreference',gender_value,'locationFilter',location_value,'cameraEnabled',camera_value,'microphoneEnabled',microphone_value));
  perform public.save_video_match_preferences(gender_value,location_value,camera_value,microphone_value);
  if not public.video_user_can_participate(me) then
    insert into public.group_video_match_queue(user_id,status,updated_at)
    values(me,'restricted',now())
    on conflict(user_id) do update set status='restricted',session_id=null,updated_at=now();
    return jsonb_build_object('status','restricted','restrictionReason','Your account is not eligible for live video right now.');
  end if;
  insert into public.group_video_match_queue(user_id,status,session_id,entered_at,heartbeat_at,attempt_nonce,updated_at)
  values(me,'waiting',null,now(),now(),gen_random_uuid(),now())
  on conflict(user_id) do update set status='waiting',session_id=null,entered_at=now(),heartbeat_at=now(),attempt_nonce=gen_random_uuid(),updated_at=now();
  perform public.write_group_video_log(me,'queue_joined','{}',null,'waiting','{}');
  return public.try_assign_group_video_queue(me);
end;
$$;

create or replace function public.get_group_video_queue_status()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare me uuid:=auth.uid(); queue_row public.group_video_match_queue%rowtype; session_id_value uuid; result jsonb;
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform public.expire_stale_group_video_sessions();
  select participant.session_id into session_id_value
  from public.group_video_session_participants participant
  join public.group_video_sessions session on session.id=participant.session_id
  where participant.user_id=me and participant.membership_status='active'
    and session.status in ('forming','connecting','active','reconnecting','flagged')
  order by session.created_at desc limit 1;
  if session_id_value is not null then
    update public.group_video_match_queue set status='matched',session_id=session_id_value,heartbeat_at=now(),updated_at=now() where user_id=me;
    return jsonb_build_object('status','matched','sessionId',session_id_value);
  end if;
  select * into queue_row from public.group_video_match_queue where user_id=me;
  if not found then return jsonb_build_object('status','idle'); end if;
  if queue_row.status='waiting' then
    result:=public.try_assign_group_video_queue(me);
    return result;
  end if;
  return jsonb_build_object('status',queue_row.status,'sessionId',queue_row.session_id);
end;
$$;

create or replace function public.heartbeat_group_video_queue()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.group_video_match_queue set heartbeat_at=now(),updated_at=now()
  where user_id=auth.uid() and status in ('waiting','matched');
  update public.group_video_session_participants set last_heartbeat_at=now()
  where user_id=auth.uid() and membership_status='active';
  perform public.try_assign_group_video_queue(auth.uid());
end;
$$;

create or replace function public.leave_group_video_queue()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.group_video_match_queue set status='cancelled',session_id=null,updated_at=now()
  where user_id=auth.uid() and status='waiting';
  perform public.write_group_video_log(auth.uid(),'queue_left','{}',null,'user_cancelled','{}');
end;
$$;

create or replace function public.get_group_video_session_state(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare me uuid:=auth.uid(); session_row public.group_video_sessions%rowtype; participants jsonb;
begin
  if me is null or not public.current_user_in_group_video_session(target_session,me) then raise exception 'Group video session access required'; end if;
  select * into session_row from public.group_video_sessions where id=target_session;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',profile.id,
    'username',profile.username::text,
    'displayName',profile.display_name,
    'avatarPath',profile.avatar_url,
    'bannerPath',profile.banner_url,
    'bio',profile.bio,
    'status',profile.status,
    'interests',profile.interests,
    'ageBracket',profile.age_bracket,
    'compatibilityScore',case when profile.id=me then 100 else public.vybe_compatibility(profile.id) end,
    'locationLabel',case when profile.id=me then null else public.video_location_label(profile.id,me) end,
    'connected',participant.connected_at is not null and participant.disconnected_at is null,
    'cameraEnabled',participant.camera_enabled,
    'microphoneEnabled',participant.microphone_enabled,
    'connectionQuality',participant.connection_quality
  ) order by participant.joined_at),'[]'::jsonb) into participants
  from public.group_video_session_participants participant
  join public.profiles profile on profile.id=participant.user_id
  where participant.session_id=target_session and participant.membership_status='active';
  return jsonb_build_object(
    'id',session_row.id,'roomName',session_row.room_name,'status',session_row.status,
    'maxParticipants',session_row.max_participants,'createdAt',session_row.created_at,
    'connectedAt',session_row.connected_at,'endedAt',session_row.ended_at,
    'hiddenUntilReview',session_row.hidden_until_review,'participants',participants
  );
end;
$$;

create or replace function public.update_group_video_participant_state(
  target_session uuid,
  connected boolean default true,
  quality_value text default 'unknown',
  camera_value boolean default true,
  microphone_value boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare connected_count integer; member_count integer;
begin
  if not public.current_user_in_group_video_session(target_session,auth.uid()) then raise exception 'Group video session access required'; end if;
  if quality_value not in ('unknown','excellent','good','poor','lost') then quality_value:='unknown'; end if;
  update public.group_video_session_participants set
    connected_at=case when connected then coalesce(connected_at,now()) else connected_at end,
    disconnected_at=case when connected then null else now() end,
    last_heartbeat_at=now(),connection_quality=quality_value,
    camera_enabled=camera_value,microphone_enabled=microphone_value
  where session_id=target_session and user_id=auth.uid() and membership_status='active';
  select count(*),count(*) filter(where connected_at is not null and disconnected_at is null)
  into member_count,connected_count
  from public.group_video_session_participants where session_id=target_session and membership_status='active';
  update public.group_video_sessions set
    status=case when connected_count>=2 then 'active' when status='active' then 'reconnecting' else status end,
    connected_at=case when connected_count>=2 then coalesce(connected_at,now()) else connected_at end,
    last_activity_at=now()
  where id=target_session and status<>'ended';
end;
$$;

create or replace function public.log_group_video_session_event(target_session uuid,event_name text,event_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.current_user_in_group_video_session(target_session,auth.uid()) then raise exception 'Group video session access required'; end if;
  if event_name not in ('permission_granted','permission_denied','connected','reconnecting','reconnected','quality','camera_toggle','microphone_toggle','profile_view','friend_request','like','chat_open','moderation_sample','participant_joined','participant_left','ended') then raise exception 'Unsupported group video event'; end if;
  perform public.check_vybe_rate_limit('group_video_event',360,3600);
  insert into public.group_video_session_events(session_id,user_id,event_type,metadata)
  values(target_session,auth.uid(),event_name,coalesce(event_metadata,'{}'::jsonb));
  update public.group_video_sessions set last_activity_at=now() where id=target_session;
end;
$$;

create or replace function public.leave_group_video_session(target_session uuid,end_value text default 'leave')
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare remaining integer;
begin
  if not public.current_user_in_group_video_session(target_session,auth.uid()) then raise exception 'Group video session access required'; end if;
  if end_value not in ('leave','skip','disconnect','block','report','moderation') then end_value:='leave'; end if;
  if end_value='skip' then perform public.check_vybe_rate_limit('video_skip',20,3600); end if;
  update public.group_video_session_participants set membership_status='left',disconnected_at=coalesce(disconnected_at,now()),connection_quality='lost'
  where session_id=target_session and user_id=auth.uid();
  update public.group_video_match_queue set status='cancelled',session_id=null,updated_at=now() where user_id=auth.uid();
  select count(*) into remaining from public.group_video_session_participants
  where session_id=target_session and membership_status='active';
  if remaining<2 then
    update public.group_video_sessions set status='ended',ended_at=coalesce(ended_at,now()),ended_by=auth.uid(),end_reason=end_value,last_activity_at=now()
    where id=target_session and status<>'ended';
    update public.group_video_match_queue set status='cancelled',session_id=null,updated_at=now() where session_id=target_session;
  else
    update public.group_video_sessions set last_activity_at=now() where id=target_session;
  end if;
  insert into public.group_video_session_events(session_id,user_id,event_type,metadata)
  values(target_session,auth.uid(),'participant_left',jsonb_build_object('reason',end_value));
end;
$$;

create or replace function public.log_group_video_token_event(target_session uuid,token_event text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare peers uuid[];
begin
  if not public.current_user_in_group_video_session(target_session,auth.uid()) then raise exception 'Group video session access required'; end if;
  if token_event not in ('token_requested','token_issued') then raise exception 'Unsupported token event'; end if;
  select coalesce(array_agg(user_id),'{}'::uuid[]) into peers
  from public.group_video_session_participants where session_id=target_session and membership_status='active' and user_id<>auth.uid();
  perform public.write_group_video_log(auth.uid(),token_event,peers,target_session,null,'{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting validation for either one-to-one or group video.
-- ---------------------------------------------------------------------------
create or replace function public.submit_content_report(
  reported_user uuid,
  content_type text,
  content_id uuid,
  report_reason text,
  report_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare reporter uuid:=auth.uid(); report_id uuid;
begin
  if reporter is null then raise exception 'Authentication required'; end if;
  if reporter=reported_user then raise exception 'You cannot report yourself'; end if;
  if content_type not in ('profile','message','story','group','video_session','group_video_session') then raise exception 'Invalid report type'; end if;
  if content_type='profile' and (content_id<>reported_user or not exists(select 1 from public.profiles where id=reported_user)) then raise exception 'Profile access required'; end if;
  if content_type='message' and not exists(select 1 from public.messages where id=content_id and public.can_access_conversation(conversation_id,reporter)) then raise exception 'Message access required'; end if;
  if content_type='story' and not exists(select 1 from public.stories where id=content_id and public.can_view_story(id,reporter)) then raise exception 'Story access required'; end if;
  if content_type='group' and not public.can_access_conversation(content_id,reporter) then raise exception 'Group access required'; end if;
  if content_type='video_session' and not exists(select 1 from public.video_sessions where id=content_id and reporter in (user_a,user_b) and reported_user in (user_a,user_b)) then raise exception 'Video session access required'; end if;
  if content_type='group_video_session' and not (
    public.current_user_in_group_video_session(content_id,reporter)
    and exists(select 1 from public.group_video_session_participants where session_id=content_id and user_id=reported_user)
  ) then raise exception 'Group video session access required'; end if;
  perform public.check_vybe_rate_limit('report',30,86400);
  insert into public.moderation_reports(reporter_id,reported_id,reason,notes,target_type,target_id)
  values(reporter,reported_user,left(report_reason,120),left(coalesce(report_notes,''),1500),content_type,content_id)
  returning id into report_id;
  if content_type='group_video_session' then
    insert into public.group_video_moderation_events(session_id,subject_user_id,submitted_by,categories,severity,provider,summary)
    values(content_id,reported_user,reporter,array[report_reason],case when lower(report_reason) in ('sexual content','hate or threats') then 'high' else 'medium' end,'user_report',left(coalesce(report_notes,''),500));
    update public.group_video_sessions set moderation_state='flagged',last_activity_at=now() where id=content_id and moderation_state='clear';
  end if;
  return report_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants and private Realtime.
-- ---------------------------------------------------------------------------
alter table public.group_video_sessions enable row level security;
alter table public.group_video_session_participants enable row level security;
alter table public.group_video_match_queue enable row level security;
alter table public.group_video_session_events enable row level security;
alter table public.group_video_moderation_events enable row level security;
alter table public.group_video_matchmaking_logs enable row level security;

revoke all on public.group_video_sessions,public.group_video_session_participants,
  public.group_video_match_queue,public.group_video_session_events,
  public.group_video_moderation_events,public.group_video_matchmaking_logs
  from public,anon,authenticated;
grant select on public.group_video_sessions,public.group_video_session_participants,
  public.group_video_match_queue,public.group_video_session_events,
  public.group_video_moderation_events,public.group_video_matchmaking_logs
  to authenticated;

drop policy if exists group_video_sessions_member_or_admin on public.group_video_sessions;
drop policy if exists group_video_participants_member_or_admin on public.group_video_session_participants;
drop policy if exists group_video_queue_own on public.group_video_match_queue;
drop policy if exists group_video_events_member_or_admin on public.group_video_session_events;
drop policy if exists group_video_moderation_admin_only on public.group_video_moderation_events;
drop policy if exists group_video_logs_own_or_admin on public.group_video_matchmaking_logs;

create policy group_video_sessions_member_or_admin on public.group_video_sessions
  for select to authenticated using (public.current_user_in_group_video_session(id,auth.uid()) or public.is_vybe_admin(auth.uid()));
create policy group_video_participants_member_or_admin on public.group_video_session_participants
  for select to authenticated using (public.current_user_in_group_video_session(session_id,auth.uid()) or public.is_vybe_admin(auth.uid()));
create policy group_video_queue_own on public.group_video_match_queue
  for select to authenticated using (user_id=auth.uid());
create policy group_video_events_member_or_admin on public.group_video_session_events
  for select to authenticated using (public.current_user_in_group_video_session(session_id,auth.uid()) or public.is_vybe_admin(auth.uid()));
create policy group_video_moderation_admin_only on public.group_video_moderation_events
  for select to authenticated using (public.is_vybe_admin(auth.uid()));
create policy group_video_logs_own_or_admin on public.group_video_matchmaking_logs
  for select to authenticated using (user_id=auth.uid() or public.is_vybe_admin(auth.uid()));

revoke execute on function public.current_user_in_group_video_session(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.group_video_pair_eligible(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.group_video_user_fits_session(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.write_group_video_log(uuid,text,uuid[],uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.expire_stale_group_video_sessions() from public,anon,authenticated;
revoke execute on function public.try_assign_group_video_queue(uuid) from public,anon,authenticated;
revoke execute on function public.join_group_video_queue(text,text,boolean,boolean) from public,anon;
revoke execute on function public.get_group_video_queue_status() from public,anon;
revoke execute on function public.heartbeat_group_video_queue() from public,anon;
revoke execute on function public.leave_group_video_queue() from public,anon;
revoke execute on function public.get_group_video_session_state(uuid) from public,anon;
revoke execute on function public.update_group_video_participant_state(uuid,boolean,text,boolean,boolean) from public,anon;
revoke execute on function public.log_group_video_session_event(uuid,text,jsonb) from public,anon;
revoke execute on function public.leave_group_video_session(uuid,text) from public,anon;
revoke execute on function public.log_group_video_token_event(uuid,text) from public,anon;
revoke execute on function public.submit_content_report(uuid,text,uuid,text,text) from public,anon;

grant execute on function public.join_group_video_queue(text,text,boolean,boolean) to authenticated;
grant execute on function public.get_group_video_queue_status() to authenticated;
grant execute on function public.heartbeat_group_video_queue() to authenticated;
grant execute on function public.leave_group_video_queue() to authenticated;
grant execute on function public.get_group_video_session_state(uuid) to authenticated;
grant execute on function public.update_group_video_participant_state(uuid,boolean,text,boolean,boolean) to authenticated;
grant execute on function public.log_group_video_session_event(uuid,text,jsonb) to authenticated;
grant execute on function public.leave_group_video_session(uuid,text) to authenticated;
grant execute on function public.log_group_video_token_event(uuid,text) to authenticated;
grant execute on function public.submit_content_report(uuid,text,uuid,text,text) to authenticated;

-- Keep the existing typing and one-to-one video policies while adding private
-- group-video topics. Re-create the consolidated policies idempotently.
drop policy if exists vybe_realtime_read on realtime.messages;
drop policy if exists vybe_realtime_write on realtime.messages;
create policy vybe_realtime_read on realtime.messages for select to authenticated using (
  (realtime.topic() like 'typing:%' and public.can_access_conversation((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'video-session:%' and public.can_access_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'group-video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'group-video-session:%' and public.current_user_in_group_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
);
create policy vybe_realtime_write on realtime.messages for insert to authenticated with check (
  (realtime.topic() like 'typing:%' and public.can_access_conversation((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'video-session:%' and public.can_access_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
  or (realtime.topic() like 'group-video-queue:%' and split_part(realtime.topic(),':',2)=auth.uid()::text)
  or (realtime.topic() like 'group-video-session:%' and public.current_user_in_group_video_session((split_part(realtime.topic(),':',2))::uuid,auth.uid()))
);

do $$ begin
  begin alter publication supabase_realtime add table public.group_video_match_queue; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_video_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_video_session_participants; exception when duplicate_object then null; end;
end $$;

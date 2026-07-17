-- VYBE Phase 5 matchmaking root-cause hotfix.
--
-- Fixes two production issues without weakening age, gender, location, block,
-- restriction, self-match, or repeat-match protections:
--
-- 1. Repeat prevention previously treated every video_sessions row created in the
--    last 12 hours as a completed encounter. A room that never reached LiveKit
--    (or later expired with stale_timeout) therefore made the same two test users
--    ineligible even though they never saw one another.
-- 2. The previous deterministic integration test disabled repeat_prevention,
--    so it could not detect that production-only failure.
--
-- Repeat prevention now applies only after the database records that BOTH users
-- connected. Structured server-side matchmaking logs make queue joins, staged
-- eligibility filtering, session creation, queue exit, and matched delivery
-- inspectable without logging IPs, exact location, audio, video, or secrets.

-- ---------------------------------------------------------------------------
-- Structured matchmaking diagnostics.
-- ---------------------------------------------------------------------------
create table if not exists public.video_matchmaking_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  peer_user_id uuid references public.profiles(id) on delete set null,
  session_id uuid references public.video_sessions(id) on delete set null,
  event_type text not null check (event_type in (
    'queue_join_requested',
    'queue_joined',
    'queue_status_delivered',
    'eligibility_scan',
    'match_created',
    'queue_left',
    'restricted',
    'stale_session_closed',
    'token_requested',
    'token_issued'
  )),
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists video_matchmaking_logs_user_time_idx
  on public.video_matchmaking_logs(user_id, created_at desc);
create index if not exists video_matchmaking_logs_session_time_idx
  on public.video_matchmaking_logs(session_id, created_at desc)
  where session_id is not null;
create index if not exists video_matchmaking_logs_reason_time_idx
  on public.video_matchmaking_logs(reason_code, created_at desc)
  where reason_code is not null;

alter table public.video_matchmaking_logs enable row level security;

drop policy if exists video_matchmaking_logs_select_own_or_admin
  on public.video_matchmaking_logs;
create policy video_matchmaking_logs_select_own_or_admin
on public.video_matchmaking_logs for select to authenticated
using (user_id = auth.uid() or public.is_vybe_admin(auth.uid()));

revoke all on public.video_matchmaking_logs from public, anon, authenticated;
grant select on public.video_matchmaking_logs to authenticated;

create or replace function public.write_video_matchmaking_log(
  target_user uuid,
  event_name text,
  peer_user uuid default null,
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
    'queue_join_requested','queue_joined','queue_status_delivered',
    'eligibility_scan','match_created','queue_left','restricted',
    'stale_session_closed','token_requested','token_issued'
  ) then
    raise exception 'Unsupported matchmaking log event';
  end if;

  -- Polling can execute every 1.3 seconds. Keep diagnostics useful without
  -- turning normal waiting into an unbounded log stream.
  if event_name in ('eligibility_scan','queue_status_delivered') and exists (
    select 1 from public.video_matchmaking_logs recent_log
    where recent_log.user_id = target_user
      and recent_log.event_type = event_name
      and recent_log.reason_code is not distinct from nullif(reason_value, '')
      and recent_log.session_id is not distinct from target_session
      and recent_log.created_at > now() - interval '10 seconds'
  ) then
    return;
  end if;

  insert into public.video_matchmaking_logs(
    user_id, peer_user_id, session_id, event_type, reason_code, metadata
  ) values (
    target_user,
    peer_user,
    target_session,
    event_name,
    nullif(reason_value, ''),
    coalesce(event_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.write_video_matchmaking_log(uuid,text,uuid,uuid,text,jsonb)
  from public, anon, authenticated;


-- Token issuance is logged through a participant-scoped RPC. Browser clients
-- cannot write arbitrary matchmaking log rows.
create or replace function public.log_video_token_event(
  target_session uuid,
  token_event text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  session_row public.video_sessions%rowtype;
  peer_user uuid;
begin
  if auth.uid() is null or not public.can_access_video_session(target_session, auth.uid()) then
    raise exception 'Video session access required';
  end if;
  if token_event not in ('token_requested','token_issued') then
    raise exception 'Unsupported token event';
  end if;

  select * into session_row from public.video_sessions where id = target_session;
  peer_user := case when session_row.user_a = auth.uid() then session_row.user_b else session_row.user_a end;
  perform public.write_video_matchmaking_log(
    auth.uid(), token_event, peer_user, target_session, null,
    jsonb_build_object('roomName', session_row.room_name)
  );
end;
$$;

revoke execute on function public.log_video_token_event(uuid,text)
  from public, anon;
grant execute on function public.log_video_token_event(uuid,text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Repeat prevention applies only to a real two-sided connection.
-- video_sessions.connected_at is written only after both participant rows are
-- connected, so a failed token request, abandoned preview, or stale room does
-- not become a fake encounter.
-- ---------------------------------------------------------------------------
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
    coalesce((select repeat_prevention from public.user_settings where user_id = first_user), true)
    and coalesce((select repeat_prevention from public.user_settings where user_id = second_user), true)
    and exists (
      select 1
      from public.video_sessions recent
      where recent.user_a = least(first_user, second_user)
        and recent.user_b = greatest(first_user, second_user)
        and recent.connected_at is not null
        and recent.created_at > now() - interval '12 hours'
    );
$$;

revoke execute on function public.video_pair_repeat_blocked(uuid,uuid)
  from public, anon, authenticated;

-- A deterministic reason for each fresh waiting candidate. This is used by the
-- pairing query and by structured diagnostics, so production and tests exercise
-- exactly the same safety decision.
create or replace function public.video_pair_eligibility_reason(
  requester uuid,
  candidate uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  requester_pref public.video_match_preferences%rowtype;
  candidate_pref public.video_match_preferences%rowtype;
  requester_gender text;
  candidate_gender text;
begin
  if requester is null or candidate is null then return 'missing_user'; end if;
  if requester = candidate then return 'self_match'; end if;
  if not public.video_user_can_participate(requester) then return 'requester_restricted'; end if;
  if not public.video_user_can_participate(candidate) then return 'candidate_restricted'; end if;
  if not public.same_age_bracket(requester, candidate) then return 'age_bracket'; end if;
  if public.is_blocked_between(requester, candidate) then return 'blocked'; end if;

  select * into requester_pref
  from public.video_match_preferences
  where user_id = requester;
  if not found then return 'requester_preferences_missing'; end if;

  select * into candidate_pref
  from public.video_match_preferences
  where user_id = candidate;
  if not found then return 'candidate_preferences_missing'; end if;

  select video_gender into requester_gender from public.profiles where id = requester;
  select video_gender into candidate_gender from public.profiles where id = candidate;

  if not public.video_gender_allows(requester_pref.gender_preference, candidate_gender) then
    return 'requester_gender_preference';
  end if;
  if not public.video_gender_allows(candidate_pref.gender_preference, requester_gender) then
    return 'candidate_gender_preference';
  end if;
  if not public.video_location_allows(requester, candidate, requester_pref.location_filter) then
    return 'requester_location_preference';
  end if;
  if not public.video_location_allows(candidate, requester, candidate_pref.location_filter) then
    return 'candidate_location_preference';
  end if;
  if exists (
    select 1 from public.video_sessions active_session
    where active_session.status in ('connecting','active','reconnecting','flagged')
      and candidate in (active_session.user_a, active_session.user_b)
  ) then
    return 'candidate_active_session';
  end if;
  if public.video_pair_repeat_blocked(requester, candidate) then
    return 'recent_connected_repeat';
  end if;
  return 'eligible';
end;
$$;

revoke execute on function public.video_pair_eligibility_reason(uuid,uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stale cleanup with auditable queue/session exits.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_video_sessions()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  stale_row record;
begin
  for stale_row in
    select s.id, s.user_a, s.user_b
    from public.video_sessions s
    where s.status in ('connecting','active','reconnecting','flagged')
      and (
        (
          s.status = 'connecting'
          and s.created_at < now() - interval '75 seconds'
          and s.connected_at is null
        )
        or not exists (
          select 1
          from public.video_session_participants p
          where p.session_id = s.id
            and p.last_heartbeat_at > now() - interval '90 seconds'
        )
      )
    for update of s skip locked
  loop
    update public.video_sessions
    set status = 'ended',
        ended_at = coalesce(ended_at, now()),
        end_reason = 'stale_timeout',
        last_activity_at = now()
    where id = stale_row.id
      and status <> 'ended';

    update public.video_session_participants
    set disconnected_at = coalesce(disconnected_at, now()),
        connection_quality = 'lost'
    where session_id = stale_row.id;

    update public.video_match_queue
    set status = 'cancelled',
        session_id = null,
        updated_at = now()
    where session_id = stale_row.id;

    perform public.write_video_matchmaking_log(
      stale_row.user_a, 'stale_session_closed', stale_row.user_b,
      stale_row.id, 'stale_timeout', '{}'::jsonb
    );
    perform public.write_video_matchmaking_log(
      stale_row.user_b, 'stale_session_closed', stale_row.user_a,
      stale_row.id, 'stale_timeout', '{}'::jsonb
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Serialized, idempotent pairing using the corrected eligibility rule.
-- ---------------------------------------------------------------------------
create or replace function public.try_pair_video_queue(requesting_user uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
  candidate uuid;
  candidate_pref public.video_match_preferences%rowtype;
  my_pref public.video_match_preferences%rowtype;
  my_queue public.video_match_queue%rowtype;
  session_row public.video_sessions%rowtype;
  reason_counts jsonb := '{}'::jsonb;
  waiting_count integer := 0;
begin
  if me is null or requesting_user is distinct from me then
    raise exception 'Authentication required';
  end if;

  -- Keep the pairing critical section short and deterministic. The lock does not
  -- serialize camera startup, polling, Realtime, or LiveKit connection work.
  perform pg_advisory_xact_lock(hashtextextended('vybe:video-matchmaking:v3', 0));
  perform public.expire_stale_video_sessions();

  select * into session_row
  from public.video_sessions s
  where me in (s.user_a, s.user_b)
    and s.status in ('connecting','active','reconnecting','flagged')
  order by s.created_at desc
  limit 1;

  if found then
    update public.video_match_queue
    set status = 'matched',
        session_id = session_row.id,
        heartbeat_at = now(),
        updated_at = now()
    where user_id = me;

    perform public.write_video_matchmaking_log(
      me, 'queue_status_delivered',
      case when session_row.user_a = me then session_row.user_b else session_row.user_a end,
      session_row.id, 'existing_active_session', '{}'::jsonb
    );
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select * into my_queue
  from public.video_match_queue q
  where q.user_id = me
  for update;

  if not found then
    return jsonb_build_object('status','idle');
  end if;
  if my_queue.status <> 'waiting' then
    return jsonb_build_object('status',my_queue.status,'sessionId',my_queue.session_id);
  end if;
  if my_queue.heartbeat_at < now() - interval '45 seconds' then
    update public.video_match_queue
    set status = 'cancelled', session_id = null, updated_at = now()
    where user_id = me;
    perform public.write_video_matchmaking_log(
      me, 'queue_left', null, null, 'stale_queue', '{}'::jsonb
    );
    return jsonb_build_object('status','cancelled');
  end if;
  if not public.video_user_can_participate(me) then
    update public.video_match_queue
    set status = 'restricted', session_id = null, updated_at = now()
    where user_id = me;
    perform public.write_video_matchmaking_log(
      me, 'restricted', null, null, 'account_not_eligible', '{}'::jsonb
    );
    return jsonb_build_object('status','restricted');
  end if;

  select * into my_pref
  from public.video_match_preferences
  where user_id = me;
  if not found then
    perform public.write_video_matchmaking_log(
      me, 'eligibility_scan', null, null, 'requester_preferences_missing', '{}'::jsonb
    );
    return jsonb_build_object('status','waiting');
  end if;

  update public.video_match_queue
  set status = 'cancelled', session_id = null, updated_at = now()
  where status = 'waiting'
    and heartbeat_at < now() - interval '45 seconds';

  select count(*) into waiting_count
  from public.video_match_queue q
  where q.status = 'waiting'
    and q.user_id <> me
    and q.heartbeat_at > now() - interval '35 seconds';

  select coalesce(jsonb_object_agg(reason_code, reason_total), '{}'::jsonb)
    into reason_counts
  from (
    select public.video_pair_eligibility_reason(me, q.user_id) as reason_code,
           count(*) as reason_total
    from public.video_match_queue q
    where q.status = 'waiting'
      and q.user_id <> me
      and q.heartbeat_at > now() - interval '35 seconds'
    group by public.video_pair_eligibility_reason(me, q.user_id)
  ) reason_summary;

  select q.user_id into candidate
  from public.video_match_queue q
  where q.status = 'waiting'
    and q.user_id <> me
    and q.heartbeat_at > now() - interval '35 seconds'
    and public.video_pair_eligibility_reason(me, q.user_id) = 'eligible'
  order by q.entered_at asc, q.user_id
  for update of q skip locked
  limit 1;

  if candidate is null then
    perform public.write_video_matchmaking_log(
      me,
      'eligibility_scan',
      null,
      null,
      case when waiting_count = 0 then 'no_waiting_candidates' else 'no_eligible_candidate' end,
      jsonb_build_object('freshWaitingCandidates', waiting_count, 'reasonCounts', reason_counts)
    );
    return jsonb_build_object(
      'status','waiting',
      'diagnostic',case when waiting_count = 0 then 'no_waiting_candidates' else 'no_eligible_candidate' end,
      'eligibilitySummary',reason_counts
    );
  end if;

  select * into candidate_pref
  from public.video_match_preferences
  where user_id = candidate;

  insert into public.video_sessions(user_a,user_b,room_name,status)
  values(
    least(me,candidate),
    greatest(me,candidate),
    'vybe_' || replace(gen_random_uuid()::text,'-',''),
    'connecting'
  )
  returning * into session_row;

  insert into public.video_session_participants(
    session_id,user_id,camera_enabled,microphone_enabled
  ) values
    (session_row.id,me,my_pref.camera_enabled,my_pref.microphone_enabled),
    (session_row.id,candidate,candidate_pref.camera_enabled,candidate_pref.microphone_enabled);

  update public.video_match_queue
  set status = 'matched',
      session_id = session_row.id,
      heartbeat_at = now(),
      updated_at = now()
  where user_id in (me,candidate)
    and status = 'waiting';

  insert into public.video_session_events(session_id,user_id,event_type,metadata)
  values
    (session_row.id,me,'matched',jsonb_build_object('source','queue_hotfix_v3')),
    (session_row.id,candidate,'matched',jsonb_build_object('source','queue_hotfix_v3'));

  perform public.write_video_matchmaking_log(
    me, 'match_created', candidate, session_row.id, 'eligible',
    jsonb_build_object('roomName', session_row.room_name)
  );
  perform public.write_video_matchmaking_log(
    candidate, 'match_created', me, session_row.id, 'eligible',
    jsonb_build_object('roomName', session_row.room_name)
  );
  perform public.write_video_matchmaking_log(
    me, 'queue_left', candidate, session_row.id, 'matched', '{}'::jsonb
  );
  perform public.write_video_matchmaking_log(
    candidate, 'queue_left', me, session_row.id, 'matched', '{}'::jsonb
  );

  insert into public.notifications(user_id,actor_id,type,title,body,entity_id)
  values
    (candidate,me,'system','Video VYBE ready','Your secure one-on-one video match is ready.',session_row.id),
    (me,candidate,'system','Video VYBE ready','Your secure one-on-one video match is ready.',session_row.id);

  return jsonb_build_object('status','matched','sessionId',session_row.id);
end;
$$;

create or replace function public.join_video_queue(
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
declare
  me uuid := auth.uid();
  session_row public.video_sessions%rowtype;
  retry_seconds integer;
begin
  if me is null then raise exception 'Authentication required'; end if;

  perform public.check_vybe_rate_limit('video_queue_join', 45, 3600);
  perform public.write_video_matchmaking_log(
    me, 'queue_join_requested', null, null, null,
    jsonb_build_object(
      'genderPreference', gender_value,
      'locationFilter', location_value,
      'cameraEnabled', camera_value,
      'microphoneEnabled', microphone_value
    )
  );
  perform public.expire_stale_video_sessions();
  perform public.save_video_match_preferences(
    gender_value, location_value, camera_value, microphone_value
  );

  if not public.video_user_can_participate(me) then
    select greatest(0, extract(epoch from (restricted_until-now()))::integer)
      into retry_seconds
    from public.video_restrictions
    where user_id = me and restricted_until > now();

    perform public.write_video_matchmaking_log(
      me, 'restricted', null, null, 'account_not_eligible',
      jsonb_build_object('retryAfterSeconds', coalesce(retry_seconds,0))
    );
    return jsonb_build_object(
      'status','restricted',
      'retryAfterSeconds',coalesce(retry_seconds,0),
      'restrictionReason',coalesce(
        (select reason from public.video_restrictions where user_id = me),
        'Complete your video profile or contact Safety Center.'
      )
    );
  end if;

  select * into session_row
  from public.video_sessions s
  where me in (s.user_a,s.user_b)
    and s.status in ('connecting','active','reconnecting','flagged')
  order by s.created_at desc
  limit 1;

  if found then
    update public.video_match_queue
    set status = 'matched', session_id = session_row.id,
        heartbeat_at = now(), updated_at = now()
    where user_id = me;
    perform public.write_video_matchmaking_log(
      me, 'queue_status_delivered',
      case when session_row.user_a = me then session_row.user_b else session_row.user_a end,
      session_row.id, 'existing_active_session', '{}'::jsonb
    );
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  update public.video_match_queue
  set status = 'cancelled', session_id = null, updated_at = now()
  where status = 'waiting'
    and heartbeat_at < now() - interval '45 seconds';

  insert into public.video_match_queue(
    user_id,status,session_id,entered_at,heartbeat_at,attempt_nonce,updated_at
  ) values (
    me,'waiting',null,now(),now(),gen_random_uuid(),now()
  )
  on conflict(user_id) do update set
    status = 'waiting',
    session_id = null,
    entered_at = now(),
    heartbeat_at = now(),
    attempt_nonce = gen_random_uuid(),
    updated_at = now();

  perform public.write_video_matchmaking_log(
    me, 'queue_joined', null, null, 'waiting', '{}'::jsonb
  );
  return public.try_pair_video_queue(me);
end;
$$;

create or replace function public.get_video_queue_status()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  me uuid := auth.uid();
  session_row public.video_sessions%rowtype;
  queue_row public.video_match_queue%rowtype;
  pairing_result jsonb;
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform public.expire_stale_video_sessions();

  select * into session_row
  from public.video_sessions s
  where me in (s.user_a,s.user_b)
    and s.status in ('connecting','active','reconnecting','flagged')
  order by s.created_at desc
  limit 1;

  if found then
    update public.video_match_queue
    set status = 'matched', session_id = session_row.id,
        heartbeat_at = now(), updated_at = now()
    where user_id = me;
    perform public.write_video_matchmaking_log(
      me, 'queue_status_delivered',
      case when session_row.user_a = me then session_row.user_b else session_row.user_a end,
      session_row.id, 'matched', '{}'::jsonb
    );
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select * into queue_row
  from public.video_match_queue
  where user_id = me;

  if not found then return jsonb_build_object('status','idle'); end if;

  if queue_row.status = 'waiting' then
    if queue_row.heartbeat_at < now() - interval '45 seconds' then
      update public.video_match_queue
      set status = 'cancelled', session_id = null, updated_at = now()
      where user_id = me;
      perform public.write_video_matchmaking_log(
        me, 'queue_left', null, null, 'stale_queue', '{}'::jsonb
      );
      return jsonb_build_object('status','cancelled');
    end if;

    pairing_result := public.try_pair_video_queue(me);
    return pairing_result;
  end if;

  if queue_row.status = 'matched' and not exists (
    select 1 from public.video_sessions s
    where s.id = queue_row.session_id
      and s.status in ('connecting','active','reconnecting','flagged')
  ) then
    update public.video_match_queue
    set status = 'cancelled', session_id = null, updated_at = now()
    where user_id = me;
    perform public.write_video_matchmaking_log(
      me, 'queue_left', null, queue_row.session_id, 'session_unavailable', '{}'::jsonb
    );
    return jsonb_build_object('status','cancelled');
  end if;

  return jsonb_build_object('status',queue_row.status,'sessionId',queue_row.session_id);
end;
$$;

create or replace function public.heartbeat_video_queue()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  update public.video_match_queue
  set heartbeat_at = now(), updated_at = now()
  where user_id = auth.uid()
    and status in ('waiting','matched');

  update public.video_session_participants
  set last_heartbeat_at = now()
  where user_id = auth.uid()
    and exists (
      select 1 from public.video_sessions s
      where s.id = session_id
        and s.status in ('connecting','active','reconnecting','flagged')
    );

  perform public.try_pair_video_queue(auth.uid());
end;
$$;

create or replace function public.leave_video_queue()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  previous_status text;
  previous_session uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select status, session_id into previous_status, previous_session
  from public.video_match_queue
  where user_id = auth.uid();

  update public.video_match_queue
  set status = 'cancelled', session_id = null, updated_at = now()
  where user_id = auth.uid()
    and status = 'waiting';

  if previous_status = 'waiting' then
    perform public.write_video_matchmaking_log(
      auth.uid(), 'queue_left', null, previous_session, 'user_cancelled', '{}'::jsonb
    );
  end if;
end;
$$;

-- User-visible diagnostics for their own queue only. This is useful in local
-- two-browser testing and support, while RLS/admin boundaries remain intact.
create or replace function public.get_video_matchmaking_diagnostics()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'queue', coalesce((
      select jsonb_build_object(
        'status', q.status,
        'sessionId', q.session_id,
        'enteredAt', q.entered_at,
        'heartbeatAt', q.heartbeat_at,
        'updatedAt', q.updated_at
      )
      from public.video_match_queue q
      where q.user_id = auth.uid()
    ), jsonb_build_object('status','idle')),
    'recentLogs', coalesce((
      select jsonb_agg(log_row order by log_row.created_at desc)
      from (
        select event_type, reason_code, peer_user_id, session_id, metadata, created_at
        from public.video_matchmaking_logs
        where user_id = auth.uid()
        order by created_at desc
        limit 25
      ) log_row
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.try_pair_video_queue(uuid) from public,anon,authenticated;
revoke execute on function public.join_video_queue(text,text,boolean,boolean) from public,anon;
revoke execute on function public.get_video_queue_status() from public,anon;
revoke execute on function public.heartbeat_video_queue() from public,anon;
revoke execute on function public.leave_video_queue() from public,anon;
revoke execute on function public.get_video_matchmaking_diagnostics() from public,anon;

grant execute on function public.join_video_queue(text,text,boolean,boolean) to authenticated;
grant execute on function public.get_video_queue_status() to authenticated;
grant execute on function public.heartbeat_video_queue() to authenticated;
grant execute on function public.leave_video_queue() to authenticated;
grant execute on function public.get_video_matchmaking_diagnostics() to authenticated;

-- Re-assert Realtime publication membership for every database upgraded from an
-- earlier Phase 5 snapshot. Duplicate membership is intentionally ignored.
do $$
begin
  begin
    alter publication supabase_realtime add table public.video_match_queue;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.video_sessions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.video_session_participants;
  exception when duplicate_object then null;
  end;
end;
$$;

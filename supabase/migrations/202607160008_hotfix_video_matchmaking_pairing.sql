-- VYBE Phase 5 hotfix: deterministic two-user queue pairing, realtime-safe
-- session pickup, and stale pre-connection cleanup.
--
-- Root cause: two nearly simultaneous join_video_queue transactions could each
-- insert a waiting row before the other transaction committed. Each transaction
-- then saw no eligible candidate and both users remained waiting forever because
-- get_video_queue_status only observed state; it never retried pairing.
--
-- This migration keeps every Phase 5 eligibility rule in place and fixes the race
-- by serializing only the short database pairing section with a transaction-scoped
-- advisory lock. Queue status and heartbeat calls also retry the idempotent pairing
-- helper, so Realtime delays or a lost initial response cannot strand two users.

create or replace function public.expire_stale_video_sessions()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  stale_ids uuid[];
begin
  select coalesce(array_agg(s.id), '{}'::uuid[])
    into stale_ids
  from public.video_sessions s
  where s.status in ('connecting','active','reconnecting','flagged')
    and (
      -- A room that never connected either participant must not block the next
      -- two-browser test (or a real user retry) indefinitely.
      (
        s.status = 'connecting'
        and s.created_at < now() - interval '75 seconds'
        and not exists (
          select 1
          from public.video_session_participants p
          where p.session_id = s.id
            and p.connected_at is not null
            and p.disconnected_at is null
        )
      )
      or
      -- Preserve the existing heartbeat-based stale cleanup.
      not exists (
        select 1
        from public.video_session_participants p
        where p.session_id = s.id
          and p.last_heartbeat_at > now() - interval '90 seconds'
      )
    );

  if coalesce(array_length(stale_ids, 1), 0) = 0 then
    return;
  end if;

  update public.video_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      end_reason = 'stale_timeout',
      last_activity_at = now()
  where id = any(stale_ids)
    and status <> 'ended';

  update public.video_session_participants
  set disconnected_at = coalesce(disconnected_at, now()),
      connection_quality = 'lost'
  where session_id = any(stale_ids);

  update public.video_match_queue
  set status = 'cancelled',
      session_id = null,
      updated_at = now()
  where session_id = any(stale_ids);
end;
$$;

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
  my_gender text;
  my_queue public.video_match_queue%rowtype;
  session_row public.video_sessions%rowtype;
begin
  if me is null or requesting_user is distinct from me then
    raise exception 'Authentication required';
  end if;

  -- Serialize only the short pairing transaction. This guarantees that when two
  -- users enter at nearly the same time, the second transaction observes the first
  -- committed waiting row instead of leaving both users stranded.
  perform pg_advisory_xact_lock(hashtextextended('vybe:video-matchmaking:v2', 0));

  perform public.expire_stale_video_sessions();

  -- Idempotently reuse the caller's already-active session.
  select *
    into session_row
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

    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select *
    into my_queue
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
    set status = 'cancelled',
        session_id = null,
        updated_at = now()
    where user_id = me;
    return jsonb_build_object('status','cancelled');
  end if;

  if not public.video_user_can_participate(me) then
    update public.video_match_queue
    set status = 'restricted',
        session_id = null,
        updated_at = now()
    where user_id = me;
    return jsonb_build_object('status','restricted');
  end if;

  select * into my_pref
  from public.video_match_preferences
  where user_id = me;

  if not found then
    return jsonb_build_object('status','waiting');
  end if;

  select p.video_gender
    into my_gender
  from public.profiles p
  where p.id = me;

  -- Cancel only truly stale waiters. Fresh rows remain eligible.
  update public.video_match_queue
  set status = 'cancelled',
      session_id = null,
      updated_at = now()
  where status = 'waiting'
    and heartbeat_at < now() - interval '45 seconds';

  select q.user_id
    into candidate
  from public.video_match_queue q
  join public.video_match_preferences vp on vp.user_id = q.user_id
  join public.profiles p on p.id = q.user_id
  where q.status = 'waiting'
    and q.user_id <> me
    and q.heartbeat_at > now() - interval '35 seconds'
    and public.video_pair_eligible(me, q.user_id)
    and public.video_gender_allows(my_pref.gender_preference, p.video_gender)
    and public.video_gender_allows(vp.gender_preference, my_gender)
    and public.video_location_allows(me, q.user_id, my_pref.location_filter)
    and public.video_location_allows(q.user_id, me, vp.location_filter)
    -- A stale/misaligned queue row must not select somebody who already has a call.
    and not exists (
      select 1
      from public.video_sessions active_session
      where active_session.status in ('connecting','active','reconnecting','flagged')
        and q.user_id in (active_session.user_a, active_session.user_b)
    )
    and not exists (
      select 1
      from public.video_sessions recent
      where recent.user_a = least(me, q.user_id)
        and recent.user_b = greatest(me, q.user_id)
        and recent.created_at > now() - interval '12 hours'
        and coalesce((select repeat_prevention from public.user_settings where user_id = me), true)
        and coalesce((select repeat_prevention from public.user_settings where user_id = q.user_id), true)
    )
  order by q.entered_at asc, q.user_id
  for update of q skip locked
  limit 1;

  if candidate is null then
    return jsonb_build_object('status','waiting');
  end if;

  select *
    into candidate_pref
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
  )
  values
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
    (session_row.id,me,'matched',jsonb_build_object('source','queue_hotfix_v2')),
    (session_row.id,candidate,'matched',jsonb_build_object('source','queue_hotfix_v2'));

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
  if me is null then
    raise exception 'Authentication required';
  end if;

  perform public.check_vybe_rate_limit('video_queue_join', 45, 3600);
  perform public.expire_stale_video_sessions();
  perform public.save_video_match_preferences(
    gender_value,
    location_value,
    camera_value,
    microphone_value
  );

  if not public.video_user_can_participate(me) then
    select greatest(0, extract(epoch from (restricted_until-now()))::integer)
      into retry_seconds
    from public.video_restrictions
    where user_id = me
      and restricted_until > now();

    return jsonb_build_object(
      'status','restricted',
      'retryAfterSeconds',coalesce(retry_seconds,0),
      'restrictionReason',coalesce(
        (select reason from public.video_restrictions where user_id = me),
        'Complete your video profile or contact Safety Center.'
      )
    );
  end if;

  -- Active calls are idempotent: rejoining never creates a second room.
  select *
    into session_row
  from public.video_sessions s
  where me in (s.user_a,s.user_b)
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
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  update public.video_match_queue
  set status = 'cancelled',
      session_id = null,
      updated_at = now()
  where status = 'waiting'
    and heartbeat_at < now() - interval '45 seconds';

  insert into public.video_match_queue(
    user_id,status,session_id,entered_at,heartbeat_at,attempt_nonce,updated_at
  )
  values(me,'waiting',null,now(),now(),gen_random_uuid(),now())
  on conflict(user_id) do update set
    status = 'waiting',
    session_id = null,
    entered_at = now(),
    heartbeat_at = now(),
    attempt_nonce = gen_random_uuid(),
    updated_at = now();

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
  if me is null then
    raise exception 'Authentication required';
  end if;

  perform public.expire_stale_video_sessions();

  select *
    into session_row
  from public.video_sessions s
  where me in (s.user_a,s.user_b)
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
    return jsonb_build_object('status','matched','sessionId',session_row.id);
  end if;

  select *
    into queue_row
  from public.video_match_queue
  where user_id = me;

  if not found then
    return jsonb_build_object('status','idle');
  end if;

  if queue_row.status = 'waiting' then
    if queue_row.heartbeat_at < now() - interval '45 seconds' then
      update public.video_match_queue
      set status = 'cancelled',
          session_id = null,
          updated_at = now()
      where user_id = me;
      return jsonb_build_object('status','cancelled');
    end if;

    -- Polling is now an idempotent pairing retry. This covers delayed Realtime,
    -- tab wakeups and databases that installed Phase 5 before this hotfix.
    pairing_result := public.try_pair_video_queue(me);
    if pairing_result->>'status' = 'matched' then
      return pairing_result;
    end if;
  end if;

  if queue_row.status = 'matched' and not exists (
    select 1
    from public.video_sessions s
    where s.id = queue_row.session_id
      and s.status in ('connecting','active','reconnecting','flagged')
  ) then
    update public.video_match_queue
    set status = 'cancelled',
        session_id = null,
        updated_at = now()
    where user_id = me;
    return jsonb_build_object('status','cancelled');
  end if;

  select *
    into queue_row
  from public.video_match_queue
  where user_id = me;

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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.video_match_queue
  set heartbeat_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and status in ('waiting','matched');

  update public.video_session_participants
  set last_heartbeat_at = now()
  where user_id = auth.uid()
    and exists (
      select 1
      from public.video_sessions s
      where s.id = session_id
        and s.status in ('connecting','active','reconnecting','flagged')
    );

  -- Safe no-op when no eligible peer exists; deterministic pair when one does.
  perform public.try_pair_video_queue(auth.uid());
end;
$$;

revoke execute on function public.try_pair_video_queue(uuid) from public,anon,authenticated;
revoke execute on function public.join_video_queue(text,text,boolean,boolean) from public,anon;
revoke execute on function public.get_video_queue_status() from public,anon;
revoke execute on function public.heartbeat_video_queue() from public,anon;

grant execute on function public.join_video_queue(text,text,boolean,boolean) to authenticated;
grant execute on function public.get_video_queue_status() to authenticated;
grant execute on function public.heartbeat_video_queue() to authenticated;

-- Re-assert publication membership for databases upgraded from an early Phase 5
-- snapshot. Duplicate membership is intentionally ignored.
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
end;
$$;

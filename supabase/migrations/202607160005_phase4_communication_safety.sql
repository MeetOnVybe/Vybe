-- VYBE Phase 4: voice messages, stories, group conversations, richer profiles,
-- privacy controls, moderation workflows, and admin-only review tools.
-- Existing direct friend/match conversations remain in the same tables.

-- ---------------------------------------------------------------------------
-- Profile customization and privacy preferences
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists favorite_music text not null default '',
  add column if not exists favorite_games text[] not null default '{}',
  add column if not exists favorite_hobbies text[] not null default '{}',
  add column if not exists school_grade text not null default '',
  add column if not exists pronouns text not null default '',
  add column if not exists favorite_sports text[] not null default '{}',
  add column if not exists accent_color text not null default '#1686ff',
  add column if not exists profile_badges text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_favorite_games_limit;
alter table public.profiles add constraint profiles_favorite_games_limit check (cardinality(favorite_games) <= 8);
alter table public.profiles drop constraint if exists profiles_favorite_hobbies_limit;
alter table public.profiles add constraint profiles_favorite_hobbies_limit check (cardinality(favorite_hobbies) <= 8);
alter table public.profiles drop constraint if exists profiles_favorite_sports_limit;
alter table public.profiles add constraint profiles_favorite_sports_limit check (cardinality(favorite_sports) <= 8);
alter table public.profiles drop constraint if exists profiles_pronouns_length;
alter table public.profiles add constraint profiles_pronouns_length check (char_length(pronouns) <= 32);
alter table public.profiles drop constraint if exists profiles_school_grade_length;
alter table public.profiles add constraint profiles_school_grade_length check (char_length(school_grade) <= 32);
alter table public.profiles drop constraint if exists profiles_accent_color_format;
alter table public.profiles add constraint profiles_accent_color_format check (accent_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.user_settings drop constraint if exists user_settings_profile_visibility_check;
update public.user_settings set profile_visibility = case profile_visibility when 'discovery' then 'everyone' when 'connections' then 'friends' else profile_visibility end;
alter table public.user_settings
  alter column profile_visibility set default 'everyone',
  add column if not exists message_privacy text not null default 'friends',
  add column if not exists story_privacy text not null default 'friends',
  add column if not exists online_status_privacy text not null default 'friends',
  add column if not exists profile_likes_enabled boolean not null default false,
  add column if not exists haptics_enabled boolean not null default true;
alter table public.user_settings add constraint user_settings_profile_visibility_check check (profile_visibility in ('everyone','friends','matches','nobody'));
alter table public.user_settings drop constraint if exists user_settings_message_privacy_check;
alter table public.user_settings add constraint user_settings_message_privacy_check check (message_privacy in ('everyone','friends','matches','nobody'));
alter table public.user_settings drop constraint if exists user_settings_story_privacy_check;
alter table public.user_settings add constraint user_settings_story_privacy_check check (story_privacy in ('everyone','friends','matches','nobody'));
alter table public.user_settings drop constraint if exists user_settings_online_status_privacy_check;
alter table public.user_settings add constraint user_settings_online_status_privacy_check check (online_status_privacy in ('everyone','friends','matches','nobody'));

-- ---------------------------------------------------------------------------
-- Generalize the existing conversation/message system for groups and media.
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists conversation_type text not null default 'direct',
  add column if not exists title text,
  add column if not exists icon_path text,
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
alter table public.conversations alter column user_a drop not null;
alter table public.conversations alter column user_b drop not null;
alter table public.conversations drop constraint if exists conversations_sorted;
alter table public.conversations drop constraint if exists conversations_not_self;
alter table public.conversations drop constraint if exists conversations_type_shape;
alter table public.conversations add constraint conversations_type_shape check (
  (conversation_type = 'direct' and user_a is not null and user_b is not null and user_a < user_b)
  or (conversation_type = 'group' and user_a is null and user_b is null and owner_id is not null and char_length(trim(title)) between 1 and 60)
);
alter table public.conversations drop constraint if exists conversations_conversation_type_check;
alter table public.conversations add constraint conversations_conversation_type_check check (conversation_type in ('direct','group'));

alter table public.conversation_participants
  add column if not exists role text not null default 'member',
  add column if not exists membership_status text not null default 'active',
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists muted_until timestamptz;
alter table public.conversation_participants drop constraint if exists conversation_participants_role_check;
alter table public.conversation_participants add constraint conversation_participants_role_check check (role in ('owner','member'));
alter table public.conversation_participants drop constraint if exists conversation_participants_membership_status_check;
alter table public.conversation_participants add constraint conversation_participants_membership_status_check check (membership_status in ('invited','active','left','removed'));

alter table public.messages
  alter column receiver_id drop not null,
  alter column body set default '',
  add column if not exists message_type text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_duration_seconds numeric(8,2),
  add column if not exists waveform jsonb not null default '[]'::jsonb,
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists forwarded_from_id uuid references public.messages(id) on delete set null,
  add column if not exists story_id uuid,
  add column if not exists moderation_state text not null default 'approved',
  add column if not exists deleted_for_everyone_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.messages drop constraint if exists messages_not_self;
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('text','voice','image','system'));
alter table public.messages drop constraint if exists messages_moderation_state_check;
alter table public.messages add constraint messages_moderation_state_check check (moderation_state in ('approved','flagged','hidden','removed'));
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (message_type in ('text','system') and char_length(trim(body)) between 1 and 2000)
  or (message_type in ('voice','image') and media_path is not null)
);

create table if not exists public.message_hidden_users (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Stories and profile likes
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('photo','video','text')),
  media_path text,
  body text not null default '',
  background_color text not null default '#0878f9',
  moderation_state text not null default 'approved' check (moderation_state in ('approved','flagged','hidden','removed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  constraint stories_content_check check (
    (media_type = 'text' and char_length(trim(body)) between 1 and 500)
    or (media_type in ('photo','video') and media_path is not null)
  ),
  constraint stories_expiry_check check (expires_at <= created_at + interval '24 hours 5 minutes')
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id),
  constraint story_reaction_emoji_length check (char_length(emoji) between 1 and 16)
);

create table if not exists public.profile_likes (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_id, target_id),
  constraint profile_likes_not_self check (actor_id <> target_id)
);

-- ---------------------------------------------------------------------------
-- Moderation, enforcement, admin access, and appeals
-- ---------------------------------------------------------------------------
create table if not exists public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator','admin','super_admin')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.account_enforcement (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','warned','suspended','banned')),
  reason text not null default '',
  suspended_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('message','story','profile','report')),
  source_id uuid not null,
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  categories text[] not null default '{}',
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','reviewing','actioned','dismissed','appealed')),
  hidden boolean not null default false,
  summary text not null default '',
  provider text not null default 'rules',
  provider_reference text,
  raw_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('warn','suspend','ban','delete_message','delete_story','dismiss','restore','appeal_approve','appeal_deny')),
  target_user_id uuid references public.profiles(id) on delete set null,
  flag_id uuid references public.moderation_flags(id) on delete set null,
  source_type text,
  source_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  enforcement_status text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text not null default '',
  created_at timestamptz not null default now(),
  constraint moderation_appeals_reason_length check (char_length(reason) between 10 and 1500)
);

alter table public.moderation_reports
  add column if not exists target_type text not null default 'profile',
  add column if not exists target_id uuid,
  add column if not exists status text not null default 'pending';
alter table public.moderation_reports drop constraint if exists moderation_reports_target_type_check;
alter table public.moderation_reports add constraint moderation_reports_target_type_check check (target_type in ('profile','message','story','group'));
alter table public.moderation_reports drop constraint if exists moderation_reports_status_check;
alter table public.moderation_reports add constraint moderation_reports_status_check check (status in ('pending','reviewing','actioned','dismissed'));

-- ---------------------------------------------------------------------------
-- Indexes for chat, stories, groups, moderation, and unread work.
-- ---------------------------------------------------------------------------
create index if not exists conversations_type_updated_idx on public.conversations(conversation_type, updated_at desc);
create index if not exists conversation_participants_user_status_idx on public.conversation_participants(user_id, membership_status, conversation_id);
create index if not exists messages_conversation_visible_idx on public.messages(conversation_id, created_at desc) where deleted_for_everyone_at is null;
create index if not exists message_receipts_user_unread_idx on public.message_receipts(user_id, read_at, message_id) where read_at is null;
create index if not exists stories_user_active_idx on public.stories(user_id, expires_at desc) where deleted_at is null;
create index if not exists stories_active_idx on public.stories(expires_at desc) where deleted_at is null and moderation_state = 'approved';
create index if not exists story_views_viewer_idx on public.story_views(viewer_id, viewed_at desc);
create index if not exists moderation_flags_status_severity_idx on public.moderation_flags(status, severity, created_at desc);
create index if not exists moderation_reports_status_idx on public.moderation_reports(status, created_at desc);
create index if not exists moderation_appeals_status_idx on public.moderation_appeals(status, created_at desc);
create index if not exists account_enforcement_status_idx on public.account_enforcement(status, suspended_until);

-- ---------------------------------------------------------------------------
-- Security helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_vybe_admin(check_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = check_user);
$$;

create or replace function public.account_can_participate(check_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select status = 'active' or status = 'warned' or (status = 'suspended' and suspended_until is not null and suspended_until <= now())
    from public.account_enforcement where user_id = check_user
  ), true);
$$;

create or replace function public.audience_allows(owner_user uuid, viewer_user uuid, audience text)
returns boolean language sql stable security definer set search_path = public as $$
  select owner_user = viewer_user or (
    not public.is_blocked_between(owner_user, viewer_user)
    and public.same_age_bracket(owner_user, viewer_user)
    and case audience
      when 'everyone' then true
      when 'friends' then public.are_friends(owner_user, viewer_user)
      when 'matches' then public.has_active_match(owner_user, viewer_user)
      else false
    end
  );
$$;

create or replace function public.can_view_profile(target_user uuid, viewer_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select target_user = viewer_user or public.audience_allows(
    target_user,
    viewer_user,
    coalesce((select profile_visibility from public.user_settings where user_id = target_user), 'everyone')
  );
$$;

create or replace function public.can_view_story(story_to_view uuid, viewer_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stories s
    where s.id = story_to_view
      and s.deleted_at is null
      and s.expires_at > now()
      and s.moderation_state = 'approved'
      and public.audience_allows(
        s.user_id,
        viewer_user,
        coalesce((select story_privacy from public.user_settings where user_id = s.user_id), 'friends')
      )
  );
$$;

create or replace function public.can_message(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.account_can_participate(first_user)
    and public.account_can_participate(second_user)
    and not public.is_blocked_between(first_user, second_user)
    and public.same_age_bracket(first_user, second_user)
    and (public.are_friends(first_user, second_user) or public.has_active_match(first_user, second_user))
    and public.audience_allows(second_user, first_user, coalesce((select message_privacy from public.user_settings where user_id = second_user), 'friends'));
$$;

create or replace function public.can_access_conversation(target_conversation uuid, viewer_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id = target_conversation
      and cp.user_id = viewer_user
      and cp.membership_status = 'active'
      and public.account_can_participate(viewer_user)
      and (
        (c.conversation_type = 'direct' and public.can_message(c.user_a, c.user_b))
        or (
          c.conversation_type = 'group'
          and not exists (
            select 1 from public.conversation_participants other
            where other.conversation_id = c.id and other.membership_status = 'active'
              and public.is_blocked_between(viewer_user, other.user_id)
          )
        )
      )
  );
$$;

create or replace function public.profile_is_discoverable(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_user <> auth.uid()
    and public.account_can_participate(target_user)
    and public.same_age_bracket(auth.uid(), target_user)
    and not public.is_blocked_between(auth.uid(), target_user)
    and coalesce((select profile_visibility = 'everyone' from public.user_settings where user_id = target_user), true);
$$;

-- ---------------------------------------------------------------------------
-- Group chat RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_group_chat(group_title text, invited_users uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  conversation_id uuid;
  invited_user uuid;
begin
  perform public.check_vybe_rate_limit('create_group', 10, 86400);
  if char_length(trim(group_title)) not between 1 and 60 then raise exception 'Group name must be 1 to 60 characters'; end if;
  if cardinality(invited_users) < 1 or cardinality(invited_users) > 19 then raise exception 'Groups support 2 to 20 members'; end if;
  if exists (select 1 from unnest(invited_users) u where u = auth.uid()) then raise exception 'Do not invite yourself'; end if;
  if exists (select 1 from unnest(invited_users) u where not public.are_friends(auth.uid(), u) or public.is_blocked_between(auth.uid(), u) or not public.same_age_bracket(auth.uid(), u)) then
    raise exception 'Only same-bracket, unblocked friends may be invited';
  end if;

  insert into public.conversations(conversation_type, title, owner_id, updated_at)
  values ('group', trim(group_title), auth.uid(), now()) returning id into conversation_id;
  insert into public.conversation_participants(conversation_id, user_id, role, membership_status, accepted_at)
  values (conversation_id, auth.uid(), 'owner', 'active', now());

  foreach invited_user in array invited_users loop
    insert into public.conversation_participants(conversation_id, user_id, role, membership_status, invited_by)
    values (conversation_id, invited_user, 'member', 'invited', auth.uid());
    insert into public.notifications(user_id, actor_id, type, title, body, entity_id)
    values (invited_user, auth.uid(), 'system', 'Group invite', 'You were invited to ' || trim(group_title) || '.', conversation_id);
  end loop;
  return conversation_id;
end;
$$;

create or replace function public.respond_group_invite(group_id uuid, accept_invite boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversation_participants
  set membership_status = case when accept_invite then 'active' else 'left' end,
      accepted_at = case when accept_invite then now() else null end,
      left_at = case when accept_invite then null else now() end
  where conversation_id = group_id and user_id = auth.uid() and membership_status = 'invited';
  if not found then raise exception 'Invite not found'; end if;
end;
$$;

create or replace function public.update_group_chat(group_id uuid, group_title text default null, group_icon_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare old_title text;
begin
  select title into old_title from public.conversations where id = group_id and conversation_type = 'group' and owner_id = auth.uid();
  if old_title is null then raise exception 'Only the group owner can update this group'; end if;
  update public.conversations
  set title = coalesce(nullif(trim(group_title), ''), title), icon_path = coalesce(group_icon_path, icon_path), updated_at = now()
  where id = group_id;
  if group_title is not null and trim(group_title) <> old_title then
    insert into public.notifications(user_id, actor_id, type, title, body, entity_id)
    select cp.user_id, auth.uid(), 'system', 'Group name changed', old_title || ' is now ' || trim(group_title) || '.', group_id
    from public.conversation_participants cp where cp.conversation_id = group_id and cp.user_id <> auth.uid() and cp.membership_status = 'active';
  end if;
end;
$$;

create or replace function public.remove_group_member(group_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversations where id = group_id and conversation_type = 'group' and owner_id = auth.uid()) then raise exception 'Only the owner can remove members'; end if;
  if member_id = auth.uid() then raise exception 'Owners must transfer or close the group'; end if;
  update public.conversation_participants set membership_status = 'removed', left_at = now()
  where conversation_id = group_id and user_id = member_id and membership_status in ('active','invited');
  if not found then raise exception 'Member not found'; end if;
end;
$$;

create or replace function public.leave_group_chat(group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.conversations where id = group_id and owner_id = auth.uid()) then raise exception 'The owner must remove the group or transfer ownership'; end if;
  update public.conversation_participants set membership_status = 'left', left_at = now()
  where conversation_id = group_id and user_id = auth.uid() and membership_status = 'active';
  if not found then raise exception 'Active membership not found'; end if;
end;
$$;

create or replace function public.set_conversation_muted(target_conversation uuid, muted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversation_participants
  set muted_until = case when muted then 'infinity'::timestamptz else null end
  where conversation_id = target_conversation and user_id = auth.uid() and membership_status = 'active';
  if not found then raise exception 'Conversation access required'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Message, story, and moderation actions
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(target_conversation uuid, share_receipts boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_conversation(target_conversation, auth.uid()) then raise exception 'Conversation access required'; end if;
  update public.conversation_participants set last_read_at = now() where conversation_id = target_conversation and user_id = auth.uid();
  update public.message_receipts set delivered_at = coalesce(delivered_at, now()), read_at = case when share_receipts then now() else read_at end
  where user_id = auth.uid() and message_id in (select id from public.messages where conversation_id = target_conversation);
  update public.notifications set read_at = now() where user_id = auth.uid() and entity_id = target_conversation and read_at is null;
end;
$$;

create or replace function public.delete_message_for_me(target_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.messages m where m.id = target_message and public.can_access_conversation(m.conversation_id, auth.uid())) then raise exception 'Message access required'; end if;
  insert into public.message_hidden_users(message_id, user_id) values (target_message, auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.delete_message_for_everyone(target_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.messages set deleted_for_everyone_at = now(), deleted_by = auth.uid(), body = '', media_path = null, waveform = '[]'::jsonb
  where id = target_message and sender_id = auth.uid() and created_at > now() - interval '15 minutes' and deleted_for_everyone_at is null;
  if not found then raise exception 'Only recent messages you sent can be deleted for everyone'; end if;
end;
$$;

create or replace function public.toggle_message_pin(target_message uuid, pin_message boolean)
returns void language plpgsql security definer set search_path = public as $$
declare target_conversation uuid;
begin
  select conversation_id into target_conversation from public.messages where id = target_message;
  if target_conversation is null or not public.can_access_conversation(target_conversation, auth.uid()) then raise exception 'Message access required'; end if;
  if pin_message then
    insert into public.message_pins(conversation_id, message_id, pinned_by) values (target_conversation, target_message, auth.uid()) on conflict do nothing;
  else
    delete from public.message_pins where conversation_id = target_conversation and message_id = target_message;
  end if;
end;
$$;

create or replace function public.record_story_view(target_story uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_view_story(target_story, auth.uid()) then raise exception 'Story access denied'; end if;
  insert into public.story_views(story_id, viewer_id) values (target_story, auth.uid()) on conflict do update set viewed_at = now();
end;
$$;

create or replace function public.react_to_story(target_story uuid, reaction text)
returns void language plpgsql security definer set search_path = public as $$
declare owner_user uuid;
begin
  if not public.can_view_story(target_story, auth.uid()) then raise exception 'Story access denied'; end if;
  select user_id into owner_user from public.stories where id = target_story;
  insert into public.story_reactions(story_id, user_id, emoji) values (target_story, auth.uid(), reaction)
  on conflict (story_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  if owner_user <> auth.uid() then
    insert into public.notifications(user_id, actor_id, type, title, body, entity_id)
    values (owner_user, auth.uid(), 'system', 'Story reaction', reaction || ' on your story', target_story);
  end if;
end;
$$;

create or replace function public.like_profile(target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_user = auth.uid() or not public.can_view_profile(target_user, auth.uid()) then raise exception 'Profile is not available'; end if;
  if not coalesce((select profile_likes_enabled from public.user_settings where user_id = target_user), false) then raise exception 'Profile likes are disabled'; end if;
  perform public.check_vybe_rate_limit('profile_like', 40, 3600);
  insert into public.profile_likes(actor_id, target_id) values (auth.uid(), target_user) on conflict do nothing;
  if found then insert into public.notifications(user_id, actor_id, type, title, body) values (target_user, auth.uid(), 'system', 'Profile like', 'Someone liked your profile.', null); end if;
end;
$$;

create or replace function public.submit_content_report(reported_user uuid, content_type text, content_id uuid, report_reason text, report_notes text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare report_id uuid;
begin
  perform public.check_vybe_rate_limit('report', 20, 86400);
  if reported_user = auth.uid() then raise exception 'You cannot report yourself'; end if;
  if content_type not in ('profile','message','story','group') then raise exception 'Invalid report type'; end if;
  insert into public.moderation_reports(reporter_id, reported_id, reason, notes, target_type, target_id)
  values (auth.uid(), reported_user, report_reason, left(report_notes,1000), content_type, content_id) returning id into report_id;
  insert into public.moderation_flags(source_type, source_id, subject_user_id, reporter_id, categories, severity, summary, provider)
  values ('report', report_id, reported_user, auth.uid(), array[report_reason], 'medium', left(report_notes,500), 'user_report');
  return report_id;
end;
$$;

create or replace function public.submit_moderation_appeal(appeal_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare appeal_id uuid; current_status text;
begin
  select status into current_status from public.account_enforcement where user_id = auth.uid();
  if current_status is null or current_status = 'active' then raise exception 'No enforcement action to appeal'; end if;
  insert into public.moderation_appeals(user_id, enforcement_status, reason) values (auth.uid(), current_status, appeal_reason) returning id into appeal_id;
  return appeal_id;
end;
$$;

create or replace function public.admin_moderation_action(flag_to_action uuid, action_name text, action_notes text default '', suspension_hours integer default 0)
returns void language plpgsql security definer set search_path = public as $$
declare subject_user uuid; source_kind text; source_record uuid;
begin
  if not public.is_vybe_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  select subject_user_id, source_type, source_id into subject_user, source_kind, source_record from public.moderation_flags where id = flag_to_action;
  if subject_user is null then raise exception 'Moderation case not found'; end if;
  if action_name = 'warn' then
    insert into public.account_enforcement(user_id,status,reason,updated_at,updated_by) values (subject_user,'warned',action_notes,now(),auth.uid())
    on conflict(user_id) do update set status='warned',reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'suspend' then
    insert into public.account_enforcement(user_id,status,reason,suspended_until,updated_at,updated_by) values (subject_user,'suspended',action_notes,now()+make_interval(hours => greatest(suspension_hours,1)),now(),auth.uid())
    on conflict(user_id) do update set status='suspended',reason=excluded.reason,suspended_until=excluded.suspended_until,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'ban' then
    insert into public.account_enforcement(user_id,status,reason,updated_at,updated_by) values (subject_user,'banned',action_notes,now(),auth.uid())
    on conflict(user_id) do update set status='banned',reason=excluded.reason,suspended_until=null,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'delete_message' and source_kind = 'message' then
    update public.messages set moderation_state='removed',deleted_for_everyone_at=now(),deleted_by=auth.uid(),body='',media_path=null where id=source_record;
  elsif action_name = 'delete_story' and source_kind = 'story' then
    update public.stories set moderation_state='removed',deleted_at=now() where id=source_record;
  elsif action_name = 'dismiss' then
    update public.moderation_flags set status='dismissed',hidden=false,updated_at=now() where id=flag_to_action;
  elsif action_name = 'restore' then
    update public.account_enforcement set status='active',reason='',suspended_until=null,updated_at=now(),updated_by=auth.uid() where user_id=subject_user;
  else
    raise exception 'Unsupported moderation action';
  end if;
  update public.moderation_flags set status = case when action_name='dismiss' then 'dismissed' else 'actioned' end, updated_at=now() where id=flag_to_action;
  insert into public.moderation_logs(admin_id,action,target_user_id,flag_id,source_type,source_id,notes)
  values (auth.uid(),action_name,subject_user,flag_to_action,source_kind,source_record,action_notes);
  insert into public.notifications(user_id,actor_id,type,title,body,entity_id)
  values (subject_user,auth.uid(),'safety','Safety update','A moderation action was applied to your account or content. Visit Safety Center for details.',flag_to_action);
end;
$$;


create or replace function public.admin_user_action(target_user uuid, action_name text, action_notes text default '', suspension_hours integer default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_vybe_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if target_user = auth.uid() then raise exception 'Administrators cannot enforce their own account'; end if;
  if not exists(select 1 from public.profiles where id=target_user) then raise exception 'User not found'; end if;
  if action_name = 'warn' then
    insert into public.account_enforcement(user_id,status,reason,updated_at,updated_by) values (target_user,'warned',left(action_notes,1000),now(),auth.uid())
    on conflict(user_id) do update set status='warned',reason=excluded.reason,suspended_until=null,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'suspend' then
    insert into public.account_enforcement(user_id,status,reason,suspended_until,updated_at,updated_by) values (target_user,'suspended',left(action_notes,1000),now()+make_interval(hours => greatest(suspension_hours,1)),now(),auth.uid())
    on conflict(user_id) do update set status='suspended',reason=excluded.reason,suspended_until=excluded.suspended_until,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'ban' then
    insert into public.account_enforcement(user_id,status,reason,updated_at,updated_by) values (target_user,'banned',left(action_notes,1000),now(),auth.uid())
    on conflict(user_id) do update set status='banned',reason=excluded.reason,suspended_until=null,updated_at=now(),updated_by=auth.uid();
  elsif action_name = 'restore' then
    insert into public.account_enforcement(user_id,status,reason,suspended_until,updated_at,updated_by) values (target_user,'active','',null,now(),auth.uid())
    on conflict(user_id) do update set status='active',reason='',suspended_until=null,updated_at=now(),updated_by=auth.uid();
  else
    raise exception 'Unsupported account action';
  end if;
  insert into public.moderation_logs(admin_id,action,target_user_id,notes) values (auth.uid(),action_name,target_user,left(action_notes,1500));
  insert into public.notifications(user_id,actor_id,type,title,body) values (target_user,auth.uid(),'safety','Account safety update','An administrator updated your account safety status. Open Safety Center for details.');
end;
$$;

create or replace function public.review_moderation_appeal(appeal_to_review uuid, decision text, review_notes text default '')
returns void language plpgsql security definer set search_path = public as $$
declare target_user uuid; current_appeal_status text;
begin
  if not public.is_vybe_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if decision not in ('approved','denied') then raise exception 'Invalid appeal decision'; end if;
  select user_id,status into target_user,current_appeal_status from public.moderation_appeals where id=appeal_to_review for update;
  if target_user is null then raise exception 'Appeal not found'; end if;
  if current_appeal_status not in ('pending','reviewing') then raise exception 'Appeal is already closed'; end if;
  update public.moderation_appeals set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),reviewer_notes=left(review_notes,1500) where id=appeal_to_review;
  if decision='approved' then
    insert into public.account_enforcement(user_id,status,reason,suspended_until,updated_at,updated_by) values (target_user,'active','',null,now(),auth.uid())
    on conflict(user_id) do update set status='active',reason='',suspended_until=null,updated_at=now(),updated_by=auth.uid();
  end if;
  insert into public.moderation_logs(admin_id,action,target_user_id,notes) values (auth.uid(),case when decision='approved' then 'appeal_approve' else 'appeal_deny' end,target_user,left(review_notes,1500));
  insert into public.notifications(user_id,actor_id,type,title,body,entity_id) values (target_user,auth.uid(),'safety','Appeal reviewed',case when decision='approved' then 'Your appeal was approved.' else 'Your appeal was denied.' end,appeal_to_review);
end;
$$;

-- Validate direct and group messages inserted by the trusted moderation Edge Function.
create or replace function public.validate_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then raise exception 'Invalid conversation'; end if;
  if auth.uid() is not null and new.sender_id <> auth.uid() then raise exception 'You may only send messages as yourself'; end if;
  if not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.user_id = new.sender_id and cp.membership_status = 'active'
  ) then raise exception 'Sender is not an active participant'; end if;
  if c.conversation_type = 'direct' then
    if new.receiver_id is null or not public.can_message(new.sender_id,new.receiver_id) then raise exception 'Friendship or active match required'; end if;
    if c.user_a <> least(new.sender_id,new.receiver_id) or c.user_b <> greatest(new.sender_id,new.receiver_id) then raise exception 'Invalid direct conversation'; end if;
  else
    new.receiver_id := null;
  end if;
  new.body := trim(coalesce(new.body,''));
  return new;
end;
$$;

-- Trigger receipts and notifications for messages inserted by the trusted Edge Function.
create or replace function public.after_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare conversation_title text; conversation_kind text;
begin
  if new.moderation_state = 'hidden' then return new; end if;
  update public.conversations set last_message_at = new.created_at, updated_at = new.created_at where id = new.conversation_id;
  select conversation_type, title into conversation_kind, conversation_title from public.conversations where id = new.conversation_id;
  if conversation_kind = 'direct' and new.receiver_id is not null then
    update public.matches set last_activity_at = new.created_at
      where user_a = least(new.sender_id,new.receiver_id) and user_b = greatest(new.sender_id,new.receiver_id) and status='active';
  end if;
  insert into public.message_receipts(message_id,user_id)
  select new.id, cp.user_id from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id and cp.membership_status='active' and cp.user_id <> new.sender_id
  on conflict do nothing;
  insert into public.notifications(user_id,actor_id,type,title,body,entity_id)
  select cp.user_id,new.sender_id,'message',
    case when new.message_type='voice' then 'New voice message' when conversation_kind='group' then coalesce(conversation_title,'Group message') else 'New message' end,
    case when new.message_type='voice' then 'Sent a voice message' when new.message_type='image' then 'Sent an image' else left(new.body,120) end,
    new.conversation_id
  from public.conversation_participants cp
  where cp.conversation_id=new.conversation_id and cp.membership_status='active' and cp.user_id<>new.sender_id
    and (cp.muted_until is null or cp.muted_until < now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security and least privilege
-- ---------------------------------------------------------------------------
alter table public.message_hidden_users enable row level security;
alter table public.message_pins enable row level security;
alter table public.message_receipts enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.profile_likes enable row level security;
alter table public.admin_roles enable row level security;
alter table public.account_enforcement enable row level security;
alter table public.moderation_flags enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.moderation_appeals enable row level security;

revoke all on public.message_hidden_users, public.message_pins, public.message_receipts, public.stories, public.story_views, public.story_reactions, public.profile_likes, public.admin_roles, public.account_enforcement, public.moderation_flags, public.moderation_logs, public.moderation_appeals from anon, authenticated;
grant select, insert, delete on public.message_hidden_users to authenticated;
grant select on public.message_pins to authenticated;
grant select, update on public.message_receipts to authenticated;
grant select, delete on public.stories to authenticated;
grant select on public.story_views to authenticated;
grant select, insert, update, delete on public.story_reactions to authenticated;
grant select, insert, delete on public.profile_likes to authenticated;
grant select on public.account_enforcement to authenticated;
grant select, insert on public.moderation_appeals to authenticated;
grant select on public.admin_roles, public.moderation_flags, public.moderation_logs to authenticated;

create policy message_hidden_own on public.message_hidden_users for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy message_pins_conversation on public.message_pins for select to authenticated using (public.can_access_conversation(conversation_id,auth.uid()));
create policy message_receipts_participant_select on public.message_receipts for select to authenticated using (exists(select 1 from public.messages m where m.id=message_id and public.can_access_conversation(m.conversation_id,auth.uid())));
create policy message_receipts_own_update on public.message_receipts for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy stories_visible on public.stories for select to authenticated using (user_id=auth.uid() or public.can_view_story(id,auth.uid()));
create policy stories_owner_delete on public.stories for delete to authenticated using (user_id=auth.uid());
create policy story_views_owner_or_self on public.story_views for select to authenticated using (viewer_id=auth.uid() or exists(select 1 from public.stories s where s.id=story_id and s.user_id=auth.uid()));
create policy story_reactions_visible on public.story_reactions for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.stories s where s.id=story_id and (s.user_id=auth.uid() or public.can_view_story(s.id,auth.uid()))));
create policy story_reactions_own_insert on public.story_reactions for insert to authenticated with check (user_id=auth.uid() and public.can_view_story(story_id,auth.uid()));
create policy story_reactions_own_update on public.story_reactions for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy story_reactions_own_delete on public.story_reactions for delete to authenticated using (user_id=auth.uid());
create policy profile_likes_own_or_received on public.profile_likes for select to authenticated using (actor_id=auth.uid() or target_id=auth.uid());
create policy profile_likes_own_insert on public.profile_likes for insert to authenticated with check (actor_id=auth.uid() and public.can_view_profile(target_id,auth.uid()));
create policy profile_likes_own_delete on public.profile_likes for delete to authenticated using (actor_id=auth.uid());
create policy account_enforcement_own_or_admin on public.account_enforcement for select to authenticated using (user_id=auth.uid() or public.is_vybe_admin(auth.uid()));
create policy admin_roles_admin_only on public.admin_roles for select to authenticated using (user_id=auth.uid() or public.is_vybe_admin(auth.uid()));
create policy moderation_flags_admin_only on public.moderation_flags for select to authenticated using (public.is_vybe_admin(auth.uid()));
create policy moderation_logs_admin_only on public.moderation_logs for select to authenticated using (public.is_vybe_admin(auth.uid()));
create policy appeals_own_or_admin_select on public.moderation_appeals for select to authenticated using (user_id=auth.uid() or public.is_vybe_admin(auth.uid()));
create policy appeals_own_insert on public.moderation_appeals for insert to authenticated with check (user_id=auth.uid());

-- Generalized profile grants and policy. Date of birth remains private.
revoke all on public.profiles from anon,authenticated;
grant select (id,username,display_name,age_bracket,bio,status,interests,avatar_url,banner_url,favorite_music,favorite_games,favorite_hobbies,school_grade,pronouns,favorite_sports,accent_color,profile_badges,created_at,updated_at) on public.profiles to authenticated;
grant update (username,display_name,bio,status,interests,avatar_url,banner_url,favorite_music,favorite_games,favorite_hobbies,school_grade,pronouns,favorite_sports,accent_color) on public.profiles to authenticated;
drop policy if exists profiles_select_same_bracket on public.profiles;
create policy profiles_select_phase4 on public.profiles for select to authenticated using (
  id=auth.uid()
  or public.is_vybe_admin(auth.uid())
  or (public.can_view_profile(id,auth.uid()) and not public.is_blocked_between(auth.uid(),id))
);

-- Generalized conversation policies. Direct chat still requires friend or active match.
revoke all on public.conversations from anon,authenticated;
grant select on public.conversations to authenticated;
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant on public.conversations for select to authenticated using (public.can_access_conversation(id,auth.uid()) or exists(select 1 from public.conversation_participants cp where cp.conversation_id=id and cp.user_id=auth.uid() and cp.membership_status='invited'));

drop policy if exists participants_select_conversation_member on public.conversation_participants;
create policy participants_select_conversation_member on public.conversation_participants for select to authenticated using (
  user_id=auth.uid() or public.can_access_conversation(conversation_id,auth.uid()) or exists(select 1 from public.conversation_participants me where me.conversation_id=conversation_id and me.user_id=auth.uid() and me.membership_status='invited')
);
grant select on public.conversation_participants to authenticated;

-- Message creation is reserved for the trusted moderation Edge Function.
revoke all on public.messages from anon,authenticated;
grant select on public.messages to authenticated;
drop policy if exists messages_insert_sender on public.messages;
drop policy if exists messages_update_receiver on public.messages;
drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages for select to authenticated using (
  public.can_access_conversation(conversation_id,auth.uid())
  and moderation_state <> 'hidden'
  and not exists(select 1 from public.message_hidden_users h where h.message_id=messages.id and h.user_id=auth.uid())
);

-- Existing reaction policies now use generalized conversation access.
drop policy if exists reactions_select_participant on public.message_reactions;
drop policy if exists reactions_insert_own on public.message_reactions;
drop policy if exists reactions_update_own on public.message_reactions;
drop policy if exists reactions_delete_own on public.message_reactions;
drop policy if exists reactions_update_own_connection_message on public.message_reactions;
drop policy if exists reactions_delete_own_connection_message on public.message_reactions;
create policy reactions_select_conversation on public.message_reactions for select to authenticated using (exists(select 1 from public.messages m where m.id=message_id and public.can_access_conversation(m.conversation_id,auth.uid())));
create policy reactions_insert_conversation on public.message_reactions for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and public.can_access_conversation(m.conversation_id,auth.uid())));
create policy reactions_update_own on public.message_reactions for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy reactions_delete_own on public.message_reactions for delete to authenticated using (user_id=auth.uid());

-- Presence privacy may be everyone/friends/matches/nobody, without exposing device/location data.
drop policy if exists presence_select_connections on public.user_presence;
create policy presence_select_phase4 on public.user_presence for select to authenticated using (
  user_id=auth.uid() or public.audience_allows(user_id,auth.uid(),coalesce((select online_status_privacy from public.user_settings where user_id=user_presence.user_id),'friends'))
);

-- Reports remain user-owned; admins use the flag queue.
drop policy if exists reports_select_own on public.moderation_reports;
create policy reports_select_own_or_admin on public.moderation_reports for select to authenticated using (reporter_id=auth.uid() or public.is_vybe_admin(auth.uid()));

-- Storage buckets are private. Users upload only to their own first-level folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('voice-messages','voice-messages',false,12582912,array['audio/webm','audio/ogg','audio/mp4','audio/mpeg']),
  ('chat-media','chat-media',false,15728640,array['image/jpeg','image/png','image/webp','image/gif']),
  ('stories','stories',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('group-icons','group-icons',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false;

create policy storage_phase4_insert_own on storage.objects for insert to authenticated with check (
  bucket_id in ('voice-messages','chat-media','stories','group-icons') and (storage.foldername(name))[1]=auth.uid()::text
);
create policy storage_phase4_update_own on storage.objects for update to authenticated using (
  bucket_id in ('voice-messages','chat-media','stories','group-icons') and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
) with check (bucket_id in ('voice-messages','chat-media','stories','group-icons') and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text);
create policy storage_phase4_delete_own on storage.objects for delete to authenticated using (
  bucket_id in ('voice-messages','chat-media','stories','group-icons') and owner_id=auth.uid()::text and (storage.foldername(name))[1]=auth.uid()::text
);
create policy storage_phase4_select_authorized on storage.objects for select to authenticated using (
  owner_id=auth.uid()::text
  or (bucket_id in ('voice-messages','chat-media') and exists(select 1 from public.messages m where m.media_path=name and public.can_access_conversation(m.conversation_id,auth.uid())))
  or (bucket_id='stories' and exists(select 1 from public.stories s where s.media_path=name and public.can_view_story(s.id,auth.uid())))
  or (bucket_id='group-icons' and exists(select 1 from public.conversations c where c.icon_path=name and public.can_access_conversation(c.id,auth.uid())))
);

-- Private Realtime topics support direct and group conversation participants.
drop policy if exists vybe_realtime_read on realtime.messages;
drop policy if exists vybe_realtime_write on realtime.messages;
create policy vybe_realtime_read on realtime.messages for select to authenticated using (
  (realtime.topic() like 'conversation:%' and public.can_access_conversation(split_part(realtime.topic(),':',2)::uuid,auth.uid()))
  or realtime.topic()='user:'||auth.uid()::text
);
create policy vybe_realtime_write on realtime.messages for insert to authenticated with check (
  (realtime.topic() like 'conversation:%' and public.can_access_conversation(split_part(realtime.topic(),':',2)::uuid,auth.uid()))
  or realtime.topic()='user:'||auth.uid()::text
);

-- Narrow helper execution and grant only intended RPC entry points.
revoke execute on function public.is_vybe_admin(uuid) from public,anon;
revoke execute on function public.account_can_participate(uuid) from public,anon;
revoke execute on function public.audience_allows(uuid,uuid,text) from public,anon;
revoke execute on function public.can_view_profile(uuid,uuid) from public,anon;
revoke execute on function public.can_view_story(uuid,uuid) from public,anon;
revoke execute on function public.can_access_conversation(uuid,uuid) from public,anon;
revoke execute on function public.create_group_chat(text,uuid[]) from public,anon;
revoke execute on function public.respond_group_invite(uuid,boolean) from public,anon;
revoke execute on function public.update_group_chat(uuid,text,text) from public,anon;
revoke execute on function public.remove_group_member(uuid,uuid) from public,anon;
revoke execute on function public.leave_group_chat(uuid) from public,anon;
revoke execute on function public.set_conversation_muted(uuid,boolean) from public,anon;
revoke execute on function public.mark_conversation_read(uuid,boolean) from public,anon;
revoke execute on function public.delete_message_for_me(uuid) from public,anon;
revoke execute on function public.delete_message_for_everyone(uuid) from public,anon;
revoke execute on function public.toggle_message_pin(uuid,boolean) from public,anon;
revoke execute on function public.record_story_view(uuid) from public,anon;
revoke execute on function public.react_to_story(uuid,text) from public,anon;
revoke execute on function public.like_profile(uuid) from public,anon;
revoke execute on function public.submit_content_report(uuid,text,uuid,text,text) from public,anon;
revoke execute on function public.submit_moderation_appeal(text) from public,anon;
revoke execute on function public.admin_moderation_action(uuid,text,text,integer) from public,anon;
revoke execute on function public.admin_user_action(uuid,text,text,integer) from public,anon;
revoke execute on function public.review_moderation_appeal(uuid,text,text) from public,anon;

grant execute on function public.is_vybe_admin(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid,uuid) to authenticated;
grant execute on function public.can_view_story(uuid,uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid,uuid) to authenticated;
grant execute on function public.create_group_chat(text,uuid[]) to authenticated;
grant execute on function public.respond_group_invite(uuid,boolean) to authenticated;
grant execute on function public.update_group_chat(uuid,text,text) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.leave_group_chat(uuid) to authenticated;
grant execute on function public.set_conversation_muted(uuid,boolean) to authenticated;
grant execute on function public.mark_conversation_read(uuid,boolean) to authenticated;
grant execute on function public.delete_message_for_me(uuid) to authenticated;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
grant execute on function public.toggle_message_pin(uuid,boolean) to authenticated;
grant execute on function public.record_story_view(uuid) to authenticated;
grant execute on function public.react_to_story(uuid,text) to authenticated;
grant execute on function public.like_profile(uuid) to authenticated;
grant execute on function public.submit_content_report(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.submit_moderation_appeal(text) to authenticated;
grant execute on function public.admin_moderation_action(uuid,text,text,integer) to authenticated;
grant execute on function public.admin_user_action(uuid,text,text,integer) to authenticated;
grant execute on function public.review_moderation_appeal(uuid,text,text) to authenticated;

-- Realtime replication for all user-facing Phase 4 records.
do $$ begin
  begin alter publication supabase_realtime add table public.stories; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.story_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.message_receipts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.message_pins; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.moderation_flags; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.moderation_appeals; exception when duplicate_object then null; end;
end $$;

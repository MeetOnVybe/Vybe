-- VYBE Phase 5 hotfix: remove recursive conversation_participants RLS evaluation.
--
-- The Phase 4 SELECT policy queried conversation_participants from inside the
-- conversation_participants policy itself when checking invited membership.
-- PostgreSQL correctly rejected that policy with:
--   infinite recursion detected in policy for relation "conversation_participants"
--
-- Keep RLS enabled. Move the membership lookup into a narrowly scoped
-- SECURITY DEFINER helper that only evaluates the current authenticated user.

begin;

create or replace function public.current_user_has_conversation_access(
  target_conversation uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select
    public.can_access_conversation(target_conversation, auth.uid())
    or exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = target_conversation
        and cp.user_id = auth.uid()
        and cp.membership_status = 'invited'
    );
$$;

revoke all on function public.current_user_has_conversation_access(uuid)
from public, anon;
grant execute on function public.current_user_has_conversation_access(uuid)
to authenticated;

-- Keep the active-participant helper outside RLS evaluation as well. It is a
-- SECURITY DEFINER function and remains constrained by the supplied user plus
-- all existing friend, match, block, age, account, and group checks.
alter function public.can_access_conversation(uuid, uuid)
  set row_security = off;

-- Do not query conversation_participants directly from either policy. Both
-- policies now call the non-recursive helper above.
drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
on public.conversations
for select
to authenticated
using (public.current_user_has_conversation_access(id));

drop policy if exists participants_select_conversation_member
on public.conversation_participants;
create policy participants_select_conversation_member
on public.conversation_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_conversation_access(conversation_id)
);

-- RLS remains enabled and grants remain least-privilege.
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
revoke all on public.conversation_participants from anon;
grant select on public.conversation_participants to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

commit;

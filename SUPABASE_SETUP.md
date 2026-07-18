# VYBE — Supabase Production Setup

This guide configures VYBE Auth, Postgres, RLS, Storage, Realtime, moderation, social systems, Stories, chat, and the Solo/Group video matchmaking control plane.

## 1. Create or select the project

Copy these browser-safe values from **Project Settings → API**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Copy the service-role key separately for server-only Vercel use:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Never prefix the service-role key with `NEXT_PUBLIC_`.

## 2. Configure Auth URLs

In **Authentication → URL Configuration**:

**Site URL**

```text
https://vybe-taupe-zeta.vercel.app
```

**Redirect URLs**

```text
https://vybe-taupe-zeta.vercel.app/auth/callback
https://vybe-taupe-zeta.vercel.app/auth/confirm
https://vybe-taupe-zeta.vercel.app/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
http://localhost:3000/reset-password
```

Add each Vercel Preview domain you intend to test. Keep email confirmation enabled in production.

## 3. Apply the complete migration chain

The package contains ten ordered migrations:

1. `202607160001_phase2_schema.sql`
2. `202607160002_phase2_rls.sql`
3. `202607160003_security_hardening.sql`
4. `202607160004_phase3_discovery_matches_theme.sql`
5. `202607160005_phase4_communication_safety.sql`
6. `202607160006_phase5_live_video_matching.sql`
7. `202607160007_hotfix_conversation_participants_rls_recursion.sql`
8. `202607160008_hotfix_video_matchmaking_pairing.sql`
9. `202607160009_hotfix_video_matchmaking_root_cause.sql`
10. `202607170010_final_production_group_video.sql`

From the project root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

`db push` applies only migrations not already recorded in the linked project’s migration history. Do not paste edited production schema changes directly into the Dashboard after adopting migrations.

For a local disposable Supabase stack:

```bash
npx supabase start
npx supabase db reset
```

## 4. Verify RLS and private Storage

The final schema contains 45 RLS-enabled application tables. Run:

```bash
npm run test:security
```

The migrations create or configure these private buckets:

- `profile-avatars`
- `profile-banners`
- `voice-messages`
- `chat-media`
- `stories`
- `group-icons`

User uploads are restricted to a path whose first segment is that authenticated user’s UUID. Reads require the owning user or an authorized profile, Story, or conversation relationship.

There is no video-recording bucket. Calls are not recorded by default.

## 5. Deploy the moderation Edge Function

The function verifies the caller’s Supabase access token inside the handler. `supabase/config.toml` therefore configures `verify_jwt = false` at the gateway layer to avoid publishable-key compatibility failures while preserving application authentication.

```bash
npx supabase functions deploy moderate-content --no-verify-jwt
```

Set custom production secrets:

```bash
npx supabase secrets set \
  VYBE_ALLOWED_ORIGINS=https://vybe-taupe-zeta.vercel.app \
  OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

Hosted Supabase functions provide project URL/key variables. Confirm the function has access to its project URL, public key, and service-role key in the Supabase environment.

Inspect logs after deployment:

```bash
npx supabase functions logs moderate-content
```

Every frontend invocation sends the authenticated user JWT. The function independently verifies that JWT, checks database authorization, rate-limits the action, and stores only necessary moderation results.

## 6. Realtime

Migrations add the required private tables to `supabase_realtime`, including:

- friend requests, friendships, matches, blocks, and notifications
- conversations, participants, messages, receipts, reactions, and pins
- Stories and Story reactions
- presence and restrictions
- Solo queue, sessions, and participants
- Group queue, sessions, and participants

Conversation typing uses authenticated private channels. Database subscriptions still rely on each table’s RLS policies.

If Realtime delivery is delayed, queue/status polling remains an idempotent fallback and can safely retry pairing.

## 7. Create an administrator

Create and verify a normal VYBE account, finish its profile, then run in SQL Editor:

```sql
insert into public.admin_roles (user_id, role)
select id, 'admin'
from public.profiles
where username = 'YOUR_ADMIN_USERNAME'
on conflict (user_id)
do update set role = excluded.role;
```

Allowed roles are `moderator`, `admin`, and `super_admin`. The `/admin` page checks the role server-side, and every action is checked again by RLS/RPC authorization.

## 8. Production environment values

Vercel browser-safe values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_SITE_URL=https://vybe-taupe-zeta.vercel.app
NEXT_PUBLIC_VIDEO_DEBUG_LOGS=false
NEXT_PUBLIC_VIDEO_MODERATION_ENABLED=true
```

Vercel server-only values:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
VIDEO_SAFETY_AGENT_NAME=vybe-video-safety
VIDEO_MODERATION_AGENT_SECRET=A_LONG_RANDOM_SECRET
OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

Do not configure any demo-mode variable; no demo runtime exists in the final source.

## 9. Required account tests

Use verified accounts with unique usernames and completed DOB-derived profiles:

- User A: 13–15
- User B: same bracket as A
- User C: 16–17

Confirm:

1. A and B can discover each other; neither can discover C.
2. Friend requests, acceptance, DMs, typing, receipts, reactions, and notifications work in separate browsers.
3. Story media uploads to the private bucket and is visible only to authorized friends/matches under the owner’s privacy setting.
4. Blocks immediately remove discovery, match, Story, and message access.
5. A and B receive one shared Solo session and one room; C never joins it.
6. Eligible same-bracket users receive one shared Group session; other-bracket users remain isolated.
7. RLS rejects direct writes that impersonate another user or create sessions outside the RPC path.

Credentialed automated commands are listed in `README.md` and `FINAL_DEPLOYMENT_CHECKLIST.md`.

## 10. Common production failures

**Old Phase 2/demo copy still appears**  
The live Vercel deployment is serving an older build. Deploy this source and confirm the Production branch/root directory.

**`infinite recursion detected in policy for relation conversation_participants`**  
Migration 7 was not applied.

**Both users wait forever in Solo Match**  
Apply migrations 8 and 9, confirm both profiles are eligible, then inspect `video_matchmaking_logs` and call `get_video_matchmaking_diagnostics()` while authenticated.

**Group Match stays waiting**  
Apply migration 10 and confirm Realtime publication, profile video identity, mutual preferences, blocks, restrictions, and age bracket.

**Stories or DMs fail with Edge Function errors**  
Deploy `moderate-content --no-verify-jwt`, set `VYBE_ALLOWED_ORIGINS`, and inspect function logs. Do not disable RLS or bypass the authenticated function wrapper.

**Upload succeeds but media does not display**  
Confirm the bucket is private, the object path starts with the authenticated UUID, and the relevant relationship grants signed-read access.

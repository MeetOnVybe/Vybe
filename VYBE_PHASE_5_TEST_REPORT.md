# VYBE Phase 5 — Test Report

## Summary

All locally executable application, build, authorization-contract, browser, theme, hydration, and mobile tests passed. The credentialed external Supabase/LiveKit test was included and correctly skipped because no real project or verified-account credentials were available.

## Static and build checks

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test:security` | Passed |
| `npm run build` | Passed |
| `npm run build:demo` | Passed |
| `npm audit --omit=dev` | Passed — 0 vulnerabilities |
| Python `py_compile` for safety worker | Passed |

The authorization contract validated seven migrations and 38 RLS-protected tables.

## Phase 5 browser tests

`tests/phase5.spec.ts` — 3/3 passed:

1. camera/microphone permission startup, local media, controls, profile action, friend request, Like/match, Next, and End
2. coarse-location privacy and exact VYBE light-theme palette
3. 390×844 setup/call layout, visible safety controls, and no document overflow

The suite watches browser console and page errors. No React, hydration, page, or console errors were reported.

## Preserved Phase 4 regression

`tests/phase4.spec.ts` — 4/4 passed:

- voice messages, replies, reactions, pins, deletion, receipts, and mute
- Stories, private groups, rich group messages, and expanded profiles
- privacy, Safety Center, notifications, and administrator moderation
- light/dark routes and 390×844 responsiveness

## Preserved Phase 3 regression

`tests/phase3.spec.ts` — 4/4 passed:

- discovery, accessible decisions, mutual match, match chat, and unmatch
- debounced bracket-safe block-aware search
- flash-free persistent light/dark themes
- Discovery, Matches, Search, mobile navigation, and overflow checks at 390×844

## Preserved Phase 2/core regression

`tests/vybe-flow.spec.ts` — 4/4 passed in isolated runs:

- full demo signup/onboarding/Solo Skip/friend acceptance/private chat/Group flow
- profile and settings persistence
- complete route and hydration sweep
- legacy Solo and six-item mobile navigation at 390px

The legacy Solo test explicitly enters the preserved **Legacy demo** route so the Phase 2 behavior remains verifiable while live video is the default Phase 5 experience.

## Database and security assertions

The automated contract checks cover:

- database-derived age isolation
- bidirectional blocks
- mutual gender preferences
- bilateral Country/State/City filters
- city visibility only when both users share city
- queue row locking and duplicate-session prevention
- repeat prevention
- skip/queue abuse restrictions
- stale session cleanup
- participant-only session access
- direct table-write denial
- private video Realtime topics
- moderator review routing
- sensitive location column grants
- room-scoped LiveKit grants
- no recording grant
- server-only LiveKit and Supabase secrets
- signed webhook processing
- server-secret speech moderation
- no raw audio, frame, or transcript persistence

## Cloud integration test

`npm run test:cloud` ran and skipped with a clear missing-credentials message. The included three-account script is prepared to verify:

- A and B in the same bracket can pair
- C in the other bracket cannot pair
- one unique session is created
- only participants can read session state
- bilateral city visibility
- participant state updates
- direct session insertion is denied
- End removes access
- block removes future video access

Required environment values are documented in `SUPABASE_SETUP.md`.

## Browser-runner note

The container's system Chromium intermittently stalls when many camera-enabled suites are chained into one long browser process. Each Phase 5, Phase 4, Phase 3, and core scenario was therefore run in a fresh isolated process and passed. This was a runner/environment limitation rather than an application exception; no browser error was observed in the passing isolated runs.

## Release screenshots

- `docs/vybe-phase-5-dark-live-video.png`
- `docs/vybe-phase-5-light-setup.png`
- `docs/vybe-phase-5-mobile-live-video.png`

## Conversation participant RLS hotfix verification

- Confirmed the replacement `conversation_participants` SELECT policy contains no self-table subquery.
- Confirmed both `conversations` and `conversation_participants` policies use the non-recursive current-user helper.
- Confirmed RLS remains enabled on both tables.
- Confirmed authenticated grants remain limited to participant SELECT and own `last_read_at` updates.
- Added a static regression assertion so future migrations cannot silently reintroduce the self-referencing policy.

### Hotfix release checks

- Supabase production build: passed.
- Demo production build: passed.
- TypeScript: passed.
- ESLint: passed.
- Static recursive-policy regression test: passed.
- Dependency audit: zero vulnerabilities.
- A live Supabase migration execution was not possible in this workspace because no project credentials were provided; migration 7 is designed as a forward-only hotfix for already-installed Phase 5 databases.

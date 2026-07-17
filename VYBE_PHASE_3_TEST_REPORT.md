# VYBE Phase 3 — Test Report

**Date:** July 16, 2026

## Automated results

| Check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run test:security` | Passed — 4 migrations, 19 RLS tables |
| `npm audit --omit=dev` | Passed — 0 vulnerabilities |
| `npm audit` | Passed — 0 vulnerabilities |
| `npm run build` | Passed — 26 routes |
| `npm run build:demo` | Passed — 26 routes |
| Phase 3 Playwright suite | 4/4 passed |
| Preserved Phase 2 Playwright regression suite | 4/4 passed |
| 390×844 overflow/mobile navigation checks | Passed |
| hydration/runtime route sweep | Passed |
| flash-free light/dark persistence test | Passed |
| cloud test script syntax/startup | Passed; credential-gated run skipped |

## Browser behaviors verified

- same-bracket discovery card rendering
- keyboard Like and Pass controls
- mutual-match celebration
- match-authorized private chat
- message sending through match relationship
- unmatch revokes match-only chat
- limited pass undo
- debounced search and empty state
- no cross-bracket demo search result
- light theme applied before hydration
- dark theme persistence across reload
- Settings selection and quick navigation toggle
- all preserved pages render without console, runtime, or hydration errors
- mobile stacked match panels
- six-item mobile navigation
- no horizontal overflow at 390×844 on Discovery, Matches, Search, Notifications, or Settings

## Database authorization checks

The static SQL contract asserts:

- RLS enabled on all 19 private/exposed tables
- computed same-age-bracket discovery
- block-aware discovery and search
- profile visibility enforcement
- deterministic compatibility scoring
- rate-limited discovery/search/profile interactions
- one active decision row per actor/target pair
- one normalized match row per user pair
- mutual likes create a match only once
- repeated likes do not duplicate match notifications
- unmatch deactivates both prior swipe decisions
- friend-or-active-match conversation authorization
- block and unmatch message revocation
- sender identity enforcement
- notification ownership
- private Realtime topic authorization
- Storage ownership rules from the Phase 2 migrations

## Live three-account test

`tests/integration/supabase-three-user.mjs` is included for a credentialed Supabase project. It covers:

- A/B same bracket and C other bracket
- A discovers B but not C
- A and B mutual Like
- single match creation
- realtime match notifications
- realtime private messages, typing, unread/read state, and reactions
- privacy-aware presence
- theme preference persistence
- unmatch revocation
- block removal from discovery and messaging
- denied cross-user writes

The live run was not executed in this build environment because no Supabase project URL or three verified test-account credentials were supplied. Running `npm run test:cloud` without them exits safely and lists the missing variables. Follow `SUPABASE_SETUP.md` to run the required cloud test against the deployment project.

## Browser-runner note

The container’s managed system Chromium froze when both Playwright files were chained into one long process after the first four tests had passed. Each file was then run in its own clean browser process: Phase 3 passed 4/4 and the preserved Phase 2 regression suite passed 4/4. No application failure or failed assertion occurred.

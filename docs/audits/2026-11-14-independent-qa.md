# Independent QA report — 2026-11-14

Adversarial re-test of the project after the 2026-11-13 changes (Redis cache, silent-failure fixes,
dependency removals). Every result below was produced in this run; earlier reported results were
not reused.

**Verdict: not production-ready.** No signed-in workflow has been tested, one medium security
issue was open at the time of the run (since fixed), and the cache has no measured end-to-end benefit.

## Defects found in this run

| #   | Severity | Defect                                                                                                                  | Status |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| Q1  | High     | Cache: a read that started after a write could join an older in-flight load and return pre-write data                   | Fixed  |
| Q2  | Medium   | Cache: a connected-but-hung Redis added 250 ms to every cached read and every write, with no cooldown                   | Fixed  |
| Q3  | Medium   | Cache: a write whose invalidation could not be delivered left stale entries readable for up to 60 s once Redis returned | Fixed  |
| Q4  | Low      | Cache: Redis errors were logged only once per process, so a second outage was silent                                    | Fixed  |
| Q5  | Medium   | `contact_us` accepts unauthenticated inserts with no rate limit (honeypot only); `anon` can also insert directly        | Fixed, applied to Supabase |
| Q6  | Low      | Chunked oversized request returns 413 with an internal body `{"unhandled":true,"message":"HTTPError"}`                  | Open   |
| Q7  | Low      | `getSafeRedirect` is duplicated in `routes/auth.tsx` and `routes/_authenticated/route.tsx`                              | Open   |
| Q8  | Info     | Every protected request makes about five sequential Supabase calls; one call measured 225 ms from this machine          | Open   |

Q1 and Q2 were each reproduced by a failing unit test before the fix and pass after it. Q3 is
covered by a new unit test and by the live outage run. Q5 needs a database-side limit; an application-level limiter would not help because the table is
writable with the publishable key. Migration `20261113185243_rate_limit_contact_us.sql` is drafted
(3 per email and 60 in total per hour) and was exercised in a throwaway Postgres 17 container, then
applied to the Supabase project and verified there with a rolled-back probe. Its pgTAP test has
not been run.

How the fixes work:

- Q1: single-flight is now keyed by cache key **and** tenant epoch, and joins happen only after the
  epoch has been read.
- Q2: any failed or timed-out command skips Redis for 5 seconds.
- Q3: an undelivered invalidation makes the instance stop reading the cache for 60 seconds, the
  maximum entry lifetime. Limitation: other server instances are not told, so they can still serve
  an entry for up to 60 seconds.

## Results by feature

| Area                                                    | Status     | Evidence                                                                                             |
| ------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Typecheck, lint                                         | PASS       | Exit 0                                                                                               |
| Unit tests                                              | PASS       | 237 pass, 0 fail                                                                                     |
| Static security scans (10) and bundle scans (2)         | PASS       | Exit 0                                                                                               |
| Dependency audit                                        | PASS       | 0 vulnerabilities at moderate or above                                                               |
| Production build                                        | PASS       | Exit 0; no Redis code in browser bundle                                                              |
| Production worker boots (local Cloudflare runtime)      | PASS       | `/` and `/auth` 200, unknown route 404, 50 concurrent requests all 200 (avg 22 ms)                   |
| Security headers on production worker                   | PASS       | CSP with nonce, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies                |
| Body limit, declared length (Node)                      | PASS       | 1.2 MB → 413 with clean JSON                                                                         |
| Body limit, chunked (Node)                              | PASS       | 1.2 MB → 413 (body format: Q6)                                                                       |
| Body limit on Cloudflare                                | NOT TESTED | Local emulator returned 500 "Network connection lost" from its own proxy; real edge not available    |
| Server function without credentials                     | PASS       | 403                                                                                                  |
| Protected route while signed out                        | PASS       | `/dashboard` → `/auth?redirect=/dashboard`                                                           |
| Open redirect via `?redirect=`                          | PASS       | Code rejects absolute, `//` and backslash targets; external URL not followed                         |
| Script injection via URL path                           | PASS       | No injected script element                                                                           |
| Landing and sign-in pages, desktop and 375 px           | PASS       | No console errors, no horizontal overflow (run of 2026-11-13, not repeated)                          |
| Cache: hit, miss, TTL expiry (live Redis)               | PASS       | `test:cache:integration`                                                                             |
| Cache: cross-user and cross-tenant leakage (live Redis) | PASS       | 3,000 concurrent reads across 3 tenants and 20 users with interleaved invalidations: 0 wrong owners  |
| Cache: stampede (live Redis)                            | PASS       | 500 concurrent readers of a cold key → 1 load                                                        |
| Cache: read-your-writes (live Redis)                    | PASS       | 200 write-then-read rounds, 0 stale                                                                  |
| Cache: Redis stopped mid-run                            | PASS       | Served from loader in 2 ms                                                                           |
| Cache: write during outage, then Redis returns          | PASS       | Next read reloaded, not served from the old entry                                                    |
| Cache: memory growth                                    | PASS       | No heap growth over 20,000 hits                                                                      |
| Cache inside the running app (signed-in dashboard)      | BLOCKED    | Needs a signed-in session                                                                            |
| Cache invalidation wired through the auth middleware    | NOT TESTED | Code path only reachable with a signed-in write                                                      |
| Redis client on real Cloudflare Workers                 | NOT TESTED | Worker boots with the module present; a connection from Workers was not attempted                    |
| Role lookup without service-key fallback                | PASS       | Policy `user_roles_select_same_tenant` allows `user_id = auth.uid()` (read in migrations, not live)  |
| Invite rollback                                         | NOT TESTED | Signup trigger creates the profile row, so the rollback path should not misfire; not run live        |
| Registration, login, logout, password reset             | BLOCKED    | Needs real credentials against the production Supabase project                                       |
| Session persistence, token expiry                       | BLOCKED    | Same                                                                                                 |
| Role-based access (L1–L4)                               | BLOCKED    | `test:e2e:roles` needs `STAFFINIX_E2E_PASSWORD`                                                      |
| Candidates, requirements, clients, vendors CRUD         | BLOCKED    | Signed-in only                                                                                       |
| Submissions pipeline, interviews, placements            | BLOCKED    | Signed-in only                                                                                       |
| Resume upload, download, tailoring, export              | BLOCKED    | Signed-in only; DOCX worker not started                                                              |
| AI matching, Copilot, RAG                               | BLOCKED    | Needs AI key, Qdrant and Ollama                                                                      |
| Email OAuth and sync                                    | BLOCKED    | Needs Google/Microsoft client credentials                                                            |
| Scheduled tasks                                         | BLOCKED    | Need `SUPABASE_SECRET_KEY`                                                                           |
| Database RLS tests, indexes, query plans                | NOT TESTED | No database connection was opened                                                                    |
| Load test of authenticated endpoints                    | NOT TESTED | Would load the production database                                                                   |
| Lighthouse / Core Web Vitals                            | NOT TESTED | No frontend change to compare                                                                        |

## Evidence for claimed optimizations

| Claim                              | Evidence                                                                                                                     | Verdict    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Redis cache speeds up the dashboard | Local Redis round trip 0.55 ms median; one Supabase round trip 225 ms median from this machine. A hit removes 1 of about 5 Supabase calls in a dashboard request. No end-to-end timing exists. | Unproven   |
| Unused dependencies removed        | Build and tests pass without them; client bundle unchanged at 3,149,970 bytes                                                | Hygiene only, no speed gain |
| Frontend bundle optimized          | Nothing was changed                                                                                                          | No claim   |

The 225 ms figure is network latency from a home workstation and will be far lower from a server
hosted near the database, which shrinks the cache's benefit further. The larger cost is the four
authentication and role calls made before every handler (Q8); the cache does not touch them.

## To unblock the remaining tests

1. Set `SUPABASE_SECRET_KEY` in `.env`.
2. Provide a dedicated test account, or set `STAFFINIX_E2E_PASSWORD` and run
   `npm run test:e2e:roles` and `npm run test:e2e:business`.

## Signed-in session as L1 (platform owner), added later the same day

The owner signed in by hand in the browser; the tests below then drove that session. Only pages
were opened. No record was created, edited or deleted.

| Area                                             | Status | Evidence                                                                                 |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| 16 pages load with data and no page errors       | PASS   | dashboard, clients, vendors, placements, recruiters, users, audit, developer, architecture, platform, tenants/new, access-request, settings/profile, candidates, requirements, submissions board, matching |
| Dashboard cache in the running app               | PASS   | Server log: miss, then hit on each reload                                                |
| Invalidation through the auth middleware         | PASS   | Tenant epoch in Redis rose with each non-GET server function                             |
| Viewing a list page must not invalidate the cache | FAIL → fixed | Q9 below                                                                           |
| Roles L2, L3, L4                                 | NOT TESTED | Each needs its own sign-in                                                           |
| Creating, editing, deleting records; uploads     | NOT TESTED | Not attempted on the live database                                                   |

**Q9 (medium, fixed).** List pages fetch with POST, and every non-GET call invalidated the tenant
cache, so opening the candidates list turned the next dashboard load into a miss. Seventeen
select-only POST functions are now marked `readOnlyServerFn` and skip invalidation; a source test
(`read-only-server-fns.test.ts`) fails if a marked function contains a write. Re-test: dashboard,
then candidates, requirements and clients, then dashboard again was a hit, and the epoch did not
change.

**Measured dashboard timing** (`getDashboardOverview`, server-side, from this workstation):

| Case            | Samples | Duration             |
| --------------- | ------- | -------------------- |
| Cache miss      | 1       | 1,575 ms             |
| Cache hit       | 3       | 799, 804, 832 ms     |

A hit was about 770 ms faster. The sample is small and the workstation is about 225 ms per round
trip from the database, so expect a smaller saving in production. The roughly 800 ms that remains
on a hit is the authentication and role checks (Q8), which every server function pays: other calls
in the same session took 1,100 to 2,400 ms.

## Signed-in session as L4 (recruiter)

The owner signed in by hand; the tests then drove that session. Only reads were made.

| Area                                                  | Status       | Evidence                                                                                                  |
| ----------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| Recruiter menu hides admin features                   | PASS         | No users, platform, audit, developer, clients, placements, recruiters or tenant links                      |
| Admin pages opened by URL                             | PASS         | `/users`, `/platform`, `/developer`, `/audit`, `/tenants/new`, `/clients`, `/recruiters`, `/placements`, `/architecture` all land on "Access denied" |
| Admin server functions called directly                | PASS         | `listUsers`, `getDeveloperConfig`, `listAccessRequests`, `listClients`, `listPlacements` all refused by the server |
| Recruiter pages load                                  | PASS         | dashboard, requirements, candidates, matching, tailoring, pipeline, interviews, smart email, vendors, profile |
| Data scoped to the recruiter                          | PASS         | Dashboard shows 1 active candidate and the list 1 row, against 32 and 20 for the owner                    |
| Cache entries separated per user                      | PASS         | Redis holds keys under the recruiter's own user ID; the owner's entry was never served                     |
| Invalid input to an allowed function                  | PASS         | `listVendors` with a negative page and oversized page size was rejected                                   |
| Denied and failed calls visible in logs               | FAIL → fixed | Q10 below                                                                                                 |
| Roles L2 and L3                                       | NOT TESTED   | Each needs its own sign-in                                                                                |
| Writes as a recruiter (create, edit, submit, upload)  | NOT TESTED   | Not attempted on the live database                                                                        |

**Q10 (medium, fixed).** A server function that was denied or failed was sent as HTTP 200 and
logged as `status 200, error_code null`, so authorization denials and failures were invisible to
logs and monitoring. The denial itself was real: no data was returned. The auth middleware now sets
the true status and error code. Re-test: denied calls are 403 `FORBIDDEN`, invalid input is 400
`VALIDATION_ERROR`, allowed calls are 200, and the messages shown to the user are unchanged.
Not covered: `submitContactUs`, the one function without the auth middleware.

**Open, low.**

- Q11: validation failures reach the browser as raw Zod JSON rather than a readable message.
- Q12: a denied POST still invalidates the tenant cache (efficiency only).
- Client-aborted requests are still logged as 500 `INTERNAL_ERROR`.

## Signed-in session as L3 (developer admin)

The owner signed in by hand; only reads were made. The expected permissions were taken from
`src/lib/feature-access.ts`: the `developer_admin` role has the `developer` feature only.

| Area                                         | Status     | Evidence                                                                                              |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Menu shows only permitted features           | PASS       | Developer, Architecture, Profile                                                                      |
| Permitted pages load                         | PASS       | `/developer`, `/architecture`, `/settings/profile`; the developer page makes 3 calls, all 200         |
| Other pages opened by URL                    | PASS       | `/dashboard`, `/users`, `/candidates`, `/platform`, `/audit`, `/submissions/board` → "Access denied"  |
| Permitted server function                    | PASS       | `getDeveloperConfig` returned data                                                                    |
| Restricted server functions called directly  | PASS       | `listUsers`, `getDashboardOverview`, `getRecentActivity`, `listCandidates`, `listVendors`, `listAccessRequests` refused with HTTP 403 |
| No background denials during normal use      | PASS       | No failed requests on the developer page                                                              |
| Writes (API keys, workflow settings)         | NOT TESTED | Not attempted on the live database                                                                    |
| Where L3 lands right after signing in        | NOT TESTED | The sign-in itself was done by the owner; `/dashboard` is denied for this role                        |

## Signed-in session as L2 (company super admin)

The owner signed in by hand; only reads were made. Expected permissions from
`src/lib/feature-access.ts`: every company feature, but not platform, developer or smart email.

| Area                                        | Status     | Evidence                                                                                                  |
| ------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| Menu shows only permitted features          | PASS       | 13 company links plus profile; no platform, developer or smart-email links                                |
| Permitted pages load                        | PASS       | dashboard, requirements, candidates, matching, tailoring, pipeline, interviews, clients, vendors, placements, recruiters, users, audit |
| Platform and other restricted pages by URL  | PASS       | `/platform`, `/tenants/new`, `/developer`, `/email-intelligence` → "Access denied"                        |
| Platform-only server functions              | PASS       | `listTenants` and `listAccessRequests` refused ("L1 - Owner privileges required")                         |
| Other restricted server functions           | PASS       | `getDeveloperConfig`, `listEmailAccounts` refused                                                         |
| Team list confined to own company           | PASS       | `listUsers` returned 8 users from 1 tenant and 0 platform accounts (the owner saw 11)                     |
| Writes (invite, role change, deactivate)    | NOT TESTED | Not attempted on the live database                                                                        |

Observation, not a defect: the L3 developer account does not appear in the L2 team list (roles
returned were admin, recruiter and super_admin). Confirm that is intended.

## Role coverage summary

| Role                     | Pages and menu | Server-side denial | Data scoping | Writes     |
| ------------------------ | -------------- | ------------------ | ------------ | ---------- |
| L1 platform owner        | PASS           | n/a (full access)  | PASS         | NOT TESTED |
| L2 company super admin   | PASS           | PASS               | PASS         | NOT TESTED |
| L3 developer admin       | PASS           | PASS               | n/a          | NOT TESTED |
| L4 recruiter             | PASS           | PASS               | PASS         | NOT TESTED |

# Audit, fixes and Redis cache — 2026-11-13

Scope: full-project audit, bug fixes, a Redis read cache, and verification. Everything below was
run on a Windows 11 workstation with Node 26 and npm 11. Nothing was run against the live Supabase
project; see "Not executed". The live Redis tests were added on 2026-11-14 once Docker was repaired.

## 1. Architecture discovered

- React 19 + TypeScript, TanStack Start/Router/Query, Vite 8, Tailwind 4, Radix/shadcn UI.
- 112 authenticated TanStack server functions in `src/lib/*.functions.ts` and
  `src/features/ai-matching/`; no separate REST API.
- Supabase Auth + Postgres with row-level security (73 migrations, 15,000 lines of SQL).
- Nitro build, Cloudflare Workers output by default, two daily scheduled tasks.
- Optional services: Qdrant + Ollama (RAG), a DOCX worker, OpenRouter/Lovable AI gateway,
  Gmail/Microsoft OAuth.
- No caching before this change other than React Query in the browser.

## 2. Issues found and what was done

| #   | Severity | Issue                                                                                      | Status                           |
| --- | -------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| 1   | High     | `SUPABASE_SECRET_KEY` required by code but absent from `.env`, `.env.example`, README      | Fixed (documented, placeholder)  |
| 2   | High     | `getUserRoles` silently retried with the service key, bypassing RLS                        | Fixed                            |
| 3   | Medium   | Audit-log insert errors were dropped without a log line                                    | Fixed                            |
| 4   | Medium   | `inviteUser` could leave an account with a tenant but no role                              | Fixed (rollback)                 |
| 5   | Medium   | `scheduleInterview` ignored a failed stage update and failed timeline insert               | Fixed (logged, see limits)       |
| 6   | Medium   | `updateInterview` ignored a failed timeline insert                                         | Fixed (logged)                   |
| 7   | Medium   | `createTenant` ignored a failed default `workflow_settings` insert                         | Fixed (logged)                   |
| 8   | Low      | Four unused dependencies: `@hookform/resolvers`, `@supabase/ssr`, `@vercel/analytics`, `postgres` | Removed                   |
| 9   | Low      | Each protected call makes 4–7 Supabase round trips before doing work                       | Open (see section 6)             |
| 10  | Low      | Client aborts are logged as `500 INTERNAL_ERROR` by `src/server.ts` in dev                  | Open                             |
| 11  | Low      | `master-mock-dataset.ts` + `tailoring-mock.ts` (1,970 lines) are imported by nothing       | Open (guarded by design)         |
| 12  | Low      | Document worker binds `0.0.0.0`                                                            | Open (token-protected)           |
| 13  | Low      | `bun.lock` no longer matches `package.json`                                                | Open (Bun not installed here)    |

Limits of fixes 5–7: the follow-up write failure is now logged with its error code, but the
server function still returns success. Making it fail would change behaviour that could not be
checked against the live database policies.

## 3. Files

Created:

- `src/lib/cache.server.ts` — Redis cache layer.
- `src/lib/cache.server.test.ts` — 9 unit tests.
- `scripts/smoke-redis.mts` — real-Redis integration check.
- `docker-compose.redis.yml` — local Redis.
- This report.

Modified:

- `src/integrations/supabase/auth-middleware.ts` — `tenantId` in context; cache invalidation.
- `src/lib/dashboard.functions.ts` — two aggregates read through the cache.
- `src/lib/rbac.server.ts`, `src/lib/audit.server.ts`, `src/lib/users.functions.ts`,
  `src/lib/interviews.functions.ts`, `src/lib/tenancy.functions.ts` — fixes 2–7.
- `package.json`, `package-lock.json` — `redis@6.3.1` added, four packages removed, new scripts.
- `.env.example`, `README.md`, `.env` (empty `SUPABASE_SECRET_KEY=` and `REDIS_URL=` lines only).

Removed: none.

## 4. Redis cache

Design:

- One lazily created `redis` client per server instance, reused across requests.
- Reconnects automatically with capped backoff; the offline queue is disabled so commands fail
  fast while disconnected.
- Every command has a 250 ms deadline.
- Any failure (unset URL, connection down, timeout, command error) falls back to the database.
- Production rejects a non-TLS `REDIS_URL` unless the host is loopback.
- Concurrent requests for one key share a single database read (stampede protection).
- Cached payloads are re-validated with the same zod schema as fresh ones.

Keys and TTLs:

| Key                                                              | TTL  | Content                         |
| ---------------------------------------------------------------- | ---- | ------------------------------- |
| `sx:v1:t:{tenantId}:u:{userId}:dashboard:overview`               | 60 s | `dashboard_overview` RPC result |
| `sx:v1:t:{tenantId}:u:{userId}:dashboard:candidate-assignment-kpis` | 60 s | `candidate_assignment_kpis` RPC |
| `sx:v1:t:{tenantId}:epoch`                                       | none | Tenant invalidation counter     |

Isolation: every data key contains both the tenant and the user, so an entry can only be read by
the user it was computed for. Callers without a tenant are never cached.

Invalidation: each entry records the tenant epoch it was read under. The auth middleware increments
the tenant epoch after every non-GET server function, which invalidates all of that tenant's
entries. A write that lands while a read is in flight leaves that read's entry already invalid.

Monitoring: each cached call emits `{"event":"cache","name":…,"result":"hit|miss|bypass"}`, and
`getCacheStats()` exposes in-process counters.

Deliberately not cached:

- Authentication, profile-active and role lookups: a deactivated user or revoked role must take
  effect on the next request.
- Signed avatar URLs, AI responses, candidate and resume data.

Known staleness: scheduled tasks and changes made directly in the database do not bump the epoch,
so dashboard numbers can lag those by up to 60 seconds.

## 5. Tests executed

| Check                                                    | Result                         |
| -------------------------------------------------------- | ------------------------------ |
| `npm run typecheck`                                      | Pass                           |
| `npm run lint`                                           | Pass                           |
| `npm test` (unit)                                        | 234 pass, 0 fail (was 225)     |
| `npm run security:static` (10 scans)                     | Pass                           |
| `npm run audit:dependencies`                             | Pass, 0 vulnerabilities        |
| `npm run build`                                          | Pass                           |
| Bundle scans (`service-role-bundle`, `auth-bypass-bundle`) | Pass                         |
| Redis code absent from browser bundle                    | Confirmed (0 files)            |
| Redis fallback against a closed port                     | Pass: 3 of 3 reads served by loader, no crash |
| Browser: `/`, `/auth` at desktop and 375 px              | Load, no console errors, no horizontal overflow |
| Browser: `/dashboard` signed out                         | Redirects to `/auth?redirect=/dashboard` |
| Live Redis 8 in Docker (`test:cache:integration`, 2026-11-14) | Pass: miss, hit (9.76 ms), per-user isolation, invalidation, TTL expiry |
| Live outage: Redis stopped then restarted mid-run        | Pass: served from loader in 3 ms while down, reconnected and cached again |

## 6. Not executed, and why

- **Redis on Cloudflare Workers**: `redis` uses TCP sockets. It was only run under Node. If it
  cannot connect on Workers the cache stays in bypass mode.
- **Any signed-in workflow** (CRUD, uploads, matching, role checks, password reset): needs real
  account credentials, which were not entered.
- **`test:e2e:roles`, `test:e2e:business`**: need `STAFFINIX_E2E_PASSWORD`.
- **Database RLS tests, query plans, index review**: need a database connection.
- **Load tests (k6)**: would have driven load at the production Supabase project.
- **Lighthouse / Core Web Vitals**: not run; no frontend code changed, so there is no before/after
  to compare.

## 7. Measurements

| Metric                         | Before    | After     |
| ------------------------------ | --------- | --------- |
| Client JavaScript (187 files)  | 3,149,970 bytes | 3,149,970 bytes |
| Server output                  | 10,189 KB | 11,538 KB |
| Unit tests                     | 225       | 234       |
| Installed packages (audited)   | 508       | 509       |

Client size is unchanged: heavy libraries (jsPDF, docx, charts) were already lazy-loaded or
route-split. The server grew by about 1.3 MB from the Redis client. No response-time or hit-ratio
numbers exist for real dashboard traffic: the live test used a synthetic key, not the application.

## 8. Recommendations not implemented

- Set a React Query `staleTime` default. Not done: 74 mutations but 53 `invalidateQueries` calls,
  so some screens may rely on refetch-on-mount for freshness.
- Remove the duplicate role queries between `authenticateRequest`, `requireFeatureAccess` and
  `requireAdminContext`.
- Delete the two mock fixture files together with their Vite alias and guard entries.

## 9. Configuration

```sh
# .env
SUPABASE_SECRET_KEY=sb_secret_...        # required for invites, audit logs, jobs
REDIS_URL=redis://127.0.0.1:6379         # optional; rediss:// in production

npm run redis:up                         # local Redis in Docker
npm run test:cache:integration           # verifies hit, miss, invalidation, TTL
```

Leave `REDIS_URL` empty to run without the cache.

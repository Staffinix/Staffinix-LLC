# Staffinix application security audit report

Date: 2026-09-30

Scope: local repository and isolated local Supabase/RAG services

Baseline commit: `c47cf14` on `main`

Final status: **PARTIALLY VERIFIED**

## 1. Executive summary

The repository was inspected as a TanStack Start application with React 19, TypeScript, Vite 8,
Supabase Auth/PostgreSQL/Storage, Qdrant, Ollama, a private document-processing worker, Tailwind,
Radix UI, Motion, and a Nitro/Cloudflare-style production output deployed through Vercel.

Confirmed weaknesses were fixed in place without replacing authentication, routing, business
features, or migration history. The largest changes are private tenant-aware avatar storage,
transactional AI usage limits, server-side work-email enforcement, safe URL/service-destination
validation, complete Qdrant pagination, browser security headers, stricter privileged inputs, and
CI/supply-chain controls.

Evidence includes 79 unit tests, 215 local PostgreSQL/pgTAP assertions, static analysis of 88 server
functions, a clean production build, clean dependency and secret scans, built-bundle boundary scans,
and a live end-to-end Ollama/Qdrant RAG test. Production OAuth, ClamAV, Vercel configuration, and
remote migrations were not exercised because this audit did not have authority to change production
or use external mailbox/provider credentials. The factual status is therefore PARTIALLY VERIFIED,
not “fully secure” or “production ready.”

## 2. Vulnerability register

No numerical CVSS scores are assigned because deployment exposure and production telemetry were not
available. Severity is based on demonstrated reachability and likely business impact.

| ID | Severity | Affected area | Confirmed issue and exploitation scenario | Fix and regression evidence | Status |
| --- | --- | --- | --- | --- | --- |
| STX-001 | High | `profile-avatars` storage and profile avatar handling | The avatar bucket was public. Anyone with an object URL could bypass tenant membership and retrieve user images; durable public URLs also persisted beyond membership changes. | Forward migration makes the bucket private, forces RLS, permits own-object writes and active same-tenant reads through a reviewed helper, and the server returns short-lived signed URLs from canonical references. Adversarial avatar tests pass. | Fixed locally |
| STX-002 | High | AI gateway, matching, tailoring, candidate parsing, JD parsing, and Copilot | Authenticated callers could repeatedly trigger expensive model work without an atomic tenant/user budget, creating cost and availability abuse. | Added `reserve_ai_usage`, private forced-RLS usage buckets, advisory transaction locks, per-user concurrency, minute/day/month user and tenant limits, and pre-execution reservation in every AI path. Unit and pgTAP quota tests pass. | Fixed locally |
| STX-003 | High | Dependency graph | The baseline contained vulnerable Wrangler/Miniflare/Undici dependencies, and final verification later detected a new high-severity `brace-expansion` denial-of-service advisory. | Updated compatible locked dependencies, pinned the Undici override, performed a clean `npm ci`, and reran build/tests. `npm audit --audit-level=low` reports zero vulnerabilities. | Fixed |
| STX-004 | Medium | Client, vendor, interview, tenancy, and submission links | Persisted user-controlled URLs could reach links without one canonical scheme check, enabling executable or malformed URL injection. | Central HTTP(S)-only normalization is applied before storage/rendering; executable, data, credential-bearing, and malformed cases are tested. | Fixed |
| STX-005 | Medium | Qdrant, Ollama, and document-worker destinations | Service URLs were not centrally constrained for scheme, credentials, and production cleartext, increasing SSRF/misdirection risk after environment compromise or misconfiguration. | Central server-only validator permits loopback HTTP for development, requires HTTPS remotely, rejects credentials/unsafe schemes, and fails closed when production configuration is missing. | Fixed |
| STX-006 | Medium | Qdrant synchronization | Point enumeration did not guarantee complete pagination, so stale document chunks could survive synchronization/deletion and later be retrieved. | Scroll processing now follows every offset page while preserving mandatory tenant filters. Static boundary checks and a live isolated RAG smoke test pass. | Fixed |
| STX-007 | Medium | HTTP response boundary | Production responses lacked one enforceable centralized set of CSP, anti-framing, MIME, referrer, permissions, and transport headers. | Added centralized headers with HTTP-safe HSTS behavior and trusted forwarded-protocol handling. Unit and production-preview runtime checks pass. | Fixed |
| STX-008 | Medium | Signup/login and Google OAuth | “Work email” was UI copy only. A consumer mailbox could obtain a Supabase session and rely solely on provisioning failure rather than an explicit email policy. | The server evaluates the verified Supabase user email against strict configured domains/exact exceptions before protected access. Signup rejects common public providers; four existing launch accounts are local/server-only configured exceptions. Tests and auth-bypass scans pass. | Fixed locally; deployment config required |
| STX-009 | Medium | Role, tenant, API-key, workflow, and access-request inputs | Some sensitive Zod objects accepted unknown properties, weakening the guarantee that only reviewed authorization fields cross the server boundary. | Privileged request schemas now use strict object parsing. Typecheck, lint, unit, static, and build suites pass. | Fixed |
| STX-010 | Low | Contact-form table | Contact data relied on RLS without `FORCE ROW LEVEL SECURITY`, leaving an avoidable owner-bypass condition in future execution contexts. | Forward migration forces RLS and the adversarial contact/Copilot/avatar test verifies effective behavior. | Fixed locally |
| STX-011 | Medium | CI and release process | There was no complete least-privilege automated gate for database tests, secret history, bundle boundaries, dependency audit, and security scripts. | Added pinned CI actions/Gitleaks, Dependabot, complete tests/build/audit/bundle gates, placeholder environment documentation, and immutable RAG image versions. | Fixed locally |

## 3. Implementation summary

### Configuration, dependencies, CI, and documentation

- `.env.example`: placeholder-only browser/server/RAG/document-worker/work-email configuration.
- `.github/dependabot.yml`: scheduled dependency updates.
- `.github/workflows/security.yml`: least-privilege install, lint, typecheck, unit/static/database tests,
  build, bundle checks, audit, and pinned secret scanning.
- `.gitleaks.toml`: narrow synthetic-test fixture exception without allowing real credentials.
- `.gitignore`: local Supabase branch/temp and environment-output hygiene.
- `README.md`: architecture, invariants, variables, local workflow, and production manual steps.
- `docker-compose.rag.yml`: explicitly versioned Qdrant/Ollama images.
- `eslint.config.js`: ignores generated local Supabase state.
- `package.json`, `package-lock.json`: reproducible commands and compatible security updates.
- `scripts/check-document-ai-boundaries.mjs`: expanded document/AI enforcement guard.
- `supabase/config.toml`: isolated local ports and current local SMTP configuration.
- `tasks/security-audit-checklist.md`: persistent executed/manual status ledger.
- `tasks/security-audit-report.md`: this evidence report.

### Authentication, HTTP, URL, storage, and service boundaries

- `src/integrations/supabase/auth-middleware.ts`: verified-user work-email enforcement.
- `src/routes/auth.tsx`: work-email signup validation and safe authentication feedback.
- `src/lib/work-email-policy.ts` and `.test.ts`: domain/exact-exception policy and regressions.
- `src/integrations/http/security-headers.ts` and `.test.ts`: centralized browser headers.
- `src/server.ts`: production response header integration.
- `src/lib/safe-url.ts` and `.test.ts`: HTTP(S)-only stored-link policy.
- `src/lib/server-service-url.ts` and `.test.ts`: server destination validation/fail-closed policy.
- `src/lib/profile-avatar.ts`, `.server.ts`, and `.test.ts`: canonical private references and signing.
- `src/routes/_authenticated/settings.profile.tsx`: private avatar upload/display workflow.
- `src/routes/_authenticated/bench.$id.tsx`, `platform.tsx`, and `submissions.$id.tsx`: safe rendered links/avatar resolution.

### Domain/server-function hardening

- `src/lib/access-requests.functions.ts`, `developer.functions.ts`, and `tenancy.functions.ts`:
  strict privileged schemas.
- `src/lib/candidates.functions.ts`, `requirements.functions.ts`, `matching.functions.ts`,
  `tailoring.functions.ts`, and `copilot.functions.ts`: AI quota reservations and boundary checks.
- `src/lib/clients.functions.ts`, `vendors.functions.ts`, and `interviews.functions.ts`: safe URL handling.
- `src/lib/profile.functions.ts`, `recruiters.functions.ts`, `users.functions.ts`, and
  `dashboard.functions.ts`: signed avatar resolution and private references.
- `src/lib/document-processing.server.ts`: validated private worker destination.
- `src/lib/rag.server.ts`: validated services, tenant filtering, and complete Qdrant pagination.
- `src/lib/ai-usage.server.ts` and `.test.ts`: quota/concurrency orchestration.
- `src/integrations/supabase/types.ts`: typed quota RPC.

### Forward database migrations and database tests

- `supabase/migrations/20260929152228_harden_profile_avatar_and_contact_storage.sql`: private avatar
  bucket, forced RLS, tenant-aware reads, own-only writes, and contact-table protection.
- `supabase/migrations/20260929201907_add_ai_usage_guardrails.sql`: private usage buckets and atomic
  `reserve_ai_usage` authorization/limit RPC.
- `supabase/tests/database/copilot_contact_avatar_security.test.sql`: avatar/contact/Copilot attacks.
- `supabase/tests/database/ai_usage_guardrails.test.sql`: identity, grants, RLS, and limit attacks.
- `candidate_creation_transaction.test.sql`, `resume_storage_authorization.test.sql`,
  `security_definer.test.sql`, and `tenant_isolation.test.sql`: repaired drift and expanded exact
  authorization/error assertions.

## 4. Security test results

### Passed

| Command/check | Actual result |
| --- | --- |
| `npm ci` | 498 packages installed from lockfile; completed successfully |
| `npm run typecheck` | Passed, no TypeScript errors |
| `npm run lint` | Passed, no ESLint errors |
| `npm run test:unit` | 79 tests passed across auth, headers, URL/service policy, RBAC, domain updates, worker, AI, and RAG |
| `npm run security:static` | All request-size, AI/document, projection, pagination, server-auth, bypass, production-fallback, service-key, and control checks passed |
| `npx supabase test db supabase/tests/database` | 10 files / 215 assertions passed on the isolated local database |
| `npm run test:rag:integration` | Live Ollama/Qdrant path passed; 2 chunks indexed, 2 retrieved, correct source and answer, smoke vectors removed |
| `npm run build` | Client, SSR, and server production outputs built successfully |
| `npm audit --audit-level=low` | Zero vulnerabilities after final lockfile remediation |
| `npm run security:auth-bypass-bundle` | Built browser authentication/credential scan passed |
| `npm run security:service-role-bundle` | Built browser service-role boundary scan passed |
| Gitleaks 8.30.1, Git-intended current files | Zero findings |
| Gitleaks 8.30.1, all 6 commits | Zero findings |
| Production preview header probes | CSP, permissions, referrer, nosniff, frame denial, and HTTPS-only HSTS behavior verified |
| `git diff --check` | Passed; no whitespace errors |

### Failed and fixed during the audit

- Existing SQL tests had drifted from the current role model, canonical resume paths, and PostgreSQL
  error text. Fixtures/assertions were corrected without weakening policies; all 215 now pass.
- The first work-email implementation embedded compatibility addresses and was rejected by the
  authentication-bypass guard. Exact exceptions were moved to ignored/server-only configuration.
- A final dependency audit discovered the new high-severity `brace-expansion` advisory. Compatible
  transitive versions were locked and the final audit is clean.

### Blocked/not run

- Live Google OAuth, external email verification/recovery delivery, and provider logout/revocation:
  requires the deployed Google/Supabase provider and a controlled external mailbox.
- Live ClamAV scan: no ClamAV daemon is configured in this workspace.
- `npm run test:e2e:roles` and `npm run test:e2e:business`: not run against the configured remote
  project because that would use supplied credentials and the business test performs writes; remote
  production mutation was expressly out of scope. Equivalent role, tenant, vendor/candidate,
  storage, and transaction behavior is covered by unit/pgTAP tests, but that is not a substitute for
  deployed browser E2E.
- Vercel preview/production smoke, rollback, and environment separation: no deployment mutation was
  authorized.

## 5. Database security report

- Tenant identity comes from verified `auth.uid()` → active profile/tenant mappings, never caller
  body fields. Server feature middleware reads current roles from trusted tables.
- Tenant isolation, role-source integrity, cross-tenant denial, resume paths, candidate graph
  transactions, dashboard aggregation, submission persistence, storage access, and reviewed
  SECURITY DEFINER functions are covered by 215 passing assertions.
- New privileged functions set fixed search paths, derive the caller, validate active membership,
  and expose execution only to `authenticated`. Underlying usage tables have RLS forced and direct
  table privileges revoked.
- Avatar objects are private. Writes use `<verified-user-id>/avatar`; reads require an active profile
  in the same tenant and application responses use signed URLs.
- The two new migrations have only been applied to the disposable isolated local database. They
  require review/backup/change approval before remote application.

## 6. AI/RAG security report

- Every model-backed business path reserves a hardcoded operation cost through the database before
  execution. Limits are 8 requests/user/minute and 80/tenant/minute, with 100k/1m daily and 2m/20m
  monthly user/tenant token-unit ceilings. A per-instance maximum of two concurrent AI tasks per user
  supplements the global database budgets.
- Gateway calls have deadlines, streamed byte ceilings, safe error mapping, and caller-provided Zod
  output schemas. Deterministic matching constraints remain authoritative; AI produces explanation
  assistance rather than permission or placement decisions.
- Qdrant ingestion/retrieval requires a tenant filter; scroll pagination is complete. Prompt context
  consists only of retrieved tenant chunks and normalized text. Temporary live-test points were
  deleted after verification.
- PDF/DOCX processing is isolated from the web process and tests reject spoofed magic bytes, active
  PDF JavaScript, traversal, decompression bombs, oversize payloads, malformed containers, and unsafe
  directional controls.
- Remaining risks: the concurrency semaphore is per application instance (the database budgets are
  global); reserved token units are conservative estimates rather than post-provider reconciliation;
  live ClamAV and deleted-production-document retrieval still require deployment-level E2E.

## 7. Secrets and dependency report

- No secret-shaped value was found in Git-intended current source or six-commit history after a
  narrow allowlist for one synthetic JWT parser fixture.
- The ignored local environment and generated local Supabase state contain expected credentials and
  were not treated as source. Their values were never printed in this report. Keep those paths
  ignored and rotate any credential if it has ever been shared outside an approved secret manager.
- Built client scans found no server secret/service-role credential or authentication bypass.
  Publishable Supabase keys are intentionally browser-visible and are not privileged secrets.
- Final dependency status: zero known npm vulnerabilities. Dependabot and CI audit gates were added.
- Recharts 2 emitted an upstream maintenance deprecation notice during clean install. It is not a
  reported vulnerability; a v3 migration should be planned separately and regression-tested rather
  than forced into this security patch.

## 8. Deployment checklist

Use secret-manager/Vercel values, never commit real values. Required placeholders:

```dotenv
VITE_SUPABASE_URL=https://project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me

AUTH_ALLOWED_WORK_EMAIL_DOMAINS=company.example
AUTH_EMAIL_ALLOWLIST=existing.exception@public-provider.example

LOVABLE_API_KEY=
DOCUMENT_PROCESSOR_URL=https://document-worker.internal.example
DOCUMENT_PROCESSOR_TOKEN=replace_with_at_least_32_random_characters
QDRANT_URL=https://qdrant.internal.example
QDRANT_API_KEY=
QDRANT_COLLECTION=staffinix_knowledge
OLLAMA_URL=https://ollama.internal.example
OLLAMA_EMBED_MODEL=embeddinggemma
OLLAMA_CHAT_MODEL=gemma3:4b
```

Before release:

1. Review and apply the two forward migrations through the approved Supabase migration workflow.
2. Configure strict production/preview work domains and add existing launch accounts as exact
   server-only exceptions; do not expose the exception list through a `VITE_` variable.
3. Configure a Supabase Before User Created work-email hook for pre-account-creation rejection and
   enable leaked-password protection.
4. Verify Google provider redirect URLs for every Vercel domain, then test signup, callback, refresh,
   recovery, logout, deactivation, and revocation with controlled accounts.
5. Configure private HTTPS Qdrant/Ollama/document-worker endpoints, strong worker token, Qdrant auth,
   ClamAV, network restrictions, health checks, retention, backups, and restore drills.
6. Keep production/preview Supabase projects and data separated. Run the CI gates, deployed smoke
   tests, security-header probes, and role matrix before promotion.
7. Record the prior Vercel deployment and database backup, define rollback owners, and verify rollback
   without reversing migration history.

## 9. Remaining risks and concrete next steps

1. **External auth lifecycle is unverified.** Configure provider/hook settings and execute controlled
   deployed tests for public-domain rejection, allowed-domain Google login, four exact exceptions,
   recovery, logout, refresh, disabled users, and revoked sessions.
2. **Production migrations are unapplied.** Review backups and run the two forward migrations first
   in an isolated preview project, rerun pgTAP and storage probes, then promote with approval.
3. **ClamAV is not live-tested.** Deploy the daemon on the private worker network and test clean,
   EICAR-style, unavailable-scanner, timeout, and fail-closed paths without using real malware.
4. **No deployed browser E2E was run.** Use dedicated non-production credentials/data to execute all
   role levels and business workflows, including candidate/vendor import-export, resume/avatar upload,
   Copilot/RAG, cross-tenant denial, and cleanup.
5. **Per-instance AI concurrency is not globally distributed.** Retain database quotas and, if
   production load requires it, add a durable distributed lease/queue with expiry and observability.
6. **Recharts 2 is maintenance-deprecated.** Plan a separately scoped v3 compatibility upgrade.

## 10. Final status

**PARTIALLY VERIFIED.** All repository-safe checks listed in this report passed, and all confirmed
issues that could be corrected safely in source were fixed with regression coverage. Production
OAuth/provider behavior, ClamAV, remote migrations, Vercel configuration, and deployed end-to-end
workflows remain manual/external verification gates. No production database, Git remote, GitHub
branch, or Vercel deployment was changed.

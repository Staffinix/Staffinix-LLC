# Staffinix security audit checklist

Updated: 2026-09-30

Status legend: `[x]` verified, `[ ]` pending, `[!]` manual/external, `[-]` not applicable.

## Baseline, authentication, and authorization

- [x] Inspect repository structure, manifests, routes, server functions, migrations, CI, and Git state.
- [x] Verify bearer tokens through Supabase and reject client-supplied identity fallbacks.
- [x] Verify all 88 protected server functions declare authentication or feature authorization.
- [x] Enforce active profiles and authorized work email at the verified server boundary.
- [x] Preserve the four consumer-domain launch accounts through an ignored local/server-only exact
      allowlist; no email exceptions are shipped to the browser bundle.
- [x] Validate internal redirects and immediately sign out authenticated but unprovisioned users.
- [x] Review role changes and privileged schemas; sensitive authorization inputs reject unknown keys.
- [x] Add adversarial unit/database tests for role escalation, cross-tenant access, and inactive users.
- [!] Configure matching `AUTH_ALLOWED_WORK_EMAIL_DOMAINS` and `AUTH_EMAIL_ALLOWLIST` values in each
      Vercel environment before releasing this change.
- [!] Enable an equivalent Supabase Before User Created hook if Auth-user creation itself must be
      rejected; protected application access is already denied without the hook.
- [!] Complete live Google OAuth, email verification/recovery, and logout checks in the deployed
      provider configuration. Automated tests do not possess an external Google mailbox.

## Multi-tenant database and storage

- [x] Reset a disposable isolated local Supabase database and apply every migration.
- [x] Execute 10 pgTAP files / 215 assertions covering RLS, grants, tenant isolation, role sources,
      SECURITY DEFINER functions, storage, transactions, and AI quotas.
- [x] Harden avatar storage from public to private, enforce own-only writes and tenant-member reads,
      and return signed URLs instead of durable public object URLs.
- [x] Force RLS on contact-form data and add adversarial contact/avatar/Copilot tests.
- [x] Review SECURITY DEFINER functions for fixed search paths, caller identity, tenant validation,
      least-privilege grants, and regression allowlists.
- [x] Use forward-only corrective migrations; no remote database was changed.

## Server, browser, uploads, and AI

- [x] Enforce the global 1 MiB request-body limit and retain CSRF middleware.
- [x] Validate stored and rendered user-controlled URLs; reject executable/malformed schemes.
- [x] Validate server service destinations and fail closed for missing/insecure production endpoints.
- [x] Add CSP, frame denial, MIME sniff protection, referrer policy, permissions policy, and HTTPS HSTS.
- [x] Verify those headers against a locally running production build.
- [x] Add hard AI deadlines, response byte ceilings, schema checks, per-user concurrency, and
      transactionally locked per-user/per-tenant minute/day/month quotas.
- [x] Ensure Qdrant search and ingestion always filter by tenant and paginate the full point set.
- [x] Run the live Ollama/Qdrant smoke path: chunk, embed, index, similarity search, retrieve, answer,
      then remove the isolated smoke-test vectors.
- [x] Test PDF/DOCX magic bytes, active-content rejection, traversal, zip bombs, size ceilings, and
      unsafe extracted-text controls at the private document-worker boundary.
- [!] Exercise the external ClamAV daemon in the target hosting environment; parser and rejection
      behavior are covered locally, but no ClamAV service is configured in this workspace.

## Supply chain and delivery

- [x] Reconcile a clean `npm ci` and resolve current advisories, including the late
      `brace-expansion` denial-of-service advisory; `npm audit` reports zero vulnerabilities.
- [x] Pin RAG container images to explicit reviewed versions.
- [x] Add least-privilege CI for install, lint, typecheck, tests, database tests, build, bundle scans,
      dependency audit, and pinned Gitleaks scanning.
- [x] Add Dependabot and placeholder-only environment documentation.
- [x] Scan Git-intended current files and all six repository commits with Gitleaks 8.30.1: zero leaks.
- [x] Scan the built client for authentication bypasses and service-role/secret credentials.
- [!] Apply environment variables, Supabase Auth dashboard settings, preview-data isolation, health
      checks, and rollback verification in Vercel. No deployment mutation was authorized here.

## Final verification

- [x] TypeScript, ESLint, complete unit suite, complete static-security suite, production build,
      database suite, live RAG integration, dependency audit, bundle scans, secret scans, and
      `git diff --check` all pass.
- [x] Keep remote databases, secrets, Git history, GitHub, and Vercel unchanged.

No production database change, credential rotation, Git commit/push/merge, or deployment was
performed by this audit.

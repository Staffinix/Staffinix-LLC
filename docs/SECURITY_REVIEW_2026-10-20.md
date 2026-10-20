# Staffinix security review — 2026-10-20

## Executive summary and scope

Baseline: local commit `a512d52`, branch `chore/codebase-organization`. This is a focused,
partially verified security assessment, not a line-by-line certification or a penetration
test of production. Remote changes since this commit are outside this assessment.

The application uses React 19, TanStack Start server functions, TypeScript, Vite/Nitro,
Supabase Auth/Postgres/Storage, OpenRouter (optional legacy gateway), Gmail/Microsoft OAuth,
Qdrant/Ollama and a separate Node document worker with ClamAV. No custom password hashing
is used: password storage and recovery belong to Supabase Auth.

Existing protections include caller-scoped database clients, verified Supabase users,
database-backed feature roles, tenant RLS migrations, strict privileged schemas, global
request limits, CSRF middleware, AI quota reservations, bounded provider responses,
canonical private upload paths, malware scanning, structured logs and pinned CI actions.

Two local hardening changes were made after read-only inspection: prevent caching of
sensitive dynamic responses and ignore common private credential files. No production
data, credentials, settings, database objects or infrastructure were changed. No release
was performed. Credential exposure previously present in this conversation remains an
urgent manual concern; current validity/revocation was not tested.

## Threat model

| Asset / trust boundary | Attacker and realistic attack | Impact / reviewed control |
| --- | --- | --- |
| Browser → authenticated server functions | Anonymous or low-privilege caller forges role, tenant or record ID | Candidate/mail disclosure or privilege escalation; reviewed authentication and feature middleware, role policy and static server-function scan |
| Caller-scoped Supabase → exposed tables/RPC/storage | Authenticated member bypasses UI and calls Data API directly | Cross-tenant reads/writes; reviewed migrations and adversarial SQL tests, but did not rerun them or verify current live policies |
| Upload → document worker → scanner | Malicious PDF/DOCX with active content or excessive decompression | Parser compromise or denial of service; separate constrained worker, type/size/path/hash checks and synthetic tests |
| Server → AI/mail/RAG providers | Malicious document instructions, provider URLs, repeated expensive work | Data disclosure and cost abuse; schema-bound output, provider paging limits, destination checks, AI usage reservation |
| Dynamic response → browser/CDN | Cache stores authenticated content or a session-setting response | Exposure on reused clients or misconfigured shared caches; fixed outer response policy |
| Developer/CI → repository/build | Secret committed or dependency compromised | Provider misuse or supply-chain compromise; history scan, bundle scans, lockfile audit and read-only CI permissions |

## Findings

| ID | Severity | Location | Vulnerability / impact | Status and evidence |
| --- | --- | --- | --- | --- |
| SEC-01 | Medium | `src/integrations/http/security-headers.ts` | Outer boundary preserved cache directives on credential-bearing responses and did not require `no-store`. An inner handler or proxy configuration could make sensitive content cacheable. Actual production cache exposure was not demonstrated. | Fixed locally: `private, no-store` on browser and CDN headers for Authorization/Cookie requests, session-setting responses, HTML and mutations. Two regression tests failed before the fix; all six header tests passed afterwards. Public static asset caching is preserved. |
| SEC-02 | Low | `.gitignore` | Common private-key/certificate files were not ignored. A developer could accidentally stage a new credential file. No tracked private-key file was found by the filename inventory. | Fixed locally: ignore PEM/KEY/P12/PFX and `credentials.json`; restore the final `.env.example` exception. Ignore rules do not remove files already tracked or replace secret scanning. |
| SEC-03 | High if credentials remain active | Google OAuth and OpenRouter account credentials previously pasted into this chat | Anyone with access to those disclosed credentials may misuse the integrations or incur AI charges, subject to provider restrictions. Repository scans cannot establish whether disclosed credentials were revoked. | Manual action required: revoke/replace exposed credentials through providers, update authorized secret stores and verify integrations. Do not paste replacements into chat. No credential rotation attempted. |
| SEC-04 | Medium, accepted dependency risk | `mammoth` → `argparse` → `sprintf-js` | Existing unpatched advisory GHSA-hp3w-g68c-fv3c remains in the dependency graph. Existing audit gate limits its exception to this advisory; the application uses extraction in the constrained document worker, not Mammoth's CLI. | Not fixed; dependency audit reports the documented exception. Re-evaluate when a compatible patch becomes available. No blanket audit suppression or indiscriminate upgrade added. |
| SEC-05 | Low, defense-in-depth limitation | CSP in `security-headers.ts` | Script policy uses `unsafe-inline` for TanStack hydration. It cannot block injected inline scripts if a separate HTML injection bug exists. No exploitable HTML injection was demonstrated in this review. | Remaining limitation: nonce/hash-based hydration needs framework integration and browser verification; not changed speculatively. |

## Changes

- `src/integrations/http/security-headers.ts`: outer no-store enforcement; preserve and
  extend `Vary` without replacing an existing wildcard. Anonymous static assets retain
  explicit immutable cache settings. No authentication, CORS or database permissions changed.
- `src/integrations/http/security-headers.test.ts`: authenticated/CDN cache regression,
  HTML/mutation/session-setting checks, static-cache preservation and Vary handling.
- `.gitignore`: defensive credential-file patterns and explicit sample-env exception.
- This report: scope, threat model, findings, verification and controlled-release checklist.

## Verification record

Executed and observed:

- `npm run audit:dependencies`: passed with the existing moderate advisory exception;
  not a zero-vulnerability result.
- `npm run security:static`: passed, including 109 server functions and explicit database
  projection, request size, mock fallback, privileged-key and interactive-control checks.
- `npm run test:unit`: passed; synthetic auth/role, URL, upload, provider, AI guard and
  application tests. Final targeted header suite: 7 tests passed.
- Gitleaks 8.30.1 `git --redact --no-banner --log-opts='--all' .`: 57 local commits scanned,
  no findings. This is local history only; not proof that every remote ref is secret-free.
- Working-tree Gitleaks directory scan: one finding in `auth-header.test.ts:6`, manually
  verified as the synthetic JWT parser fixture with literal `signature`, not a usable
  signing credential. Reported transparently, not counted as a clean directory scan.
- `npm run lint` and `npm run build`: passed. Initial typecheck caught a new test-only
  HeadersInit union error; the fixture was corrected and `npm run typecheck` then passed.
- `npm run security:auth-bypass-bundle` and `npm run security:service-role-bundle`: passed
  against the newly built output. `git diff --check`: passed.
- Git ignore checks confirmed environment/private-key examples are ignored and
  `.env.example` is not ignored.

Blocked/not run:

- Docker daemon unavailable (`docker ps` failed), so the 16 SQL regression files were
  inspected as source but not executed. No claim of current runtime RLS test success.
- Production Supabase security advisor request denied permission. Current grants, exposed
  schemas, RLS, storage bucket privacy and deployed migration parity remain unverified.
- No production attacks or real-user data reads. No login/recovery email delivery,
  session revocation, MFA enforcement, CAPTCHA, login throttling, actual proxy CORS/TLS,
  cache behavior or browser upload/ClamAV integration verification.
- No assurance that all functions/tables have been manually exhaustively reviewed.
  Static checks and selected source tracing are not equivalent to that assessment.
- Full distributed rate limiting for non-AI application operations is not established.
  Existing AI quotas do not prove login or general API abuse protection.
- Provider SDK browser sessions are not an HttpOnly cookie architecture; XSS prevention
  remains important. Logout and privileged MFA settings require runtime/provider review.

## Controlled deployment checklist

1. Resolve SEC-03 first. Rotate only the exposed provider credentials with owner approval;
   changing the email encryption key without a re-encryption plan can make stored tokens
   unreadable. Back up configuration through an approved secret manager, never Git.
2. Review the patch and CI results on the exact release commit. Run typecheck, lint,
   unit/static checks, production build, browser credential bundle checks and Gitleaks.
3. Start isolated Supabase/Docker and run all database tests before declaring DB verification
   complete. No migration is introduced by this patch; do not reset or replay production DB.
4. Obtain read-only production access to verify active RLS, grants, private buckets,
   auth redirect allowlists, password protection, throttling/CAPTCHA and privileged MFA.
5. Keep browser configuration limited to `VITE_SUPABASE_URL` and the publishable key.
   Keep server Supabase configuration, provider secrets, worker token, AI key and email
   encryption key server-only. No new environment variables are needed for this patch.
6. Deploy a reviewed preview and test login, recovery, candidate reads, uploads and exports
   with synthetic accounts. Check browser/CDN no-store headers on success and error paths;
   verify anonymous hashed assets still cache. Confirm HTTPS and intended HSTS domain scope.
7. Promote through the existing Staffinix release process only after approval. Retain a
   known-good deployment for rollback; this patch has no data conversion to reverse.
8. Check redacted request/audit logs and configure owner-visible alerts for repeated
   denials, auth abuse, AI spend and worker failures. Production alerting is not verified.

## Final verdict

### Follow-up remediation

The cache policy and credential-file ignore protections remain in the working tree.
Follow-up changes replace script `unsafe-inline` with a fresh 192-bit CSP nonce and
propagate it through TanStack's router SSR nonce option. The outer server overwrites
the internal nonce header, so clients cannot choose it. Hydration reads the matching
framework-generated meta tag; error pages use a plain retry link without inline JS.
Styles retain `unsafe-inline` because Radix/React require style attributes.

A scoped Mammoth override selects argparse 2.0.1 to remove sprintf-js. The old
advisory exception is removed from the audit gate. The follow-up status supersedes
the original SEC-04/SEC-05 entries above: both are fixed locally, not deployed.

Follow-up verification actually executed:

- `npm ci --ignore-scripts`: passed, 507 packages installed, zero vulnerabilities.
  An initial overlapping build/install caused a Windows file lock and missing-module
  error; after both processes finished, a sequential clean install and build passed.
- `npm run typecheck`, `npm run lint`, `npm run test:unit`,
  `npm run security:static`, `npm run audit:dependencies`, `npm run build`,
  both authentication/privileged-key bundle scans and `git diff --check`: passed.
- Header suite: 8 tests passed, including fresh nonce generation and malformed-nonce
  rejection. Existing nine document-worker tests passed, including actual inert DOCX
  extraction, traversal/zip-bomb and active-content rejection.
- `node node_modules/mammoth/bin/mammoth --help`: passed with argparse 2.0.1.
  `npm ls argparse sprintf-js` confirms the scoped override and no sprintf-js.
- Local built-worker HTTP probe at `/auth`: HTTP 200, three inline scripts all had
  the CSP nonce, the framework nonce meta tag matched, script policy had no
  `unsafe-inline`, client-supplied nonce was overwritten, and no-store remained.
  This is HTTP/HTML verification, not an interactive browser or logged-in flow test.
- Wrangler initially rejected the generated current compatibility date; using the
  repository preview script's supported `2026-08-31` date allowed the worker to start.

Manual credential replacement steps (owner action):

1. Revoke the previously disclosed OpenRouter key in its key dashboard and create a
   replacement with appropriate budget limits. Store it directly as server-only
   `OPENROUTER_API_KEY` in the authorized environment/secret manager.
2. Replace the disclosed Google OAuth client secret in Google Cloud's OAuth client
   settings; update server-only `GOOGLE_CLIENT_SECRET`. Keep the intended client ID
   and registered callback URI consistent. Verify connection with a synthetic mailbox
   before retiring any transitional configuration.
3. Never rotate `EMAIL_TOKEN_ENCRYPTION_KEY` as a substitute for revoking provider
   credentials. Existing encrypted mailbox tokens need the original key unless a
   separately reviewed re-encryption/reconnection plan is performed.
4. Confirm revoked credentials no longer work through provider-controlled tools,
   without sending their values to chat, logs, command arguments or Git.

External requirements cannot be solved by editing application source:

- SEC-03: the account owner must revoke/replace exposed Google/OpenRouter credentials.
  This request does not supply safe provider access or authorize selecting replacements.
- Install/start Docker Desktop to run isolated database tests; Docker is currently
  unavailable and its normal installation path is absent.
- Restore read-only Supabase advisor access to verify current production policies.
- Verify actual login/recovery/MFA, provider revocation, proxy configuration and
  monitoring with synthetic accounts. No passwords or replacement keys should be
  shared through chat.

No production infrastructure changes, credential rotation or release are included.

**High-risk issues remain if the previously exposed credentials are still active.**
Their revocation is unverified. No new critical/high code vulnerability was confirmed in
this focused source review, but live database, authentication and browser verification
are incomplete. Not a statement of complete security or compliance.

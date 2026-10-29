# Staffinix audit — 28 October 2026

Update: see [Remaining-issue fixes](FOLLOW-UP.md) for the subsequent implementation, migrations, and current limits. The metrics below describe the first audit patch.

## A. Executive summary

Local audit and fixes against baseline commit `2f01da7`. No push, deployment, production write, schema change, or dependency upgrade was performed. The attachment explicitly says: “Do not deploy without explicit approval.”

The fixes reduce unnecessary candidate-profile requests and data, prevent cached private data from surviving account changes, restore editing/filtering of assigned requirements, and repair the quality gates. This is not a claim that every possible defect has been eliminated. Database-dependent defects and authenticated performance verification remain open below.

Architecture: React 19.2.7, Vite 8.3.5, TanStack Start 1.168.61 / Router 1.170.42, React Query, Supabase JS 2.112.3, Nitro's Vercel preset. Authenticated routes use client rendering (`ssr:false`). JWT/feature authorization and Supabase RLS remain in place. No private response caching was introduced.

### Ranked findings fixed

| Priority | Evidence / affected files | Fix and expected effect | Confidence / risk |
|---|---|---|---|
| 1 | `src/routes/__root.tsx` invalidated queries on sign-in but did not clear them on cross-tab sign-out. `me` and candidate caches were not identity-scoped. | Clear queries and mutations on sign-out/account change. Avoid redundant invalidation on same-user sign-in/focus. Tests cover late request completion. | High; security-sensitive, regression tests added. |
| 2 | `src/lib/candidates.functions.ts` fetched extracted text and up to 100 generated versions for a profile that displays neither. | Add an explicit profile projection, omit extracted text in the database select, skip the versions query. Preserve full data for editing/tailoring and isolate cache keys. | High; low UI risk, types and production build checked. |
| 3 | `src/routes/_authenticated/candidates.$id.tsx` fetched eligible recruiters before opening the assignment dialog. | Load choices only while the dialog is open. | High; low risk. Authenticated visual verification pending. |
| 4 | `eslint.config.js` included generated `.vercel` output; lint baseline did not complete before interruption. `check-list-endpoint-bounds.mjs` expected the obsolete 50-resume limit. Bundle scanners only understood Cloudflare output. | Exclude generated Vercel files; assert one primary resume; permit an explicit client-bundle directory. Fix existing formatting errors. | High; all affected gates now pass. |
| 5 | Assignment endpoints persist `assigned`, but UI/server requirement status lists only accepted open/closed/expired. | Use one shared status list including assigned, with a label/style and test against all database enum values. | High; low risk; no schema change. |

### Module coverage

Automated checks cover 112 server-function authorization boundaries and the production source tree. The route inventory contains 47 authenticated route files. “Reviewed” here means the stated code paths/checks, not a signed-in end-to-end test of every screen.

| Module group | Review / outcome |
|---|---|
| Login, session, profile, app shell | Verified-user provider, query-cache lifecycle, route gates, scrolling and navigation tests; fixed identity cache cleanup. |
| Candidates and bench | List filters/bounds, detail projections, child data, primary resume and management requests; optimized detail loading. Candidate form/update/search tests pass. |
| Resume upload, extraction, storage | Size/path/type validation, PDF/DOCX processing, original deletion and cleanup tests; storage transaction/retry gaps remain below. |
| Tailoring and exports | Source verification, fact selection, usage limits, gateway timeout/error handling. PDF/DOCX export imports already lazy. No provider call or credit spend in this audit. |
| Requirements | List/detail/create/update/assignment, required form validation, edit hydration and shared statuses. Assigned-state bug fixed; contact persistence/atomicity remain below. |
| Clients and vendors | Paged lists, lookup/export bounds and relationship enrichment; vendor CSV tests pass. Large lookup/export completeness remains a scale concern. |
| Submissions, pipeline, interviews, placements | Authorization/bounds scans and submission evidence/stage tests pass. No production records created or moved. |
| Dashboard and overview | Server aggregation guard passes; reviewed route bundles. Chart code remains a substantial route dependency. |
| Matching | Candidate matching, visa filter, email-match input and fact-selection tests pass. No external model benchmark. |
| Email intelligence and email settings | Provider timeout paths, incremental sync cursors, rule validation, filters and token encryption tests pass. No live mailbox sync or message sent. |
| Copilot and RAG | Copilot count and RAG tests pass; drawer already lazy-loads its panel. No live model/vector-store integration test. |
| Recruiters, users, company, tenants, platform, access requests, developer tools | Server authorization scan and RBAC/platform policy tests pass. No privilege changes or API keys created. |
| Build, delivery, dependencies | Production Vercel build, lint, typecheck, static and client-bundle security scans; dependency audit has zero reported vulnerabilities. |

## B. Before-and-after results

Environment: same Windows checkout, Node 24.19.0, same lockfile and Vercel build preset. Baseline client artifacts came from the successful build of unchanged commit `2f01da7`; final artifacts were rebuilt after the fixes. Both are measured by `scripts/measure-client-bundles.mjs`, using Node gzip defaults.

| Measurement | Before | After | Interpretation |
|---|---:|---:|---|
| Candidate detail table reads, excluding auth/management | 8 | 7 | 12.5% fewer for profile mode; static query-path count, not latency. |
| Initial candidate-page server calls for L2, assignment dialog closed | 3 | 2 | 33.3% fewer; excludes shared shell/auth requests. |
| Generated versions queried for profile | Up to 100 | 0 | Full-mode tailoring/edit behavior retained. |
| Extracted-text content requested for profile | Included | Omitted | Aggregate read-only DB observation: 25 primary resumes, 11,047 text bytes total, maximum 2,468 bytes. Not a per-page payload measurement. There were zero generated versions at observation time. |
| All JS chunks, summed gzip bytes | 964,999 | 965,191 | +192 bytes (+0.020%); includes deferred exports, not initial transfer. |
| Candidate detail static import closure, gzip bytes | 291,960 | 292,099 | +139 bytes (+0.048%). Correctness improvements did not reduce JS size. |
| All CSS gzip bytes | 20,958 | 20,958 | Unchanged. |
| JS chunk count | 187 | 187 | Unchanged. |
| Unit tests | 210 pass | 214 pass | Four regression tests added. |
| Static security suite | Fails stale list-bound assertion | Pass | One-primary-resume expectation repaired. |
| Lint | Initial whole-tree run interrupted; source-only run exposed 25 formatting errors | 0 errors, 1 existing warning | Remaining warning is test-double `any` in original-resume deletion test. |
| npm audit vulnerabilities | 0 | Same dependency tree | No packages added or upgraded. |

The bundle script follows static relative imports only. It excludes dynamic imports and is not a browser waterfall. It must not be presented as LCP, INP, actual initial download, or total route execution cost. Detailed measurements are in the adjacent JSON files.

Live read-only HTTP observations (current production, unchanged by this work): unauthenticated candidate URL returned HTTP 200, 8,969-byte HTML, TTFB 0.793 s and total 0.796 s in one sample. HTML has `private, no-store`, CSP and authorization/cookie Vary headers. A content-hashed JS asset returned gzip and `public, max-age=31536000, immutable`; its one-sample TTFB was 0.447 s. These are single workstation observations, not p95 results or authenticated candidate render times. Response routing identified `bom1::iad1`; this alone is insufficient to recommend relocating the backend.

**Unavailable:** Lighthouse desktop/mobile, authenticated LCP/INP/CLS, p75 field data, authenticated API p95, React profiler traces and visual/responsive interaction checks. Browser access was disabled. Production was not modified, so there is no production before/after performance comparison. The 200 KB initial-JS goal and CWV targets are not demonstrated as achieved.

## C. File-by-file changes

| File | Change |
|---|---|
| `src/lib/auth-query-cache.ts` | Central auth-event cache handling; clears identity data, preserves same-user fresh caches, invalidates user edits. |
| `src/lib/auth-query-cache.test.ts` | Tests cross-tab sign-out/account switch, same-user/token events, and late request cancellation. |
| `src/routes/__root.tsx` | Connects the auth listener to the tested cache handler. |
| `src/lib/candidates.functions.ts` | Profile projection skips extracted text and generated versions; keeps full mode as default and returns a stable nullable text field. Also formats preexisting lines. |
| `src/routes/_authenticated/candidates.$id.tsx` | Uses profile mode and a separate query key; defers recruiter lookup until the assignment dialog opens. Existing prefix invalidations still refresh both query variants. |
| `src/lib/requirements-constants.ts` | Adds database-supported assigned status, label and styling. |
| `src/lib/requirements.functions.ts` | Uses the shared status list for server validation. |
| `src/lib/requirement-edit.test.ts` | Checks every stored database status is accepted and has presentation labels/styles. |
| `eslint.config.js` | Excludes generated Vercel output. |
| `package.json` | Includes auth cache regressions in the existing auth test command. No dependency changes. |
| `scripts/check-list-endpoint-bounds.mjs` | Checks primary-resume filtering and limit 1 rather than obsolete limit 50. |
| `scripts/check-auth-bypass.mjs` | Accepts `CLIENT_BUNDLE_DIR`, retaining Cloudflare as default. |
| `scripts/check-service-role-boundary.mjs` | Same explicit output-directory support and accurate missing-output error. |
| `scripts/measure-client-bundles.mjs` | Reproducible gzip inventory/static-import measurement with a parser self-check. |
| `scripts/check-document-ai-boundaries.mjs` | Formatting-only lint correction. |
| `scripts/test-local-document-processor.mjs` | Formatting-only lint correction. |
| `src/lib/candidate-resume-cleanup.server.test.ts` | Formatting-only lint correction. |
| `src/lib/document-processing.server.test.ts` | Formatting-only lint correction. |
| `src/routes/_authenticated/tailoring.tsx` | Formatting-only lint correction. |
| `docs/audits/2026-10-28/REPORT.md` | This report, validation results and deployment instructions. |
| `docs/audits/2026-10-28/baseline-bundles.json` | Baseline artifact measurements. |
| `docs/audits/2026-10-28/final-bundles.json` | Final artifact measurements. |
| `docs/audits/2026-10-28/baseline-dependencies.json` | npm audit evidence. |
| `docs/audits/2026-10-28/baseline-outdated.json` | Installed/wanted/latest dependency inventory. |

## D. Validation

- `npm run test:unit`: 214 passed, zero failures/skips.
- `npm run typecheck`: passed after fixing issues caught during implementation.
- `npm run lint`: passed, zero errors and one existing test-double warning.
- `npm run security:static`: passed, including server authorization, explicit selects, document boundaries, bounded lists, mock/fallback guards and interactive-control checks.
- `$env:NITRO_PRESET='vercel'; npm run build`: passed. Existing bundler notices include module directives and plugin timing warnings; they are not evidence of runtime failures.
- `$env:CLIENT_BUNDLE_DIR='.vercel/output/static'; npm run security:auth-bypass-bundle`: passed.
- Same directory plus `npm run security:service-role-bundle`: passed; no forbidden privileged-key/server-client markers found.
- `npm audit --json`: zero reported vulnerabilities. `npm outdated --json` identifies updates but is not itself a vulnerability finding. Framework/dependency upgrades were deferred because no compatibility/performance defect justified widening this patch.
- `node scripts/measure-client-bundles.mjs`: passed its parser self-check; baseline/final JSON recorded.
- Read-only production SQL returned aggregate text sizes/counts only. No row contents, credentials or personal contact data were recorded in the report.
- Database/RLS integration suite and authenticated browser E2E were **not run**. The running local Supabase stack belongs to a sibling checkout; it was not reset or modified. This patch contains no migrations.

## E. Remaining defects and bottlenecks

1. **Requirement vendor contact fields are not persisted (high confidence).** `requirement-form.tsx` submits `vendor_email`/`vendor_contact`; `RequirementInputSchema` does not include them, and the requirement table has no corresponding fields. The edit route does not hydrate these fields. Decide whether they are requirement-specific snapshots or edits to the shared vendor before adding a migration/transaction and regression coverage. Changing a vendor globally without that decision could alter other requirements.
2. **Requirement/skill saves are not atomic (high confidence).** `createRequirement` inserts the parent then skills; `updateRequirement` updates the parent, deletes old skills, then inserts new ones. A failure can leave partial data. Needs a tenant-authorized transactional RPC with failure-path database tests, followed by approved migration deployment.
3. **Resume metadata and Storage writes are separate (high confidence).** Candidate graph creation may succeed before final storage upload fails; deletion cleanup can return pending without a durable retry record. A database-backed finalize/retry workflow should preserve recoverability. No destructive cleanup was attempted.
4. **Required detail fields are stricter in the UI than in server schemas.** Non-form callers can bypass some mandatory-field rules. Tightening shared schemas must account for AI import/partial update workflows; use distinct draft/complete validation deliberately and test both.
5. **Vendor picker/export scale limits.** `listVendorsLite` lacks explicit pagination; Supabase's response cap can truncate choices. Export hard-caps 5,000. Add searched pagination and an explicit export completion contract before larger tenant volumes.
6. **Candidate/detail auth waterfalls and shared shell costs remain.** Parent authorization/not-found lookup still precedes child queries. Avoiding that phase should be measured with authenticated traces before changing access behavior. Shared motion and dashboard chart chunks remain substantial; PDF/DOCX exports and Copilot are already lazy.
7. **AI generation depends on provider billing/configuration and source verification.** Existing timeout and sanitized errors were reviewed, but this audit cannot verify a funded provider account or successful generation. No key replacement or charge was made.

No database indexes, caching service, framework migration, proxy, or region change was introduced without supporting measurements. Historical/live security-advisor configuration warnings are not claimed resolved by a source-code audit.

## F. Exact validation and preview deployment instructions

Run from this repository in PowerShell. These are instructions, not commands already deployed:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run security:static
$env:NITRO_PRESET = 'vercel'
npm run build
$env:CLIENT_BUNDLE_DIR = '.vercel/output/static'
npm run security:auth-bypass-bundle
npm run security:service-role-bundle
node scripts/measure-client-bundles.mjs
```

After explicit approval for a preview, use the verified CLI project's identity. First ensure Preview environment variables use an isolated test database and suitable provider credentials; do not run mutation smoke tests against production data.

```powershell
npx --yes vercel pull --yes --environment=preview --project prj_5UwvtAjuR2Pxez12LdscTPFsoXxC --scope staffinixllc
$env:NITRO_PRESET = 'vercel'
npx --yes vercel build --scope staffinixllc
$env:CLIENT_BUNDLE_DIR = '.vercel/output/static'
npm run security:auth-bypass-bundle
npm run security:service-role-bundle
npx --yes vercel deploy --prebuilt --environment=preview --project prj_5UwvtAjuR2Pxez12LdscTPFsoXxC --scope staffinixllc
```

Do not pass `--prod`, promote the deployment, or push this checkout to main: main triggers production automation. Preview credential access may require the account owner because earlier environment pulls returned sensitive-value placeholders.

Preview checks: sign in as representative roles; load the candidate route directly; view/edit/tailor the same candidate; open assignment dialog; verify recruiter options; sign out in another tab and switch accounts; confirm old data is gone; assign/edit/filter a requirement with assigned status. Test mobile layout, keyboard navigation and reduced motion. Then record three reproducible mobile/desktop Lighthouse runs and an authenticated network trace under the same cache/throttling conditions.

## G. Next actions

1. Approve an isolated preview and enable browser access, then verify the complete authenticated flows and measure runtime performance (high value, moderate effort).
2. Decide vendor-contact ownership; prepare/test atomic requirement persistence and resume finalization migrations (high correctness value, higher effort).
3. Implement paginated vendor search/export with large-tenant fixtures (moderate value, moderate effort).
4. Profile shared motion/dashboard charts and actual main-thread work before changing bundles; retain already lazy exports (measurement-dependent value).
5. Apply selected dependency updates in a separate compatibility-tested patch if release notes or security findings justify them. No major-version update is needed to deliver these fixes.

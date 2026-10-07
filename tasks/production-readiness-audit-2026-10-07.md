# Staffinix production-readiness audit

Date: 2026-10-07

Status: **NOT READY**

## Executive summary

The current application compiles and its repository-safe unit, authorization, input-validation,
document-processing, email, RAG, and static-security checks pass. The production dependency graph no
longer contains known high or critical advisories after compatible transitive updates and a reviewed
`sharp` patch override.

Release remains blocked because the pending L2-to-L4 candidate-assignment migration has not been
executed against an isolated database, its pgTAP suite could not run while Docker Desktop was
offline, and live L1-L4/OAuth/email workflows could not run without dedicated E2E configuration.
The remote migration was inspected with `supabase db push --linked --dry-run`; it was not applied.

## Findings

### PR-001 - Critical - fixed

- Affected: `package-lock.json`, TanStack Router/Start transitive dependency graph.
- Problem: `seroval 1.5.5` was affected by callable-assimilation and memory-exhaustion advisories.
- Root cause: the compatible patched transitive version had not yet been locked.
- Impact: unsafe deserialization or availability impact in reachable framework serialization paths.
- Fix: updated the lockfile to `seroval 1.6.8`.
- Evidence: clean install, typecheck, lint, 95 unit tests, security suite, and production build pass.

### PR-002 - High - fixed

- Affected: `package-lock.json`, Vite/Tailwind and jsPDF transitive dependencies.
- Problem: vulnerable `source-map-js` and DOMPurify versions were locked.
- Fix: updated to `source-map-js 1.2.2` and DOMPurify `3.4.16` through compatible lock updates.
- Evidence: high/critical npm audit gate and production build pass.

### PR-003 - High - fixed

- Affected: `package.json`, `package-lock.json`, Wrangler/Miniflare development toolchain.
- Problem: current Wrangler pins `sharp 0.35.4`, affected by CVE-2026-96889.
- Fix: added an npm override for API-compatible `sharp 0.35.5`.
- Evidence: `npm ls` resolves `sharp 0.35.5`; clean install and full build pass.

### PR-004 - Moderate - accepted residual risk

- Affected: Mammoth -> argparse -> sprintf-js.
- Problem: npm reports an unbounded-precision denial-of-service advisory in `sprintf-js`.
- Reachability: Staffinix dynamically imports Mammoth only for `extractRawText`; the affected
  Mammoth CLI parser is not invoked by the application or worker.
- Decision: do not use npm's forced remediation because it downgrades Mammoth from 1.12.1 to 0.3.29
  and risks the security-reviewed DOCX extraction path.
- Follow-up: replace or upgrade when Mammoth publishes a non-breaking dependency correction.

### PR-005 - P1 - blocked

- Affected: `supabase/migrations/20261001163020_add_candidate_assignment_management.sql` and its
  database tests.
- Problem: the migration and adversarial L2/L4 RLS tests have not run on a disposable database in
  this audit session.
- Root cause: Docker Desktop/PostgreSQL is unavailable.
- Impact: assignment, reassignment, optimistic status updates, and recruiter-only visibility are not
  execution-verified at the database boundary.
- Evidence: linked dry-run passes and reports exactly this one pending migration; no remote change.

### PR-006 - P1 - blocked

- Affected: deployed authentication, role matrix, Google OAuth, Gmail/Microsoft OAuth, storage, and
  business workflows.
- Problem: live E2E variables and dedicated test accounts are not configured in this shell.
- Impact: deployed session expiry, provider callbacks, role access, and cross-tenant denial remain
  unverified in the target environment.

### PR-007 - P2 - warning

- Recharts 2 is maintenance-deprecated and `tsconfck` is unmaintained.
- Both are upstream maintenance warnings, not current vulnerability findings.
- Upgrade Recharts separately because v3 is a behavioral migration; `tsconfck` is retained as a peer
  of the current Lovable Vite configuration.

### PR-008 - P3 - repository hygiene

- `My-Version` is a tracked gitlink without a `.gitmodules` mapping while `.gitignore` calls it a
  legacy local copy. Fresh clones cannot initialize it as a normal submodule.
- Remove the gitlink in a dedicated repository-cleanup change after confirming the local nested
  checkout contains no unique work.

## Ponytail audit

Ponytail is not installed as an application runtime package and no Ponytail API is imported. It was
used only as the external, report-only repository audit requested by the user.

1. delete: 21 unreferenced generated UI wrappers. Replacement: nothing; retain only wrappers imported by routes/components. [`src/components/ui`]
2. delete: unused direct dependencies (`@hookform/resolvers`, `@supabase/ssr`, `@vercel/analytics`, `jspdf`, `postgres`) and packages used only by the unreferenced wrappers. Replacement: nothing after wrapper deletion. [`package.json`]
3. native: `vite-tsconfig-paths` duplicates Vite 8 native `resolve.tsconfigPaths`. Replacement: Vite native resolution after `@lovable.dev/vite-tanstack-config` removes its peer/plugin requirement. [`vite.config.ts`, `package.json`]
4. delete: broken legacy `My-Version` gitlink. Replacement: the canonical repository root already contains the application. [`My-Version`, `.gitignore`]

Net opportunity: approximately **-2,662 lines and -22 direct dependencies**. These cleanup items were
intentionally not applied because Ponytail audit mode is report-only and the dependency removals
should be reviewed as one focused change.

## Testing matrix

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci --include=dev` | PASS | Clean lockfile installation completed |
| `npm run typecheck` | PASS | No TypeScript errors |
| `npm run lint` | PASS | No ESLint errors |
| `npm run test:unit` | PASS | 95 tests passed |
| `npm run security:static` | PASS | All repository static guards passed |
| `npm run test:candidate-search` | PASS | One bounded relational query confirmed |
| `npm run build` | PASS | Client, SSR, and Nitro outputs generated |
| auth-bypass bundle scan | PASS | Built bundle scan passed |
| service-role bundle scan | PASS | Built bundle scan passed |
| `npm audit --audit-level=high` | PASS | No high or critical advisories; 3 moderate findings remain |
| Supabase linked migration dry-run | PASS | One migration pending; nothing applied |
| Supabase pgTAP/database suite | BLOCKED | Docker Desktop unavailable |
| L1-L4 live E2E | BLOCKED | Dedicated E2E URL/accounts/password not configured |
| Google/Microsoft OAuth and mailbox sync | NOT TESTED | External provider credentials/test mailboxes unavailable |
| ClamAV and live RAG services | NOT TESTED | External/local services unavailable in this session |

## Files changed by this audit

- `package.json`: adds the reviewed `sharp 0.35.5` security override.
- `package-lock.json`: locks patched compatible transitive dependencies.
- `tasks/production-readiness-audit-2026-10-07.md`: records findings and evidence.

Existing uncommitted candidate-assignment source, migration, generated types, UI, and database-test
changes were preserved and not overwritten.

## Database changes

No database change was applied. The linked dry-run identified only
`20261001163020_add_candidate_assignment_management.sql` as pending.

## Production recommendation

**DO NOT DEPLOY.** First start an isolated Supabase/PostgreSQL environment, execute all pgTAP tests,
apply the pending migration to preview only, and run the L1-L4 plus cross-tenant E2E matrix against
that preview. Promote only after those gates pass and a database backup/rollback plan is recorded.

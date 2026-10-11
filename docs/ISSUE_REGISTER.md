# Code audit issue register

Audit: 2026-10-11, branch `chore/codebase-organization`, base commit `e666479`.
Scope: application/configuration inventory and release checks; focused source review of
authentication middleware, candidate writes/search, vendor CSV, email filtering/provider
pagination/synchronization, background sync, and existing security test boundaries.
This is not a claim that every line or production interaction has been verified.

## AUD-001 — Exact subject rules accept unrelated subjects

- Severity: High. Status: Fixed locally.
- Location: `src/lib/email/filter-engine.ts:65`.
- Root cause: `includesAny` returns true for an empty keyword list, even when an exact subject
  was configured.
- Reproduce: Configure an AND rule with exact subject `New developer application` and no subject
  keywords; submit `Newsletter` with the other configured conditions satisfied.
- Expected: Subject check fails. Previous actual: Subject check passes.
- Fix: Only evaluate keyword matching when subject keywords exist.
- Regression risk: Low; rules without subject criteria and rules with keywords keep their
  established behavior. Regression test failed before the fix and passes after it.

## AUD-002 — CSV exports allow spreadsheet formula execution

- Severity: Medium. Status: Fixed locally.
- Location: `src/lib/vendor-csv.ts:165`.
- Root cause: CSV escaping handled delimiters but did not neutralize executable cell prefixes.
- Reproduce: Export a vendor name `=1+1` and open the CSV in a spreadsheet.
- Expected: Cell is text. Previous actual: The spreadsheet may interpret it as a formula.
- Fix: Prefix executable values (including whitespace-prefixed formulas) with an apostrophe;
  preserve plain numeric values and phone-number formats.
- Regression risk: Exported formula-like text contains a protective apostrophe. Reimporting
  that text retains the apostrophe. Existing ordinary contact-field round-trip test still passes.
- Evidence: Formula regression test failed before the fix and passes after it.

## AUD-003 — Sync watermark skips mailbox messages beyond the batch limit

- Severity: High. Status: Fixed locally; live persistence validation outstanding.
- Locations: `src/lib/email/providers.server.ts:409` and
  `src/lib/email/sync-service.server.ts:192`.
- Root cause: Fetching stops after two pages/100 messages but the sync watermark was advanced
  to the current run's start time without preserving provider pagination.
- Reproduce: More than 100 messages exist after the previous sync. Older messages outside the
  fetched batch fall before the new watermark and disappear from subsequent incremental queries.
- Expected: Subsequent runs process the remaining pages. Previous actual: They restart at the
  new watermark and can miss messages.
- Fix: Return provider continuation; store its original query window and watermark in the
  existing `email_accounts.sync_cursor`; advance the watermark only when the final page completes.
- Regression risk: Provider cursors may expire and require a new full rescan. Full rescans
  deliberately reset continuation. Authenticated and worker sync share the same implementation.
- Validation: Mocked Gmail/Outlook pagination and untrusted Outlook resume URL tests pass;
  cursor parsing rejects malformed or provider-mismatched state. No schema change is required.

## AUD-004 — Full-name search regression tests omitted from the main test gate

- Severity: Low. Status: Fixed locally.
- Location: `package.json` scripts `test:candidate-search` and `test:candidate-updates`.
- Root cause: The search test file existed but neither the normal unit chain nor the dedicated
  search script executed it.
- Reproduce: Run the previous `npm test`; full-name/whitespace/filter-quoting tests do not run.
- Expected: These tests participate in the regression gate.
- Fix: Include the test file in the candidate suite and dedicated search script.
- Regression risk: Low; no runtime behavior changed.

## AUD-005 — Candidate child updates can lose records on insert failure

- Severity: High. Status: Implemented locally; database integration validation and migration application pending.
- Location: `src/lib/candidates.functions.ts:465`, replacement helpers, and `updateCandidate`.
- Root cause: Existing child rows are deleted in one request before replacements are inserted
  in another; the parent update also commits separately.
- Reproduce: Update employment with existing rows; make the subsequent insert fail (database
  rejection or network failure). The earlier delete remains committed.
- Expected: The entire candidate update rolls back on failure. Actual source behavior: Prior
  rows can remain deleted and the parent may already have changed.
- Implemented fix: A caller-authorized transactional Postgres RPC updates the parent and only
  explicitly provided child collections in one transaction. Preserve omitted-vs-empty semantics.
- Regression risk: High enough to require database tests for RLS, field allowlists, rollback,
  explicit clearing, omitted collections, and cross-tenant denial before application adoption.
- Limitation: Docker now responds, but local Supabase startup fails because database port
  55322 is already allocated. Database tests remain unexecuted; no production database
  writes were attempted. Apply migration 20261011174040 only after integration validation,
  before deploying the updated candidate handler.

## Security and environment limitations

- Static authorization scan covers 106 server functions; it does not replace runtime RLS testing.
- Dependency auditing accepts an existing documented unpatched moderate advisory chain involving
  `argparse`, `mammoth`, and `sprintf-js`. No dependencies were added or upgraded by this audit.
- OAuth, live AI/RAG, browser role workflows, production logs, and deployed application responses
  were not verified during this audit. Tests use synthetic provider responses and unit fixtures.
- Shared service credentials and production data were not modified.

## Final status

PARTIALLY VERIFIED. All five issues have local fixes; AUD-005 database tests and live/database
verification remain outstanding. See `DEVELOPMENT_STATUS.md` for executed release checks.

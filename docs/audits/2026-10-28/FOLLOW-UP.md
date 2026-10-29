# Remaining-issue fixes — 29 October 2026

This follow-up supersedes the unresolved implementation items in REPORT.md. Changes are local; no production migration, push, or deployment was performed.

## Implemented

- Requirement contacts are stored as per-requirement snapshots. Existing rows are backfilled from the same-tenant vendor, and edit forms load the saved values. Choosing a different vendor replaces the contact defaults instead of retaining the previous vendor’s contacts.
- `save_requirement` commits parent and skills in one RLS-protected transaction. It checks required fields, tenant ownership, valid skill collections, and rate/experience ordering. A failed child insert rolls back the parent and restores existing skills. Partial updates validate the merged record.
- Candidate create/form saves require all detail fields on the server. Partial updates cannot clear mandatory fields. Resume/history remain optional, zero experience is accepted, and AI previews remain incomplete until the user reviews them. The legacy direct AI-create API returns an instruction to complete the form when required data is absent.
- Resume metadata commits a durable private storage job. The replacement is pending until its bytes are stored; the old original remains current. Upload retries use the validated SHA-256 digest, size, server-issued destination, and a service-only worker. A failed upload returns the saved candidate ID and a pending message rather than prompting another create.
- Original/candidate deletion queues durable file cleanup. Upload completion also queues staged-file cleanup. Worker leases prevent simultaneous claims; expired work becomes retryable. Only the server role can stamp validated content or claim/complete jobs. A later replacement remains current if an earlier upload finishes late.
- Vendor lookup uses debounced search and 50-row pagination, retaining the selected vendor across result pages. The unused unbounded vendor-lite endpoint was removed. CSV export uses 500-row cursor pages and a fixed creation cutoff, tested beyond the former 5,000-row cap; any failed or non-advancing page aborts without a partial download. Concurrent edits are not a transactional export snapshot.
- Older SQL test fixtures now provide valid authenticated actors during contact inserts. No production authorization rule was relaxed. The remaining lint test-double warning was removed.

## Files added

- `supabase/migrations/20261028090000_atomic_requirement_contacts.sql`
- `supabase/migrations/20261028091000_durable_resume_storage.sql`
- `supabase/tests/database/requirement_atomic_save.test.sql`
- `supabase/tests/database/resume_storage_recovery.test.sql`
- `src/lib/candidate-required-details.ts` and its tests
- `src/lib/resume-storage-job.ts` and its tests
- `src/lib/resume-storage-jobs.server.ts`
- `src/lib/vendor-export.ts` and its tests

Existing candidate/requirement/vendor functions and forms, edit route, generated database types, package test scripts, storage-authorization fixtures and the candidate-embeddings scheduled task are updated to use these changes. Earlier audit fixes remain in the same working tree.

## Operational behavior and rollout

Apply the two migrations in timestamp order to an isolated preview database, then deploy the matching app and worker together. Do not apply only the storage migration to the old application: its upload path does not record the required validated-content digest. Use a coordinated maintenance window for production if approved.

The existing daily candidate-embeddings cron now drains up to 50 storage jobs before embedding work. Normal uploads attempt completion immediately; failed jobs can wait until the next daily run. Pending recovery requires the service credential and cron to be operational. This does not claim sub-minute background recovery. Missing or altered staged bytes stay pending for investigation rather than being accepted as validated content. Already-missing historical resumes and already-orphaned files are not reconstructed or deleted by these migrations.

Do not reset a production database. Local verification used the isolated Supabase stack for this checkout, on port 55322. The sibling checkout’s database was not modified.

## External verification still outstanding

Browser automation is disabled in Work settings, so authenticated UI/Lighthouse/CWV verification remains unavailable. AI billing/provider availability cannot be repaired by code or verified without a funded provider account; no billing changes, key changes, or provider charges were made. Shared-motion/dashboard bundle work and region changes remain measurement-dependent opportunities, not demonstrated fixes. No dependency upgrade was introduced without evidence of benefit.

The user approved testing and deployment on 2026-10-29. Release `e7e2be4` was built with production settings before migration, both migrations were applied successfully to the Staffinix production database, and deployment `dpl_GfRcL7wpCnvsDkbJZt4vVBx2xY73` was promoted to https://staffinix-llc.vercel.app/. The commit was pushed to `main`.

Post-release checks: the live site returned HTTP 200; the requirement RPC and private storage job table exist; worker claims are permitted for service_role and denied for authenticated users; both resume buckets remain private. All 33 existing resume rows retained ready status, with zero pending jobs at verification time. The ten-minute runtime warning/error query returned no records. Authenticated upload/form workflows and provider billing remain outside this verification; no customer records were created or deleted for smoke testing.

## Final validation

- `npm run test:unit`: 224 tests passed, zero failures.
- `npx --yes supabase@2.118.0 test db supabase/tests/database`: 363 tests across 22 files passed against the final migrations on the isolated local database.
- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors/warnings.
- `NITRO_PRESET=vercel npm run build` (PowerShell environment assignment): passed.
- `npm run security:static`: passed.
- Both production-client bundle security scans passed with `CLIENT_BUNDLE_DIR=.vercel/output/static`.
- `git diff --check` with the repository's CRLF allowance: passed.
- Final summed JavaScript artifact gzip size: 965,821 bytes versus 965,191 for the first audit patch (+630 bytes). This includes all deferred chunks and is not an initial-transfer or runtime-performance measurement. See `follow-up-bundles.json`.

Database verification initially caught a replacement-ordering edge case when rows shared a transaction timestamp. Pending uploads now receive their actual preparation timestamp; finalization compares timestamp/ID ordering. The full database suite passed after this correction. The trusted-content stamp and untrusted-caller denial are included in the storage tests.

No production records were deleted, no production schema changed, and no deployment was performed. These fixes are not yet active on the live site.

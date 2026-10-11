# Next steps

This is an ordered continuation list based on the verified repository state on 2026-10-11.

Latest update: GitHub publication completed and the user supplied a successful Vercel deployment.
The release-access task below is historical. The next engineering priority is AUD-005 in
`ISSUE_REGISTER.md`: transactional candidate parent/child updates, tested with rollback and
tenant-isolation cases on a local Supabase stack. Start Docker Desktop's Linux engine to enable
that validation. Then verify the locally fixed email continuation with a test mailbox exceeding
100 messages and the existing `sync_cursor` field; do not use production data for failure tests.

| Priority | Task | Business reason | Relevant areas | Status / dependency | Acceptance criteria and validation |
| --- | --- | --- | --- | --- | --- |
| P0 | Restore Staffinix GitHub and Vercel release access | The verified release cannot reach users while GitHub push and Vercel deployment permissions are denied. | Git remote `origin`, Vercel project `staffinix/my-version` | Blocked on Staffinix account administrator. | Push succeeds without force; Vercel production deployment reaches Ready; production smoke test completes. |
| P0 | Rotate exposed integration credentials | OAuth and AI credentials previously entered in chat must be treated as compromised. | Google OAuth, OpenRouter, Vercel/Supabase environment configuration | Requires credential owners. | Old credentials are revoked; replacements exist only in server-side secret storage; OAuth flow and AI gateway test successfully. |
| P1 | Run Supabase integration and RLS tests in a non-production environment | Unit tests cover application policy, but schema/RLS behavior must be exercised against Supabase. | `supabase/tests`, migrations, Storage policies | Requires Docker/local Supabase or approved test project. | Database, storage, tenant isolation, assignment, and access-request tests pass; no production schema writes. |
| P1 | Configure and verify Gmail and Outlook OAuth | Smart Email needs valid provider credentials and redirect URLs to connect live accounts. | `settings.email-accounts`, email provider services, deployment env | Requires provider app configuration and encryption key. | Connect, callback, encrypted token persistence, refresh, sync, disconnect, and error states work with a test mailbox. |
| P1 | Run browser E2E role checks | Ensure L1–L4 controls and data visibility match database authorization. | Auth, protected routes, candidate management, submissions | Requires provisioned non-production users. | Each role can access only intended routes/data; assignment and submission audit data persist. |
| P2 | Incrementally move the next cohesive feature from `src/lib` | Continue the low-risk organization strategy without broad import churn. | Candidate or Smart Email module selected after change demand | Only after P0 release access is restored. | One feature slice owns its logic/tests; imports remain valid; full checks pass. |
| P2 | Decide whether `bun.lock` is still required | Two lockfiles can confuse local contributors and automation. | `bun.lock`, CI/workflow docs | Requires owner confirmation of Bun workflow. | Keep with documented purpose or remove in a dedicated reviewed change; `npm ci` remains reproducible. |

## Routine validation for any implementation change

Run the narrow relevant tests first, then `npm run typecheck`, `npm test`,
`npm run security:static`, and `npm run build`. Inspect `git diff` for unintended files and
confirm no environment files or secrets are included before committing.

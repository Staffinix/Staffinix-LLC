# Development status

## Last verified state

Audit performed on 2026-10-11 against `chore/codebase-organization` at commit `5067367`.
The application source, migrations, routes, test scripts, and documentation were inspected.

### Checks run during this audit

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed (full unit suite) |
| `npm run security:static` | Passed |
| `npm run build` | Passed |

The production build may emit the existing Lovable/Vite configuration notice; it did not fail the
build. No live production write, database migration, or deployment was performed in this audit.

## Completed capabilities

- Authentication and work-email policy enforcement.
- Server-side RBAC and tenant-scoped candidate, client, vendor, requisition, submission, and
  platform workflows.
- Candidate forms, edit path, resume attachment, employment and education data, phone validation,
  and marketing types.
- L2/L4 candidate assignment and submission visibility flows.
- AI candidate matching, visa filtering, and AI gateway hardening for OpenRouter and Lovable.
- Smart Email OAuth connection screens, rule validation, synchronization service, and provider
  integrations.
- Copilot/RAG, document processing, AI usage limits, and static security release gates.

## Partially verified or environment-dependent capabilities

- Gmail and Outlook OAuth require valid provider application credentials, registered redirect
  URLs, a configured `EMAIL_TOKEN_ENCRYPTION_KEY`, and the production server environment.
- RAG requires reachable Qdrant, Ollama, and the document worker. Local orchestration is defined
  by `docker-compose.rag.yml` but was not started during this audit.
- Supabase database/RLS tests require the local Supabase stack or an explicitly authorized test
  environment; they were not run here.
- Full browser end-to-end role flows need provisioned test users and a non-production test tenant.

## Current blockers

1. GitHub rejects pushes from the local authenticated account with a 403 for
   `Staffinix/Staffinix-LLC`.
2. Vercel blocks deployment for the current commit author on `staffinix/my-version`.
3. Supabase leaked-password protection still needs dashboard configuration.

## Recommended next task

Restore release access before attempting any deployment:

1. Grant repository write access to the intended GitHub account or authenticate Git with the
   Staffinix account.
2. Grant the commit author / linked GitHub identity deployment permission in the Staffinix Vercel
   team for `my-version`.
3. Push `chore/codebase-organization`, trigger the deployment, and verify the deployed auth,
   candidate, and Smart Email entry points with authorized test accounts.

Do not work around these permissions with a force push, rewritten commit author, client-side
secrets, or unreviewed production configuration changes.

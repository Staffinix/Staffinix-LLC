# Project context

## Purpose

Staffinix is a multi-tenant staffing-operations application. It supports tenant-scoped
candidate, requisition, client, vendor, submission, placement, and recruiter workflows,
with role-aware access for platform administrators, company administrators, developer
administrators, and recruiters.

## Verified stack and architecture

- React 19, TypeScript, TanStack Start/Router/Query, Vite, Tailwind, Radix UI, and Motion.
- Supabase Auth, Postgres, Storage, Row Level Security (RLS), and versioned SQL migrations.
- TanStack server functions are the application API boundary. They validate the Supabase
  session, load database-backed roles, and use caller-scoped Supabase clients.
- AI services are server-only: OpenRouter or the legacy Lovable gateway for bounded,
  schema-validated generation; Qdrant and Ollama for tenant-filtered retrieval-augmented
  Copilot answers.
- Gmail and Microsoft Outlook connections use OAuth-backed Smart Email processing. Tokens
  and provider credentials must remain server-only and encrypted.
- Untrusted resume parsing runs in the isolated document worker, with ClamAV and resource
  limits. Resume storage paths are canonical and tenant/candidate scoped.

## Established design decisions

- Browser UI is never the authorization boundary; server middleware and database RLS enforce
  access and tenant isolation.
- Candidate matching applies deterministic hard constraints before ranking. Generated AI text
  is explanatory decision support, not an employment decision.
- Database changes are represented by migrations in `supabase/migrations`; do not mutate
  shared schema directly.
- `src/routes` remains TanStack file-router owned. Feature extraction proceeds incrementally;
  the AI-matching slice is currently owned by `src/features/ai-matching`.
- The npm lockfile is the documented CI path. `bun.lock` remains because its external use has
  not been verified; do not remove it without owner confirmation.

## Current implementation status

Implemented and covered by source and/or tests:

- Work-email authentication policy, authenticated server functions, RBAC, and access-request
  tiers (L2 admin, L3 developer, and L4 recruiter).
- Candidate create, edit, search, filtering, resume handling, marketing-type multi-select,
  child records (employment, education, projects, certifications), and L2-to-L4 assignment.
- Candidate submission tracking, company/recruiter views, and audit-oriented persistence.
- Candidate matching with visa filtering and deterministic ranking.
- Smart Email connection, rule validation, provider sync, OAuth callback routes, and AI gateway
  integration.
- Copilot/RAG boundaries, AI usage guardrails, document worker hardening, and release-time
  static security guards.

## Constraints and known follow-up items

- The local Git credential is `bollasivashankar-web`; it does not have write access to
  `Staffinix/Staffinix-LLC`. The Staffinix release branch therefore cannot currently be pushed.
- A direct Vercel production deployment was blocked because the commit author lacked deployment
  permission for `staffinix/my-version`. Production was not changed.
- Enable Supabase Auth leaked-password protection in the Supabase dashboard; this setting is
  outside SQL migrations.
- OAuth and OpenRouter credentials that were previously shared in chat should be rotated. Never
  add real credentials to repository files or documentation.
- Live database integration tests require the local Supabase/Docker environment or a separately
  authorized non-production project. They were not rerun during this handover audit.

## Verified repository state

- Branch: `chore/codebase-organization`
- HEAD at audit: `5067367` (`chore: ignore local Vercel artifacts`)
- Remote baseline: `origin/main` at `78bfa54`
- The working tree was clean before creating these handover documents.

For operational setup and release configuration, see [Development](DEVELOPMENT.md),
[Deployment](DEPLOYMENT.md), [Authentication](AUTHENTICATION.md), and
[Database](DATABASE.md).

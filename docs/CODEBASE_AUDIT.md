# Codebase audit

Audit date: 2026-10-11

## Executive summary

The repository is a production-oriented React 19 and TanStack Start application backed by
Supabase. Its strongest boundaries are file-based routing, authenticated server functions,
tenant-scoped Row Level Security (RLS), explicit security regression scripts, and isolated
document processing. The application does not need a rewrite.

The primary organization issue was a flat `src/lib` containing feature workflows, server
functions, policies, and generic utilities together. Shared UI and feature components were already
reasonably grouped. The safest first extraction is AI matching because its server entry point,
deterministic scoring engine, visa filtering, and tests form a cohesive dependency slice.

## Inventory

- Application: React, TypeScript, TanStack Start/Router/Query, Vite, Tailwind CSS, Radix UI.
- Backend boundary: TanStack server functions authenticated with Supabase access tokens.
- Data: Supabase Auth, Postgres, Storage, versioned SQL migrations, tenant-scoped RLS.
- AI: server-only provider gateway, deterministic candidate scoring, Qdrant/Ollama RAG.
- Background work: Nitro scheduled tasks for candidate embeddings and email sync.
- Document safety: private worker, ClamAV, strict size/resource limits, raw-text extraction.
- Quality gates: TypeScript, ESLint/Prettier, unit tests, static security checks, Supabase DB tests,
  bundle scans, dependency audit, and Gitleaks.

## Findings

### High value

1. `src/lib` mixed feature ownership and shared infrastructure, increasing discovery cost and the
   chance of accidental cross-feature coupling.
2. The root system/presentation document mixed current architecture and future roadmap without an
   engineering-documentation index.
3. Standard `npm test` was absent even though a comprehensive `test:unit` command existed.
4. `package.json` and `package-lock.json` had drifted far enough that CI's required `npm ci` could
   not install the project.
5. Two static security guards had drifted from implementation: the document parser pin and a
   collection-bound check. The latter incorrectly required exactly 100 rows instead of accepting a
   stricter positive bound.
6. Smart Email rule testing, email synchronization, and Copilot fallback treated AI as disabled
   when only `OPENROUTER_API_KEY` was configured. Provider detection is now centralized and accepts
   either supported server-side gateway credential.
7. The live Supabase performance advisor identified eight exact duplicate indexes. The redundant
   copies are removed by a versioned migration while the equivalent indexes remain in place.

### Medium value

1. Server-function modules still live primarily in `src/lib`. Moving all of them at once would
   create a high-risk, low-value import churn; they should move feature by feature when edited.
2. Both `package-lock.json` and `bun.lock` are present. CI and documented workflows use npm, but the
   Bun lock may support an external workflow. Removal requires owner confirmation.
3. Generated `src/routeTree.gen.ts` sits beside authored routes. This is correct for TanStack and
   must not be edited manually.

### Preserved intentionally

- `src/routes` remains framework-owned and file-based.
- `src/integrations/supabase` remains a security boundary rather than moving into a feature.
- Existing migration filenames, RLS policies, storage rules, RPCs, and database tests remain
  unchanged; the duplicate-index cleanup is additive and versioned.
- Production-fixture guard files remain in their existing paths because build aliases and security
  scripts depend on them.
- No dependency was added or removed during the restructuring.
- Authenticated `SECURITY DEFINER` RPCs remain intentional. Each reviewed RPC denies anonymous
  execution, fixes `search_path`, and performs caller, active-profile, tenant, and role checks before
  privileged work. Converting these functions to invoker mode or revoking authenticated execution
  would break the application without improving its effective authorization boundary.
- `pg_trgm` and `vector` remain in the `public` schema for now because existing function signatures
  and stored types explicitly reference them. Moving these extensions requires a dedicated,
  reversible compatibility migration rather than an automated advisor cleanup.

## Outcome

AI matching now lives under `src/features/ai-matching`, documentation is indexed under `docs`, and
test/security paths were updated with the move. The npm lockfile is synchronized, lint formatting is
consistent, and dependency auditing now retains the moderate-severity threshold while narrowly
documenting the one upstream advisory with no patched release. See
[Restructuring plan](RESTRUCTURING_PLAN.md) for the migration rule applied to future features.

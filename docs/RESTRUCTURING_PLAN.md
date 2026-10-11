# Restructuring plan

## Goals

- Make feature ownership obvious without changing behavior.
- Preserve file history with `git mv`.
- Keep security boundaries and framework conventions stable.
- Move code incrementally and validate every slice.

## Completed slice

The AI matching feature moved from the flat `src/lib` directory to
`src/features/ai-matching`:

- authenticated matching server functions
- deterministic candidate scoring engine
- visa normalization/filtering
- colocated unit tests

Routes import the feature through the `@/features/ai-matching/*` alias. Package scripts and static
security guards reference the new paths.

The root presentation document moved to `docs/SYSTEM_OVERVIEW.md`, and this documentation set now
separates current implementation from roadmap material.

## Deliberately deferred

Do not perform a bulk move of every `*.functions.ts` module. For each future feature extraction:

1. Identify the route, server functions, domain helpers, schemas/types, and tests.
2. Confirm the slice has a single owner and no generated-file constraints.
3. Move with `git mv` into `src/features/<feature>`.
4. Keep reusable infrastructure in `src/lib` or `src/integrations`.
5. Update security scripts and test commands that use literal paths.
6. Run typecheck, lint, unit tests, static security checks, and production build.

Suggested future slices, in priority order: candidate management, requirements, submissions,
email intelligence, and Copilot/RAG. Each should be a separate reviewable change.

## Placement rule

- Feature-specific domain logic and server functions: `src/features/<feature>`
- Reusable UI primitives: `src/components/ui`
- Shared shell/navigation: `src/components/app-shell`
- Cross-feature policies/utilities: `src/lib`
- External service boundaries: `src/integrations`
- URL ownership: `src/routes` (TanStack file-based routes only)

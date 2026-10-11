# Project structure

```text
.
├─ .github/                    CI and dependency automation
├─ docs/                       Engineering and product reference documentation
├─ public/                     Static browser assets
├─ scripts/                    Static architecture, security, and smoke checks
├─ src/
│  ├─ assets/                  Imported visual assets
│  ├─ components/              Shared UI, shell, and presentation components
│  ├─ features/                Feature-owned workflows and domain logic
│  │  └─ ai-matching/          Matching API, scoring/filtering logic, and tests
│  ├─ hooks/                   Reusable React hooks
│  ├─ integrations/            HTTP and Supabase transport/security boundaries
│  ├─ lib/                     Cross-feature services, policies, and legacy feature modules
│  ├─ routes/                  TanStack file-based routes
│  └─ types/                   Shared public TypeScript types
├─ supabase/
│  ├─ migrations/              Ordered schema, RLS, storage, and RPC changes
│  └─ tests/                   Database, RLS, transaction, and query-plan tests
├─ tasks/                      Nitro scheduled/background tasks
└─ workers/document-processor/ Isolated document parsing service
```

## Naming

- Route filenames follow TanStack conventions; see `src/routes/README.md`.
- Server-only modules use `.server.ts` when direct client import must be impossible.
- TanStack server-function entry points use `.functions.ts`.
- Tests are colocated as `*.test.ts` when they test a small domain unit.
- Feature directories use lowercase kebab-case.

## Dependency direction

```text
routes/components -> features -> lib/integrations -> external systems
```

Shared layers must not import route components. Feature-to-feature imports should be exceptional;
move genuinely reusable contracts or helpers into `src/lib` or `src/types` instead.

`src/routeTree.gen.ts` is generated. Do not edit it manually.

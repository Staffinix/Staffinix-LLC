# Development

## Prerequisites

- Node.js 22 or newer (CI currently uses Node.js 24)
- npm
- Docker when running local Qdrant/Ollama, the document worker, or local Supabase
- Supabase CLI for database migration/test work

## Setup

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Use placeholders or development credentials only. Never commit `.env.local` or place a secret in a
`VITE_` variable.

Optional local RAG services:

```sh
npm run rag:up
npm run rag:models
```

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run security:static
npm run build
```

Database/RLS tests use an isolated local Supabase instance:

```sh
npx --yes supabase@2.118.0 start
npx --yes supabase@2.118.0 test db supabase/tests/database
```

## Change workflow

1. Start from a clean working tree and create a focused branch.
2. Preserve unrelated local changes.
3. Use migrations for schema/RLS/storage/RPC updates.
4. Add or update tests beside the changed behavior.
5. Run the complete validation set before opening a pull request.
6. Do not rewrite pushed history; the repository is connected to Lovable.

## Adding a feature

Put cohesive domain code in `src/features/<feature>`, keep route modules focused on routing and
presentation, and reuse the existing Supabase authentication/feature middleware. Literal paths in
scripts and package commands must be updated when files move.

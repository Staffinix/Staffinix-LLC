# Architecture

## Runtime flow

```text
Browser
  -> TanStack Router route + React Query
  -> client auth-attacher adds Supabase access token
  -> TanStack server function
  -> Supabase authentication middleware validates token/user/profile
  -> feature RBAC middleware and domain authorization
  -> caller-scoped Supabase client
  -> Postgres RLS / Storage policies / RPCs
```

The browser uses only the publishable Supabase key. Secret/service-role keys, OAuth client secrets,
AI credentials, encryption keys, and worker credentials are server-only.

## Layers

### Routes and presentation

`src/routes` is owned by TanStack's file-based router. `_authenticated/route.tsx` is the protected
layout and performs a usability-oriented client navigation check. It is not the security boundary.
`src/components` contains shared UI, app shell, and feature presentation.

### Feature modules

`src/features` contains cohesive business slices. A feature may own server functions, deterministic
domain logic, validation, and tests. Routes should stay thin and import feature APIs.

### Shared application services

`src/lib` contains cross-feature policy, shared domain services, server-only integrations, and
legacy feature modules awaiting incremental extraction. `src/integrations` owns HTTP and Supabase
transport boundaries.

### Persistence and authorization

Supabase Auth establishes identity. Server middleware verifies the signed access token and loads an
active profile. Feature middleware loads database-backed roles. RLS is the final tenant isolation
boundary. UI visibility is never treated as authorization.

### Asynchronous and isolated processing

Nitro tasks in `tasks` refresh candidate embeddings and synchronize connected email accounts.
Untrusted PDF/DOCX parsing is delegated to `workers/document-processor`, protected by authentication,
size/resource limits, raw-text extraction rules, and ClamAV.

## AI boundaries

Candidate matching evaluates hard constraints deterministically before ranking. Generated AI text
is explanation-only and requires human review. Copilot/RAG queries are tenant filtered. Provider
keys never enter browser bundles.

## Architectural invariants

- Authenticate and authorize every protected server function.
- Keep tenant IDs derived from the authenticated database context.
- Preserve RLS and storage policies for all exposed data.
- Use migrations for database changes; never mutate shared schema manually.
- Keep untrusted document parsing out of the web process.
- Do not import server-only credentials or modules into client code.

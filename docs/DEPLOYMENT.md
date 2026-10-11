# Deployment

## Release gates

The GitHub workflow runs dependency audit, typecheck, lint, unit tests, static security checks,
production build, bundle scans, isolated Supabase RLS tests, and a full-history Gitleaks scan.
Deploy only a commit that passes these gates.

The dependency audit fails on every new moderate-or-higher advisory. One exact unpatched
`sprintf-js` advisory chain is documented and narrowly allowlisted in
`scripts/check-dependency-audit.mjs`; remove that exception when the upstream Mammoth dependency
offers a patched path.

## Production configuration

Create the variables listed in `.env.example` in the hosting provider. Set both browser and server
Supabase variables; only the publishable key may use a `VITE_` prefix. Keep AI keys, OAuth secrets,
email token encryption, document worker credentials, and any privileged database credential
server-only.

Configure `OPENROUTER_API_KEY` for the preferred AI provider. `LOVABLE_API_KEY` remains an optional
legacy fallback; either credential enables Smart Email AI checks, email-sync classification, and
Copilot generation. Never configure either key with a `VITE_` prefix.

Production service URLs for Qdrant, Ollama, and the document worker must use HTTPS. Configure exact
Gmail/Microsoft redirect URIs for the production domain. Apply Supabase migrations before enabling
application code that depends on them.

## Build and runtime

```sh
npm ci
npm run build
```

The Vite/TanStack configuration produces the Nitro deployment output. Hosting configuration must
preserve server-function execution and SPA/SSR routing; do not deploy only raw source files.

## Scheduled work

`vite.config.ts` registers `candidate-embeddings` and `email-sync` Nitro tasks. Verify the selected
hosting plan supports the configured schedules and that task-specific server variables are present.

## Post-deploy smoke checks

1. Sign in and sign out with an authorized test account.
2. Confirm an unauthorized route is denied server-side, not merely hidden.
3. Load candidates and requirements for the correct tenant.
4. Run candidate matching and inspect deterministic constraint results.
5. Upload/download a test resume through the isolated worker path.
6. Connect and sync each enabled email provider.
7. Review application logs without exposing secrets or candidate content.

In Supabase Auth settings, enable leaked-password protection before production launch. This is a
project-level Auth setting and is not represented by a SQL migration.

Never push credentials into Git to simplify deployment. Rotate any credential disclosed outside the
secret manager.

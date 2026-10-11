# Authentication

## Sign-in

The browser signs in through Supabase Auth (password or configured OAuth). It receives a Supabase
session and passes the access token to TanStack server functions through the client auth middleware.

The server then:

1. extracts the bearer token;
2. validates it with Supabase Auth;
3. verifies JWT subject and authenticated user agree;
4. loads the active application profile;
5. enforces the configured work-email policy or an explicit provisioned role;
6. creates a caller-scoped Supabase client so Postgres RLS sees the real user.

There is no fallback user, browser-assigned role, automatic tenant assignment, or application-owned
password store.

## Route guard versus security boundary

`src/routes/_authenticated/route.tsx` prevents protected UI from rendering while session/profile
state is unresolved and redirects denied navigation. It is a user-experience guard only.

The security boundary is `src/integrations/supabase/auth-middleware.ts`, feature authorization,
domain policy checks, and database RLS.

## Configuration

- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- Optional policy: `AUTH_ALLOWED_WORK_EMAIL_DOMAINS`, `AUTH_EMAIL_ALLOWLIST`

Never configure a service-role/secret key in browser variables.

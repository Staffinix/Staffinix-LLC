# Security review

## Implemented controls

- Passwords are not accepted or stored by the API. Supabase Auth is the identity authority.
- Supabase Auth validates each access token before application access; test-only tokens are verified locally.
- Roles and company identifiers come from active database memberships, never request bodies.
- Company-owned reads and writes include company scope; automated tests exercise tenant and candidate isolation.
- Candidate invitations use 256-bit random tokens; only SHA-256 hashes are stored. Tokens are email-bound, expiring, single-use, and revocable in the model.
- Attempts use immutable configuration snapshots, server deadlines, database uniqueness, candidate ownership checks, and audited reattempt grants.
- Detailed rubrics are omitted from candidate attempt snapshots.
- CORS is allow-listed, request IDs are returned, secrets are environment-based, and production images use private server configuration.

## Remaining risks before production

- Add short-lived caching or local JWKS validation if authentication-service latency becomes material; preserve key-rotation support.
- Add endpoint-specific rate limiting, Redis-backed idempotency keys, CSP, CSRF analysis for any future cookie auth, and structured/redacted logs.
- Apply and test PostgreSQL RLS policies as defense in depth.
- Add malware scanning, content sniffing, decompression limits, and private signed URLs before accepting documents or media.
- Complete retention/deletion workflows and consent records before collecting audio, camera, or monitoring data.
- Complete prompt-injection, retrieval-isolation, model-output, and citation tests before enabling AI providers.
- Run SAST, dependency scanning, container scanning, penetration testing, and production backup-restore drills.

## Deployment requirements

Use TLS, managed secrets, a private database network, least-privilege database/service accounts, encrypted backups, alerting, and separate Supabase/Qdrant/storage resources per environment. Never expose the Supabase service-role key, PostgreSQL credentials, Qdrant management access, or raw invitation tokens in browser bundles or logs.


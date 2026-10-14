# Security review

## Implemented controls

- Passwords are not accepted or stored by the API. Supabase Auth is the identity authority.
- Supabase Auth validates every access token before application access; tests replace the auth dependency without adding a runtime bypass.
- Roles and company identifiers come from active database memberships, never request bodies.
- Company-owned reads and writes include company scope; automated tests exercise tenant and candidate isolation.
- Candidate invitations use 256-bit random tokens; only SHA-256 hashes are stored. Tokens are email-bound, expiring, single-use, and revocable in the model.
- Attempts use immutable configuration snapshots, server deadlines, database uniqueness, candidate ownership checks, and audited reattempt grants.
- Detailed rubrics are omitted from candidate attempt snapshots.
- CORS is allow-listed; security headers, body-size limits, redacted denial logs, and request IDs are applied centrally.
- Redis-backed global and sensitive-operation rate limits protect authentication, invitation, and AI-provider boundaries.
- Production configuration fails closed when PostgreSQL, Supabase, Resend, HTTPS origins, OpenRouter, or Redis are unsafe or missing.
- PostgreSQL, Redis, Qdrant, and API Compose ports bind only to loopback; the API image runs as a non-root user.
- Resend and OpenRouter credentials remain server-only; placeholder credentials are rejected before network access.
- Invitation email HTML is escaped, email delivery is tracked, and failed sends revoke the associated invitation.
- AI questions use schema-validated structured output, reject duplicates, remain drafts until human approval, and instruct the model not to score protected traits or speaking style.
- Database constraints and short row locks protect company bootstrap, question ordering, and invitation acceptance from races.
- Invitation tokens use URL fragments, are removed from browser history immediately, and survive authentication only in session storage.
- CI runs backend/frontend tests, dependency audits, secret scanning, and container vulnerability scanning.
- The optional browser-test token is read only by Vite development builds; production builds ignore it and no token is stored in repository env files.

## Remaining risks before production

- Add short-lived caching or local JWKS validation if authentication-service latency becomes material; preserve key-rotation support.
- Add Redis-backed idempotency keys where client retries can create duplicate business operations; perform CSRF analysis before any future cookie auth.
- Apply and test PostgreSQL RLS policies as defense in depth.
- Add malware scanning, content sniffing, decompression limits, and private signed URLs before accepting documents or media.
- Complete retention/deletion workflows and consent records before collecting audio, camera, or monitoring data.
- Complete prompt-injection, retrieval-isolation, citation, bias, and adversarial model-output tests before adding document-grounded generation or automatic scoring.
- Move synchronous invitation delivery to a transactional outbox/background worker before high-volume production use.
- Add SAST, penetration testing, and production backup-restore drills; dependency, secret, and container scanning already run in CI.

## Deployment requirements

Use TLS, managed secrets, a private database network, least-privilege database/service accounts, encrypted backups, alerting, and separate Supabase/Qdrant/storage resources per environment. Never expose the Supabase service-role key, PostgreSQL credentials, Qdrant management access, or raw invitation tokens in browser bundles or logs.


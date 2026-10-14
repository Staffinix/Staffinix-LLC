# Implementation status

Last updated: 2026-10-14

## Completed

- Repository and Git-state inspection; pre-existing deletions were preserved.
- Phase 1 modular backend foundation with JWT authentication, company memberships, tenant-scoped jobs/candidates/templates, invitation lifecycle, assignments, attempts, answers, completion, reattempt authorization, and audit logging.
- Database constraints for tenant uniqueness, single-use invitation acceptance, assignment uniqueness, attempt numbering, and answer idempotency.
- Backend-authoritative attempt expiry and role checks.
- Health/readiness endpoints, request correlation IDs, CORS configuration, environment template, Docker assets, and initial migration.
- Automated tests for company isolation, invitation reuse/expiry, candidate isolation, duplicate active attempts, answer idempotency, and company-controlled reattempts.
- React/TypeScript company and candidate portal shell wired to real API endpoints.
- Resend invitation delivery with delivery tracking, revoked invitations on provider failure, and server-only credentials.
- OpenRouter structured question generation with duplicate checks, job-grounded prompts, draft storage, and explicit human approval.

## Test results

- `python -m pytest`: **11 passed**. This includes Supabase Auth validation, provider request validation, question approval, and invalid-token rejection; Python 3.14 emits upstream FastAPI/Starlette deprecation warnings.
- `python -m compileall -q backend`: **passed**.
- `python -m alembic upgrade head` followed by `downgrade base` against a fresh SQLite database: **passed**.
- `npm run build`: **passed**; TypeScript checked and Vite produced the production bundle.
- `npm audit --audit-level=high`: **0 vulnerabilities**.

## Remaining

- Supabase email verification UI and optional Auth-validation caching/JWKS optimization.
- Document storage, parsing, versioning, Qdrant indexing, and hybrid retrieval.
- Voice upload/transcription, rubric evaluation, reports, monitoring, workers, and SSE.
- PostgreSQL RLS policies, live provider smoke tests, Playwright coverage, rate limiting, retention/deletion, and production deployment validation.

## Known limitations

This is the highest-priority functional slice, not the complete six-phase platform. Provider request formats are tested with mocks; live delivery and generation are not claimed as verified without credentials. Local console invitation delivery is development-only.


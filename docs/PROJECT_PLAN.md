# Project plan

## Architecture

The application is split into a React/TypeScript client, a FastAPI API, PostgreSQL as the relational source of truth, Supabase Auth as the identity provider, private object storage for uploads, Qdrant for company-scoped retrieval, and Redis-backed workers for slow ingestion/transcription/evaluation jobs.

The API is organized into routes, authorization dependencies, transactional services, SQLAlchemy models, and provider interfaces. Browser state is never authoritative for tenant identity, roles, timers, scores, suspensions, or reattempt eligibility.

## Delivery phases

1. Foundation: authenticated tenant bootstrap, memberships, jobs, candidates, invitations, interview templates, assignments, attempts, audit records, isolation tests, and basic portals.
2. Documents/RAG: private upload, validated extraction, versioned chunking, embeddings, Qdrant filters, retrieval evidence, question generation, and approval.
3. Interview lifecycle: immutable configuration snapshots, server timers, question delivery, answer idempotency, refresh recovery, completion, and SSE status.
4. Voice/evaluation: browser recording, signed upload, transcription jobs, deterministic rubric aggregation, human-review routing, and reports.
5. Monitoring/reattempts: consent, confidence-bearing events, warnings, persisted suspension, review, appeals, and transaction-safe reattempt grants.
6. Production readiness: RLS, retention/deletion, performance/security tests, observability, backups, and deployment automation.

## Core entities

Company, Membership, Candidate, Invitation, Job, InterviewTemplate, Question, Assignment, Attempt, Answer, ReattemptPermission, MonitoringEvent, Document, DocumentVersion, IngestionJob, Rubric, Evaluation, AuditLog, and Notification.

## API modules

`auth`, `companies`, `jobs`, `candidates`, `invitations`, `interviews`, `sessions`, `answers`, `reattempts`, then `documents`, `knowledge-base`, `evaluations`, `monitoring`, `reports`, and `analytics`.

## Security requirements

- Validate Supabase access tokens; never accept identity, role, or company authority from request bodies.
- Scope every company-owned query by the authenticated membership and test cross-company denial.
- Keep service-role keys server-only; redact secrets and candidate media from logs.
- Use single-use hashed invitation tokens, bounded expiry, database constraints, rate limits, private storage, and signed URLs.
- Treat document text and model output as untrusted input. Enforce structured schemas and source allow-lists.
- Apply PostgreSQL RLS as defense in depth in production; backend authorization remains mandatory.

## Acceptance criteria

The minimum workflow is company bootstrap -> job/template/question creation -> candidate invitation/acceptance -> assignment -> authorized attempt -> answer submission -> completion -> company review -> audited reattempt. Cross-company and candidate isolation, expired/reused invitations, duplicate active attempts, and attempt limits have automated tests. Later phases add real storage, Qdrant, AI, voice, evaluation, monitoring, and reports without weakening these invariants.

## Architecture decisions

- SQLite is supported only for fast local tests; PostgreSQL is the deployment database.
- The API validates externally issued JWTs and never stores passwords.
- Invitation tokens are returned only when `EMAIL_DELIVERY_MODE=console` for local development; production must use an email provider.
- Phase 1 uses synchronous transactions. Long-running provider calls will be worker jobs in Phase 2 onward.


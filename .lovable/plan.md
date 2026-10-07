# Staffinix — AI Recruitment Operating System

Enterprise-grade, AI-first recruitment platform for US IT staffing. Built on the platform's native stack; delivered in reviewable phases so each slice is production-quality before the next begins.

## Architecture (final target)

- **Frontend**: TanStack Start (React 19 + TS) · Tailwind v4 · shadcn/ui · TanStack Query · TanStack Router (file-based) · Linear-style dark UI (theme tokens in `src/styles.css`)
- **Backend**: `createServerFn` (typed RPC) + server routes for webhooks (`src/routes/api/public/*`)
- **DB**: Lovable Cloud (Postgres + RLS) — every table has RLS + role-based policies
- **Auth**: Supabase Auth (email/password + Google OAuth via Lovable broker), managed `_authenticated` gate
- **RBAC**: `app_role` enum + `user_roles` table + `has_role()` security-definer function (never on profiles)
- **AI**: Lovable AI Gateway
  - Parsing/matching/drafts: `google/gemini-3-flash-preview` (default)
  - Reasoning-heavy tasks: `google/gemini-3-pro-preview`
  - Embeddings: `google/gemini-embedding-001` → `pgvector` (halfvec HNSW)
- **File storage**: Lovable Cloud Storage (resumes, JDs)
- **Audit**: `audit_logs` table written by every mutation server fn

## AI Guardrails (enforced in code, not just prompts)

- No server fn sends email or submits a candidate. All AI outputs land in a `submissions` / `email_drafts` row with `status = 'pending_recruiter_approval'`.
- Resume tailoring produces a **new** `resume_versions` row with a diff view; recruiter must approve to promote.
- Structured output (JSON schema) on every extraction call so the model cannot invent free-form fields.
- Every AI call logged to `ai_activity_logs` (prompt hash, model, tokens, user, entity).

## Phased delivery

Each phase ships fully working end-to-end (UI + DB + policies + audit + tests-of-behavior via preview).

### Phase 1 — Foundation (this turn)

**Ships:** Enable Lovable Cloud · design system (Linear-style dark) · app shell (sidebar + topbar + command palette scaffold) · Supabase auth (email/password + Google) · `profiles` + `user_roles` + `has_role()` + `audit_logs` + `activity_logs` · `_authenticated` layout · Users module (list / invite / role assign / deactivate) for Super Admin & Admin · Dashboard shell with real KPI placeholders wired to real queries · Sign-in / Sign-up / OAuth callback routes · Logo slot (waiting on your upload).

### Phase 2 — Requirements + AI JD Parser

Tables: `clients`, `vendors`, `requirements`, `requirement_skills`. Intake: paste / PDF / DOCX upload → server fn extracts text → Gemini structured-output extraction (client, role, skills, visa, rate, duration, mandatory vs preferred) → recruiter reviews & confirms → status pipeline (Open / Assigned / Closed / Expired). Assignment to recruiters + activity feed.

### Phase 3 — Candidates + Resume Parser + Embeddings

Tables: `candidates`, `resumes`, `resume_versions`, `candidate_skills`, `candidate_employment`, `candidate_projects`, `candidate_certifications`, `candidate_embeddings vector(3072)`. Resume upload → parse to structured fields → embed per section → bench view with filters (visa, tech, location, availability). Submission history join.

### Phase 4 — Matching + Submissions + Email drafts

Semantic match (cosine on pgvector) + skill-overlap score + LLM rationale (strengths / gaps / rank). Submission Center: recruiter picks candidate → AI drafts tailored resume + intro email + summary → approval gate → status pipeline (Submitted / Interview / Reject / Offer / Hired). Email templates library. Nothing sends without an explicit "Approve & mark sent" click (Phase 5 wires real SMTP if you connect one).

### Phase 5 — Copilot, Reports, Polish

AI Copilot (RAG over your DB, read-only tools). Reports (recruiter productivity, submission funnel, bench utilization). Audit log viewer. Notification center. Optional real email send via connector (SendGrid/Gmail/Outlook) — still recruiter-triggered.

## What Phase 1 delivers in detail

**Schema (migration)**

- `app_role` enum: `super_admin`, `admin`, `recruiter`, `account_manager`, `delivery_manager`, `marketing_executive`
- `profiles` (id → auth.users, full_name, email, phone, avatar_url, is_active, timestamps) — RLS: user reads self; admins read all
- `user_roles` (user_id, role, unique) — RLS via `has_role()`; only super_admin/admin write
- `has_role(uuid, app_role)` SECURITY DEFINER
- `audit_logs` (actor_id, action, entity_type, entity_id, metadata jsonb, ip, ua, created_at)
- `handle_new_user()` trigger → auto-create profile on signup (first signup becomes `super_admin`; rest default to `recruiter` pending admin change)

**Server functions**

- `listUsers`, `inviteUser` (Auth Admin API — admin-gated), `updateUserRole`, `deactivateUser`, `reactivateUser`, `getMyProfile`, `updateMyProfile` — every mutation writes to `audit_logs`.

**Routes**

- `/auth` (sign-in / sign-up tabs + Google)
- `/_authenticated/` layout (sidebar nav + topbar + user menu + sign-out hygiene)
- `/_authenticated/` index → Dashboard shell (Today / My Requirements / My Submissions / Interviews / Team Performance — real queries, empty states)
- `/_authenticated/users` (admin-gated pathless `_admin` layout)
- `/_authenticated/settings/profile`

**Design system**

- Linear-inspired dark: `--background: oklch(0.145 0.005 285)`, elevated surfaces, indigo primary `oklch(0.62 0.19 275)`, mono-adjacent sans (Geist via fontsource), 8px grid, subtle borders `oklch(1 0 0 / 0.08)`, keyboard-first (⌘K palette scaffold).
- All tokens in `src/styles.css`; no ad-hoc colors in components; shadcn variants only.

## Technical notes

- OAuth via `lovable.auth.signInWithOAuth("google", ...)` — not raw supabase. `supabase--configure_social_auth` called in Phase 1.
- Every protected server fn uses `requireSupabaseAuth` middleware; every admin fn additionally checks `has_role(userId, 'admin')` or `super_admin`.
- Storage bucket `resumes` (private) + signed URLs — provisioned in Phase 3.
- Embeddings column sized to model default (3072); HNSW on halfvec cast.

## What I need from you

1. **Confirm this phased plan** — I'll ship Phase 1 immediately on approval.
2. **Upload your Staffinix logo** in the chat (PNG/SVG). I'll wire it into the topbar, sign-in page, and favicon. If it isn't uploaded by the time Phase 1 finishes, I'll ship a clean placeholder wordmark and swap it later.
3. **First super-admin email**: the first account to sign up will be auto-promoted to `super_admin`. Sign up first before inviting anyone else.

# InterviewOS

Production-oriented foundation for a multi-tenant AI interview management platform. The implemented slice supports Supabase-issued identity tokens, company bootstrap, role/tenant authorization, jobs, interview templates, OpenRouter-generated questions with human approval, Resend invitation email, assignments, server-authoritative attempts, transcript answers, completion, audited reattempt grants, and company/candidate React portals.

See [project plan](docs/PROJECT_PLAN.md), [implementation status](docs/IMPLEMENTATION_STATUS.md), and [security review](docs/SECURITY_REVIEW.md).

## Repository structure

```text
backend/        FastAPI routes, auth, models, services, configuration
frontend/       React + TypeScript + Vite + Tailwind client
migrations/     Alembic database migrations
tests/          Backend workflow and isolation tests
docs/           Architecture, status, and security notes
compose.yaml    PostgreSQL, Qdrant, Redis, and API development stack
```

## Local setup (PowerShell)

Prerequisites: Python 3.12+ (3.14 was also verified), Node.js 22+, Docker Desktop, and a Supabase project.

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
docker compose up -d postgres qdrant redis
python -m alembic upgrade head
python -m uvicorn backend.main:app --reload
```

Run that command from the repository root (`Interview Panal`), not from the
`backend` directory. If the prompt ends in `\backend>`, first run `Set-Location ..`;
otherwise Python cannot import the `backend` package.

In a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

General shells use `source .venv/bin/activate`; the remaining commands are identical.

## Supabase configuration

Enable email/password sign-in and email verification in Supabase Auth. Copy the project URL and publishable key into both `.env` and `frontend/.env`. The backend validates access tokens with Supabase Auth, so no JWT secret or service-role key is required. In **Authentication → URL Configuration**, add `http://localhost:5173/invite` to the redirect allow-list. For production, also add `https://your-frontend-domain.com/invite` and set the Site URL to the deployed frontend origin.

A first-time candidate clicks the private invitation link, chooses **Create candidate account**, enters the same email address that received the invitation, and confirms the Supabase email. Returning to `/invite` accepts the invitation and opens `/candidate`. A returning candidate can use **Candidate portal** on the sign-in page. The invitation token stays private in the URL fragment and is retained until the API confirms acceptance; expired, reused, or wrong-email links remain rejected by the backend.

The first signed-in company user opens `/company` and creates a company. The company portal supports job creation, interview creation, OpenRouter question generation, human approval, publication, and candidate invitations. With `EMAIL_DELIVERY_MODE=console`, the invitation endpoint returns a development token. With `EMAIL_DELIVERY_MODE=resend`, it sends the private invitation link and never returns the token.

## Production email and AI configuration

Keep every secret below in the root `.env`; do not put it in `frontend/.env` or commit it.

```dotenv
EMAIL_DELIVERY_MODE=resend
RESEND_API_KEY=re_your_real_key
EMAIL_FROM=InterviewOS <interviews@your-verified-domain.com>
PUBLIC_APP_URL=https://your-frontend-domain.com
OPENROUTER_API_KEY=sk-or-v1-your-real-key
OPENROUTER_MODEL=openai/gpt-4o-mini
```

- Create the OpenRouter key at [OpenRouter workspace keys](https://openrouter.ai/workspaces/default/keys).
- Create the Resend key at [Resend API keys](https://resend.com/api-keys), verify a sending domain in Resend, and replace `EMAIL_FROM` with an address on that domain. Resend's onboarding sender is suitable only for initial testing.
- Set `PUBLIC_APP_URL` to the deployed frontend origin so email links open the correct candidate portal.
- Restart the API after changing `.env`.

`POST /api/v1/interviews/{template_id}/questions/generate` creates draft questions through OpenRouter. Generated questions remain unapproved until a company admin calls `POST /api/v1/questions/{question_id}/approve`; an interview cannot be published with unapproved questions.

For automated browser verification only, a Vite development server may receive an ephemeral `VITE_E2E_ACCESS_TOKEN`. The production build ignores this variable; never add it to an env file or deploy it.

## Environment variables

Backend: `APP_ENV`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGINS`, `EMAIL_DELIVERY_MODE`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_APP_URL`, `INVITATION_TTL_HOURS`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_APP_NAME`, `REDIS_URL`, `MAX_REQUEST_BYTES`, and `RATE_LIMIT_PER_MINUTE`.

Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Values prefixed with `VITE_` are public browser configuration; never put service-role or other secrets there.

## Database and local infrastructure

```powershell
docker compose up -d postgres qdrant redis
python -m alembic upgrade head
python -m alembic downgrade -1   # development rollback only
```

The relational application data belongs in PostgreSQL. Redis enforces API rate limits, and Qdrant is provisioned for a later RAG phase. Back up PostgreSQL with managed point-in-time recovery plus tested logical exports; snapshot Qdrant independently after ingestion is implemented.

PostgreSQL is exposed on `localhost:5433` by default to avoid conflicts with native Windows PostgreSQL installations. Containers on the Compose network use `postgres:5432`.

Qdrant is exposed on `http://localhost:6335` by default because port `6333` is commonly occupied by other local projects. Override `QDRANT_HTTP_PORT` if needed; containers on this Compose network always use `qdrant:6333`.

## Verification

```powershell
python -m pytest
Set-Location frontend
npm run build
npm audit --audit-level=high
```

The API is at `http://localhost:8000`, OpenAPI at `/docs`, health at `/health`, and readiness at `/ready`.

## Production notes

Build the API image from `backend/Dockerfile` and the static client from `frontend/Dockerfile`. Production startup fails closed unless PostgreSQL, Supabase, Resend with a verified sender, HTTPS public URLs, explicit CORS, OpenRouter, and a non-local Redis service are configured. Run migrations as a controlled release step and keep PostgreSQL/Qdrant/Redis on private networks. Staging must use separate projects and credentials. Do not enable candidate media, AI evaluation, or monitoring until the remaining consent, retention, provider, and review controls in the security review are implemented.


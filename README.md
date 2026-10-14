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

In a second terminal:

```powershell
Set-Location frontend
npm ci
npm run dev
```

General shells use `source .venv/bin/activate`; the remaining commands are identical.

## Supabase configuration

Create users with Supabase Auth and enable email verification. Copy the project URL and publishable key into both `.env` and `frontend/.env`. The backend validates access tokens with Supabase Auth, so no JWT secret or service-role key is required. Configure the Site URL and redirect allow-list for `http://localhost:5173/invite`.

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

Backend: `APP_ENV`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGINS`, `EMAIL_DELIVERY_MODE`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_APP_URL`, `INVITATION_TTL_HOURS`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, and `OPENROUTER_APP_NAME`.

Frontend: `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Values prefixed with `VITE_` are public browser configuration; never put service-role or other secrets there.

## Database and local infrastructure

```powershell
docker compose up -d postgres qdrant redis
python -m alembic upgrade head
python -m alembic downgrade -1   # development rollback only
```

The relational application data belongs in PostgreSQL. Qdrant and Redis are provisioned now for later RAG and job phases, but the current API does not claim to use them yet. Back up PostgreSQL with managed point-in-time recovery plus tested logical exports; snapshot Qdrant independently after ingestion is implemented.

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

Build the API image from `backend/Dockerfile` and the static client from `frontend/Dockerfile`. Set production CORS origins explicitly, run migrations as a controlled release step, and keep PostgreSQL/Qdrant/Redis on private networks. Staging must use separate projects and credentials. Do not enable candidate media, AI evaluation, or monitoring until the remaining consent, retention, provider, and review controls in the security review are implemented.


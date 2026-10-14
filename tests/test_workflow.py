import os
from datetime import datetime, timedelta, timezone

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test_interview_platform.db"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-with-sufficient-length"
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"
os.environ["EMAIL_DELIVERY_MODE"] = "console"

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.database import Base, SessionLocal, engine
from backend.auth import current_principal
from backend.config import get_settings
from backend.main import app
from backend.models import Invitation


def token(user_id: str, email: str) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "aud": "authenticated",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "test-secret-with-sufficient-length",
        algorithm="HS256",
    )


def auth(user_id: str, email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(user_id, email)}"}


@pytest.fixture(autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def bootstrap(client: TestClient, user: str, email: str, name: str):
    headers = auth(user, email)
    company = client.post("/api/v1/companies", json={"name": name}, headers=headers)
    assert company.status_code == 201, company.text
    job = client.post(
        "/api/v1/jobs",
        json={"title": "Backend Engineer", "description": "Build reliable Python services.", "required_skills": ["Python", "SQL"]},
        headers=headers,
    )
    assert job.status_code == 201, job.text
    interview = client.post(
        "/api/v1/interviews",
        json={"job_id": job.json()["id"], "name": "Core screen", "duration_minutes": 30, "attempt_limit": 1},
        headers=headers,
    )
    assert interview.status_code == 201, interview.text
    question = client.post(
        f"/api/v1/interviews/{interview.json()['id']}/questions",
        json={"text": "How do database transactions prevent races?", "position": 1, "time_limit_seconds": 180, "rubric": {"atomicity": 5}},
        headers=headers,
    )
    assert question.status_code == 201, question.text
    published = client.post(f"/api/v1/interviews/{interview.json()['id']}/publish", headers=headers)
    assert published.status_code == 200, published.text
    return headers, company.json(), job.json(), interview.json()


def invite_and_accept(client: TestClient, company_headers, job, interview, candidate_user="candidate-1", candidate_email="candidate@example.com"):
    invitation = client.post(
        "/api/v1/invitations",
        json={"email": candidate_email, "name": "Candidate", "job_id": job["id"], "template_id": interview["id"]},
        headers=company_headers,
    )
    assert invitation.status_code == 201, invitation.text
    accepted = client.post(
        "/api/v1/invitations/accept",
        json={"token": invitation.json()["token"]},
        headers=auth(candidate_user, candidate_email),
    )
    assert accepted.status_code == 200, accepted.text
    return invitation.json(), accepted.json(), auth(candidate_user, candidate_email)


def test_company_isolation_hides_other_tenant_jobs(client):
    headers_a, _, _, _ = bootstrap(client, "admin-a", "a@example.com", "Alpha")
    headers_b, _, _, _ = bootstrap(client, "admin-b", "b@example.com", "Beta")
    jobs_a = client.get("/api/v1/jobs", headers=headers_a)
    jobs_b = client.get("/api/v1/jobs", headers=headers_b)
    assert [job["title"] for job in jobs_a.json()] == ["Backend Engineer"]
    assert [job["title"] for job in jobs_b.json()] == ["Backend Engineer"]
    assert jobs_a.json()[0]["id"] != jobs_b.json()[0]["id"]


def test_invitation_is_email_bound_and_single_use(client):
    headers, _, job, interview = bootstrap(client, "admin", "admin@example.com", "Acme")
    invitation = client.post(
        "/api/v1/invitations",
        json={"email": "right@example.com", "job_id": job["id"], "template_id": interview["id"]},
        headers=headers,
    ).json()
    wrong = client.post(
        "/api/v1/invitations/accept",
        json={"token": invitation["token"]},
        headers=auth("candidate-wrong", "wrong@example.com"),
    )
    assert wrong.status_code == 403
    first = client.post(
        "/api/v1/invitations/accept",
        json={"token": invitation["token"]},
        headers=auth("candidate-right", "right@example.com"),
    )
    assert first.status_code == 200
    reused = client.post(
        "/api/v1/invitations/accept",
        json={"token": invitation["token"]},
        headers=auth("candidate-right", "right@example.com"),
    )
    assert reused.status_code == 409


def test_expired_invitation_fails(client):
    headers, _, job, interview = bootstrap(client, "admin", "admin@example.com", "Acme")
    invitation = client.post(
        "/api/v1/invitations",
        json={"email": "candidate@example.com", "job_id": job["id"], "template_id": interview["id"]},
        headers=headers,
    ).json()
    with SessionLocal() as db:
        record = db.scalar(select(Invitation).where(Invitation.id == invitation["id"]))
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    response = client.post(
        "/api/v1/invitations/accept",
        json={"token": invitation["token"]},
        headers=auth("candidate", "candidate@example.com"),
    )
    assert response.status_code == 410


def test_attempt_answer_and_company_controlled_reattempt(client):
    company_headers, _, job, interview = bootstrap(client, "admin", "admin@example.com", "Acme")
    _, assignment, candidate_headers = invite_and_accept(client, company_headers, job, interview)
    started = client.post(f"/api/v1/sessions/{assignment['id']}/attempts", headers=candidate_headers)
    assert started.status_code == 200
    attempt = started.json()
    resumed = client.post(f"/api/v1/sessions/{assignment['id']}/attempts", headers=candidate_headers)
    assert resumed.json()["id"] == attempt["id"]
    question_id = attempt["configuration_snapshot"]["questions"][0]["id"]
    answer = client.post(
        f"/api/v1/sessions/{attempt['id']}/answers",
        json={"question_id": question_id, "transcript": "Atomic commit and row locks prevent conflicting partial writes."},
        headers=candidate_headers,
    )
    assert answer.status_code == 201
    duplicate = client.post(
        f"/api/v1/sessions/{attempt['id']}/answers",
        json={"question_id": question_id, "transcript": "Duplicate"},
        headers=candidate_headers,
    )
    assert duplicate.status_code == 409
    assert client.post(f"/api/v1/sessions/{attempt['id']}/complete", headers=candidate_headers).status_code == 200
    denied = client.post(f"/api/v1/sessions/{assignment['id']}/attempts", headers=candidate_headers)
    assert denied.status_code == 403
    candidate_grant = client.post(
        f"/api/v1/reattempts/{assignment['id']}",
        json={"reason": "Candidate cannot grant this."},
        headers=candidate_headers,
    )
    assert candidate_grant.status_code == 403
    grant = client.post(
        f"/api/v1/reattempts/{assignment['id']}",
        json={"reason": "Verified audio upload failed during the first attempt."},
        headers=company_headers,
    )
    assert grant.status_code == 201
    second = client.post(f"/api/v1/sessions/{assignment['id']}/attempts", headers=candidate_headers)
    assert second.status_code == 200
    assert second.json()["attempt_number"] == 2


def test_candidate_cannot_access_another_assignment(client):
    company_headers, _, job, interview = bootstrap(client, "admin", "admin@example.com", "Acme")
    _, assignment, _ = invite_and_accept(client, company_headers, job, interview, "candidate-a", "a@candidate.com")
    response = client.post(
        f"/api/v1/sessions/{assignment['id']}/attempts",
        headers=auth("candidate-b", "b@candidate.com"),
    )
    assert response.status_code == 404


def test_supabase_auth_server_validates_production_tokens(monkeypatch):
    settings = get_settings()
    original = (settings.app_env, settings.supabase_url, settings.supabase_publishable_key)
    settings.app_env = "development"
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_publishable_key = "sb_publishable_test"

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"id": "supabase-user", "email": "user@example.com"}

    monkeypatch.setattr("backend.auth.httpx.get", lambda *args, **kwargs: Response())
    try:
        principal = current_principal(HTTPAuthorizationCredentials(scheme="Bearer", credentials="access-token"))
        assert principal.user_id == "supabase-user"
        assert principal.email == "user@example.com"
    finally:
        settings.app_env, settings.supabase_url, settings.supabase_publishable_key = original


def test_supabase_auth_server_rejects_invalid_tokens(monkeypatch):
    settings = get_settings()
    original = (settings.app_env, settings.supabase_url, settings.supabase_publishable_key)
    settings.app_env = "development"
    settings.supabase_url = "https://example.supabase.co"
    settings.supabase_publishable_key = "sb_publishable_test"

    class Response:
        status_code = 401

    monkeypatch.setattr("backend.auth.httpx.get", lambda *args, **kwargs: Response())
    try:
        with pytest.raises(HTTPException) as error:
            current_principal(HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid"))
        assert error.value.status_code == 401
    finally:
        settings.app_env, settings.supabase_url, settings.supabase_publishable_key = original


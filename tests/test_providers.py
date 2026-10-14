import json

from backend.config import Settings
import pytest

from backend.providers import OpenRouterQuestionProvider, ProviderError, ResendEmailProvider


class Response:
    def __init__(self, status_code: int, body: dict):
        self.status_code = status_code
        self.body = body

    def json(self):
        return self.body


def test_resend_sends_private_invitation_link(monkeypatch):
    captured = {}

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return Response(200, {"id": "email-123"})

    monkeypatch.setattr("backend.providers.httpx.post", post)
    settings = Settings(
        resend_api_key="resend-test-key",
        email_from="InterviewOS <interviews@example.com>",
        public_app_url="https://interviews.example.com",
    )
    message_id = ResendEmailProvider(settings).send_invitation(
        "candidate@example.com", "A <Candidate>", "Example & Co\r\nBcc: attacker@example.com", "Backend Engineer", "private-token"
    )
    assert message_id == "email-123"
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["json"]["to"] == ["candidate@example.com"]
    assert "private-token" in captured["json"]["html"]
    assert "/invite#token=private-token" in captured["json"]["html"]
    assert "/invite?token=" not in captured["json"]["html"]
    assert "A &lt;Candidate&gt;" in captured["json"]["html"]
    assert captured["json"]["subject"] == "Interview invitation from Example & Co Bcc: attacker@example.com"


def test_provider_placeholders_are_rejected_before_network_calls():
    with pytest.raises(ProviderError, match="Resend email is not configured"):
        ResendEmailProvider(Settings(resend_api_key="re_paste_your_key_here")).send_invitation(
            "candidate@example.com", None, "Example", "Engineer", "token"
        )
    with pytest.raises(ProviderError, match="OpenRouter is not configured"):
        OpenRouterQuestionProvider(Settings(openrouter_api_key="sk-or-v1-paste_your_key_here")).generate(
            job_title="Engineer",
            job_description="Build APIs.",
            required_skills=["Python"],
            existing_questions=[],
            count=1,
            difficulty="medium",
        )


def test_openrouter_returns_validated_structured_questions(monkeypatch):
    captured = {}
    content = {
        "questions": [
            {
                "text": "How would you make a transaction-safe attempt creation flow?",
                "difficulty": "hard",
                "competency": "Database reliability",
                "time_limit_seconds": 180,
                "criteria": [
                    {"name": "Atomicity", "description": "Explains atomic transaction boundaries.", "max_points": 5}
                ],
            }
        ]
    }

    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return Response(200, {"choices": [{"message": {"content": json.dumps(content)}}]})

    monkeypatch.setattr("backend.providers.httpx.post", post)
    settings = Settings(openrouter_api_key="openrouter-test-key")
    batch = OpenRouterQuestionProvider(settings).generate(
        job_title="Backend Engineer",
        job_description="Build reliable APIs and database workflows.",
        required_skills=["Python", "PostgreSQL"],
        existing_questions=[],
        count=1,
        difficulty="hard",
    )
    assert batch.questions[0].competency == "Database reliability"
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["json"]["response_format"]["type"] == "json_schema"
    schema = captured["json"]["response_format"]["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert all(definition["additionalProperties"] is False for definition in schema["$defs"].values())
    assert captured["json"]["provider"]["require_parameters"] is True


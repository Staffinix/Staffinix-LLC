import html
import json

import httpx

from backend.config import Settings, get_settings
from backend.schemas import GeneratedQuestionBatch


class ProviderError(RuntimeError):
    pass


class EmailProvider:
    def send_invitation(self, recipient: str, candidate_name: str | None, company_name: str, job_title: str, token: str) -> str:
        raise NotImplementedError


class ConsoleEmailProvider(EmailProvider):
    def send_invitation(self, recipient: str, candidate_name: str | None, company_name: str, job_title: str, token: str) -> str:
        return "console"


class ResendEmailProvider(EmailProvider):
    def __init__(self, settings: Settings):
        self.settings = settings

    def send_invitation(self, recipient: str, candidate_name: str | None, company_name: str, job_title: str, token: str) -> str:
        if not self.settings.resend_api_key or "paste_your_key_here" in self.settings.resend_api_key:
            raise ProviderError("Resend email is not configured")
        if not self.settings.email_from or "your-verified-domain.com" in self.settings.email_from:
            raise ProviderError("A verified Resend sender is not configured")
        invite_url = f"{self.settings.public_app_url.rstrip('/')}/invite#token={token}"
        safe_name = html.escape(candidate_name or "Candidate")
        safe_company = html.escape(company_name)
        safe_job = html.escape(job_title)
        safe_url = html.escape(invite_url, quote=True)
        subject_company = " ".join(company_name.splitlines()).strip()
        try:
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.settings.email_from,
                    "to": [recipient],
                    "subject": f"Interview invitation from {subject_company}",
                    "html": (
                        f"<p>Hello {safe_name},</p>"
                        f"<p>{safe_company} invited you to interview for <strong>{safe_job}</strong>.</p>"
                        f'<p><a href="{safe_url}">Accept invitation</a></p>'
                        "<p>This private link expires automatically and can be used only once.</p>"
                    ),
                },
                timeout=15,
            )
        except httpx.RequestError as exc:
            raise ProviderError("Email provider unavailable") from exc
        if response.status_code not in {200, 201}:
            raise ProviderError(f"Email provider rejected the request ({response.status_code})")
        try:
            message_id = response.json().get("id")
        except ValueError as exc:
            raise ProviderError("Email provider returned an invalid response") from exc
        if not message_id:
            raise ProviderError("Email provider did not return a message ID")
        return str(message_id)


def get_email_provider(settings: Settings | None = None) -> EmailProvider:
    settings = settings or get_settings()
    if settings.email_delivery_mode == "console":
        return ConsoleEmailProvider()
    if settings.email_delivery_mode == "resend":
        return ResendEmailProvider(settings)
    raise ProviderError(f"Unsupported email delivery mode: {settings.email_delivery_mode}")


class OpenRouterQuestionProvider:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def generate(self, *, job_title: str, job_description: str, required_skills: list[str], existing_questions: list[str], count: int, difficulty: str) -> GeneratedQuestionBatch:
        if not self.settings.openrouter_api_key or "paste_your_key_here" in self.settings.openrouter_api_key:
            raise ProviderError("OpenRouter is not configured")
        schema = GeneratedQuestionBatch.model_json_schema()
        prompt = {
            "job_title": job_title,
            "job_description": job_description,
            "required_skills": required_skills,
            "question_count": count,
            "difficulty": difficulty,
            "existing_questions_to_avoid": existing_questions,
        }
        try:
            response = httpx.post(
                f"{self.settings.openrouter_base_url.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": self.settings.public_app_url,
                    "X-Title": self.settings.openrouter_app_name,
                },
                json={
                    "model": self.settings.openrouter_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Create fair interview questions grounded only in the supplied job details. "
                                "Do not infer company policy or score accent, speaking style, personality, or protected traits. "
                                "Return exactly the requested number of distinct questions and explicit scoring criteria."
                            ),
                        },
                        {"role": "user", "content": json.dumps(prompt)},
                    ],
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {"name": "interview_questions", "strict": True, "schema": schema},
                    },
                    "provider": {"require_parameters": True},
                    "temperature": 0.2,
                },
                timeout=60,
            )
        except httpx.RequestError as exc:
            raise ProviderError("AI provider unavailable") from exc
        if response.status_code != 200:
            raise ProviderError(f"AI provider rejected the request ({response.status_code})")
        try:
            content = response.json()["choices"][0]["message"]["content"]
            batch = GeneratedQuestionBatch.model_validate_json(content)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError("AI provider returned invalid structured output") from exc
        if len(batch.questions) != count:
            raise ProviderError("AI provider returned the wrong number of questions")
        normalized = [question.text.casefold().strip() for question in batch.questions]
        existing = {question.casefold().strip() for question in existing_questions}
        if len(set(normalized)) != len(normalized) or any(question in existing for question in normalized):
            raise ProviderError("AI provider returned duplicate questions")
        return batch

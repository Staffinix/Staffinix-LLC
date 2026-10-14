from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class CompanyRead(ORMModel):
    id: str
    name: str


class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=20_000)
    required_skills: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("required_skills")
    @classmethod
    def unique_skills(cls, value: list[str]) -> list[str]:
        cleaned = [skill.strip() for skill in value if skill.strip()]
        if len(set(map(str.casefold, cleaned))) != len(cleaned):
            raise ValueError("required_skills must be unique")
        return cleaned


class JobRead(ORMModel):
    id: str
    title: str
    description: str
    required_skills: list[str]


class QuestionCreate(BaseModel):
    text: str = Field(min_length=5, max_length=5000)
    position: int = Field(ge=1, le=200)
    time_limit_seconds: int = Field(ge=30, le=3600)
    rubric: dict = Field(default_factory=dict)


class QuestionGenerationRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=20)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"


class GeneratedCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=5, max_length=500)
    max_points: int = Field(ge=1, le=100)


class GeneratedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=10, max_length=5000)
    difficulty: Literal["easy", "medium", "hard"]
    competency: str = Field(min_length=2, max_length=160)
    time_limit_seconds: int = Field(ge=30, le=3600)
    criteria: list[GeneratedCriterion] = Field(min_length=1, max_length=10)


class GeneratedQuestionBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: list[GeneratedQuestion] = Field(min_length=1, max_length=20)


class TemplateCreate(BaseModel):
    job_id: str
    name: str = Field(min_length=2, max_length=160)
    duration_minutes: int = Field(ge=5, le=480)
    attempt_limit: int = Field(default=1, ge=1, le=10)


class TemplateRead(ORMModel):
    id: str
    job_id: str
    name: str
    duration_minutes: int
    attempt_limit: int
    published: bool


class InvitationCreate(BaseModel):
    email: EmailStr
    name: str | None = Field(default=None, max_length=160)
    job_id: str
    template_id: str


class InvitationRead(BaseModel):
    id: str
    expires_at: datetime
    delivery_status: str
    token: str | None = None


class InvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=512)


class AssignmentRead(ORMModel):
    id: str
    template_id: str
    available_until: datetime


class AnswerCreate(BaseModel):
    question_id: str
    transcript: str = Field(min_length=1, max_length=50_000)


class AttemptRead(ORMModel):
    id: str
    assignment_id: str
    attempt_number: int
    status: str
    started_at: datetime
    deadline_at: datetime
    configuration_snapshot: dict


class ReattemptCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)
    expires_at: datetime | None = None


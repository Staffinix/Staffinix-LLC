from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.auth import CompanyContext, Principal, company_context, current_principal, require_roles
from backend.config import get_settings
from backend.database import get_db
from backend.models import (
    Answer,
    Assignment,
    Attempt,
    AttemptStatus,
    Candidate,
    Company,
    InterviewTemplate,
    Invitation,
    Job,
    Membership,
    Question,
    ReattemptPermission,
    Role,
)
from backend.schemas import (
    AnswerCreate,
    AssignmentRead,
    AttemptRead,
    CompanyCreate,
    CompanyRead,
    InvitationAccept,
    InvitationCreate,
    InvitationRead,
    JobCreate,
    JobRead,
    QuestionCreate,
    ReattemptCreate,
    TemplateCreate,
    TemplateRead,
)
from backend.services import accept_invitation, audit, aware, create_invitation_token, now, start_attempt


router = APIRouter(prefix="/api/v1")
manager = require_roles(Role.admin, Role.hr_manager)


@router.post("/companies", response_model=CompanyRead, status_code=201)
def create_company(
    body: CompanyCreate,
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
):
    if db.scalar(select(Membership).where(Membership.auth_user_id == principal.user_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "User already belongs to a company")
    company = Company(name=body.name.strip())
    db.add(company)
    db.flush()
    db.add(Membership(auth_user_id=principal.user_id, company_id=company.id, role=Role.admin))
    audit(db, company.id, principal.user_id, "company.create", company)
    db.commit()
    return company


@router.get("/companies/me", response_model=CompanyRead)
def my_company(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    return db.get(Company, context.company_id)


@router.post("/jobs", response_model=JobRead, status_code=201)
def create_job(body: JobCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    job = Job(company_id=context.company_id, **body.model_dump())
    db.add(job)
    db.flush()
    audit(db, context.company_id, context.principal.user_id, "job.create", job)
    db.commit()
    return job


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    return db.scalars(select(Job).where(Job.company_id == context.company_id).order_by(Job.created_at)).all()


@router.post("/interviews", response_model=TemplateRead, status_code=201)
def create_template(body: TemplateCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    job = db.scalar(select(Job).where(Job.id == body.job_id, Job.company_id == context.company_id))
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    template = InterviewTemplate(company_id=context.company_id, **body.model_dump())
    db.add(template)
    db.flush()
    audit(db, context.company_id, context.principal.user_id, "interview.create", template)
    db.commit()
    return template


def tenant_template(db: Session, template_id: str, company_id: str) -> InterviewTemplate:
    template = db.scalar(
        select(InterviewTemplate)
        .options(selectinload(InterviewTemplate.questions))
        .where(InterviewTemplate.id == template_id, InterviewTemplate.company_id == company_id)
    )
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    return template


@router.post("/interviews/{template_id}/questions", status_code=201)
def add_question(template_id: str, body: QuestionCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    template = tenant_template(db, template_id, context.company_id)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    question = Question(template_id=template.id, approved=True, **body.model_dump())
    db.add(question)
    db.flush()
    audit(db, context.company_id, context.principal.user_id, "question.create", question)
    db.commit()
    return {"id": question.id, "approved": question.approved}


@router.post("/interviews/{template_id}/publish", response_model=TemplateRead)
def publish_template(template_id: str, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    template = tenant_template(db, template_id, context.company_id)
    if not any(question.approved for question in template.questions):
        raise HTTPException(status.HTTP_409_CONFLICT, "Approve at least one question")
    template.published = True
    audit(db, context.company_id, context.principal.user_id, "interview.publish", template)
    db.commit()
    return template


@router.post("/invitations", response_model=InvitationRead, status_code=201)
def create_invitation(body: InvitationCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    template = tenant_template(db, body.template_id, context.company_id)
    if template.job_id != body.job_id or not template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interview and job must match")
    normalized_email = str(body.email).casefold()
    candidate = db.scalar(select(Candidate).where(Candidate.company_id == context.company_id, Candidate.email == normalized_email))
    if candidate is None:
        candidate = Candidate(company_id=context.company_id, email=normalized_email, name=body.name)
        db.add(candidate)
        db.flush()
    raw_token, hashed = create_invitation_token()
    invitation = Invitation(
        token_hash=hashed,
        company_id=context.company_id,
        candidate_id=candidate.id,
        job_id=body.job_id,
        template_id=body.template_id,
        expires_at=now() + timedelta(hours=get_settings().invitation_ttl_hours),
    )
    db.add(invitation)
    db.flush()
    audit(db, context.company_id, context.principal.user_id, "invitation.create", invitation)
    db.commit()
    console = get_settings().email_delivery_mode == "console"
    return InvitationRead(id=invitation.id, expires_at=invitation.expires_at, delivery_status="console" if console else "queued", token=raw_token if console else None)


@router.post("/invitations/accept", response_model=AssignmentRead)
def use_invitation(body: InvitationAccept, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return accept_invitation(db, body.token, principal.user_id, principal.email)


def candidate_assignment(db: Session, assignment_id: str, user_id: str) -> tuple[Assignment, InterviewTemplate]:
    assignment = db.scalar(
        select(Assignment)
        .join(Candidate)
        .where(Assignment.id == assignment_id, Candidate.auth_user_id == user_id)
    )
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    template = db.scalar(
        select(InterviewTemplate)
        .options(selectinload(InterviewTemplate.questions))
        .where(InterviewTemplate.id == assignment.template_id)
    )
    return assignment, template


@router.get("/sessions", response_model=list[AssignmentRead])
def candidate_sessions(principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    return db.scalars(select(Assignment).join(Candidate).where(Candidate.auth_user_id == principal.user_id)).all()


@router.post("/sessions/{assignment_id}/attempts", response_model=AttemptRead)
def begin_attempt(assignment_id: str, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    assignment, template = candidate_assignment(db, assignment_id, principal.user_id)
    return start_attempt(db, assignment, template, principal.user_id)


def candidate_attempt(db: Session, attempt_id: str, user_id: str) -> Attempt:
    attempt = db.scalar(
        select(Attempt)
        .join(Assignment)
        .join(Candidate)
        .where(Attempt.id == attempt_id, Candidate.auth_user_id == user_id)
    )
    if attempt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    if attempt.status == AttemptStatus.active and aware(attempt.deadline_at) <= now():
        attempt.status = AttemptStatus.expired
        db.commit()
    return attempt


@router.post("/sessions/{attempt_id}/answers", status_code=201)
def submit_answer(attempt_id: str, body: AnswerCreate, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    attempt = candidate_attempt(db, attempt_id, principal.user_id)
    if attempt.status != AttemptStatus.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Attempt is not active")
    allowed_ids = {item["id"] for item in attempt.configuration_snapshot["questions"]}
    if body.question_id not in allowed_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not in this attempt")
    answer = Answer(attempt_id=attempt.id, **body.model_dump())
    db.add(answer)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Answer already submitted") from exc
    assignment = db.get(Assignment, attempt.assignment_id)
    audit(db, assignment.company_id, principal.user_id, "answer.submit", answer)
    db.commit()
    return {"id": answer.id, "submitted_at": answer.submitted_at}


@router.post("/sessions/{attempt_id}/complete", response_model=AttemptRead)
def complete_attempt(attempt_id: str, principal: Principal = Depends(current_principal), db: Session = Depends(get_db)):
    attempt = candidate_attempt(db, attempt_id, principal.user_id)
    if attempt.status != AttemptStatus.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Attempt is not active")
    attempt.status = AttemptStatus.completed
    attempt.completed_at = now()
    assignment = db.get(Assignment, attempt.assignment_id)
    audit(db, assignment.company_id, principal.user_id, "attempt.complete", attempt)
    db.commit()
    return attempt


@router.post("/reattempts/{assignment_id}", status_code=201)
def grant_reattempt(assignment_id: str, body: ReattemptCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    assignment = db.scalar(select(Assignment).where(Assignment.id == assignment_id, Assignment.company_id == context.company_id))
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    permission = ReattemptPermission(assignment_id=assignment.id, granted_by=context.principal.user_id, **body.model_dump())
    db.add(permission)
    db.flush()
    audit(db, context.company_id, context.principal.user_id, "reattempt.grant", permission)
    db.commit()
    return {"id": permission.id, "reason": permission.reason}


from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
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
    Notification,
    Question,
    ReattemptPermission,
    Role,
)
from backend.pdf_questions import MAX_PDF_BYTES, PdfQuestionError, extract_pdf_questions
from backend.schemas import (
    AnswerCreate,
    AssignmentRead,
    AttemptRead,
    CompanyCreate,
    CompanyRead,
    InvitationAccept,
    InvitationCreate,
    InvitationExpiryRead,
    InvitationExpiryUpdate,
    InvitationRead,
    JobCreate,
    JobRead,
    QuestionBulkApprovalRequest,
    QuestionCreate,
    QuestionGenerationRequest,
    QuestionImportRequest,
    QuestionRead,
    PdfQuestionExtraction,
    ReattemptCreate,
    TemplateCreate,
    TemplateRead,
)
from backend.providers import OpenRouterQuestionProvider, ProviderError, get_email_provider
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
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "User already belongs to a company") from exc
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


@router.get("/interviews", response_model=list[TemplateRead])
def list_templates(
    job_id: str | None = None,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    statement = select(InterviewTemplate).where(InterviewTemplate.company_id == context.company_id)
    if job_id:
        statement = statement.where(InterviewTemplate.job_id == job_id)
    return db.scalars(statement.order_by(InterviewTemplate.created_at)).all()


def tenant_template(db: Session, template_id: str, company_id: str, *, lock: bool = False) -> InterviewTemplate:
    statement = (
        select(InterviewTemplate)
        .options(selectinload(InterviewTemplate.questions))
        .where(InterviewTemplate.id == template_id, InterviewTemplate.company_id == company_id)
    )
    if lock:
        statement = statement.with_for_update()
    template = db.scalar(statement)
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview not found")
    return template


@router.get("/interviews/{template_id}/questions", response_model=list[QuestionRead])
def list_questions(
    template_id: str,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    template = tenant_template(db, template_id, context.company_id)
    return sorted(template.questions, key=lambda question: question.position)


@router.post("/interviews/{template_id}/questions", status_code=201)
def add_question(template_id: str, body: QuestionCreate, context: CompanyContext = Depends(manager), db: Session = Depends(get_db)):
    template = tenant_template(db, template_id, context.company_id, lock=True)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    question = Question(template_id=template.id, approved=True, **body.model_dump())
    db.add(question)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Question position already exists") from exc
    audit(db, context.company_id, context.principal.user_id, "question.create", question)
    db.commit()
    return {"id": question.id, "approved": question.approved}


@router.post("/interviews/{template_id}/questions/extract-pdf", response_model=PdfQuestionExtraction)
async def extract_questions_from_pdf(
    template_id: str,
    file: UploadFile = File(...),
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    template = tenant_template(db, template_id, context.company_id)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a PDF file")
    data = await file.read(MAX_PDF_BYTES + 1)
    await file.close()
    try:
        return PdfQuestionExtraction(questions=extract_pdf_questions(data))
    except PdfQuestionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.post("/interviews/{template_id}/questions/import", response_model=list[QuestionRead], status_code=201)
def import_questions(
    template_id: str,
    body: QuestionImportRequest,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    template = tenant_template(db, template_id, context.company_id, lock=True)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    existing = {question.text.strip().casefold() for question in template.questions}
    new_questions = [text for text in body.questions if text.casefold() not in existing]
    if not new_questions:
        raise HTTPException(status.HTTP_409_CONFLICT, "All selected questions already exist in this interview")
    next_position = (db.scalar(select(func.max(Question.position)).where(Question.template_id == template.id)) or 0) + 1
    if next_position + len(new_questions) - 1 > 200:
        raise HTTPException(status.HTTP_409_CONFLICT, "An interview can contain at most 200 questions")
    created = []
    for offset, text in enumerate(new_questions):
        question = Question(
            template_id=template.id,
            text=text,
            position=next_position + offset,
            time_limit_seconds=body.time_limit_seconds,
            approved=True,
            rubric={"source": "pdf"},
        )
        db.add(question)
        db.flush()
        audit(db, context.company_id, context.principal.user_id, "question.import", question)
        created.append(question)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Questions were added concurrently; import again") from exc
    return created


@router.post("/interviews/{template_id}/questions/generate", status_code=201)
def generate_questions(
    template_id: str,
    body: QuestionGenerationRequest,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    template = tenant_template(db, template_id, context.company_id)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    job = db.scalar(select(Job).where(Job.id == template.job_id, Job.company_id == context.company_id))
    try:
        batch = OpenRouterQuestionProvider().generate(
            job_title=job.title,
            job_description=job.description,
            required_skills=job.required_skills,
            existing_questions=[question.text for question in template.questions],
            count=body.count,
            difficulty=body.difficulty,
        )
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    template = tenant_template(db, template_id, context.company_id, lock=True)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    next_position = (db.scalar(select(func.max(Question.position)).where(Question.template_id == template.id)) or 0) + 1
    created = []
    for offset, generated in enumerate(batch.questions):
        rubric = {
            "difficulty": generated.difficulty,
            "competency": generated.competency,
            "criteria": [criterion.model_dump() for criterion in generated.criteria],
            "maximum_marks": sum(criterion.max_points for criterion in generated.criteria),
            "provider": "openrouter",
            "model": get_settings().openrouter_model,
        }
        question = Question(
            template_id=template.id,
            text=generated.text,
            position=next_position + offset,
            time_limit_seconds=generated.time_limit_seconds,
            approved=False,
            rubric=rubric,
        )
        db.add(question)
        db.flush()
        audit(db, context.company_id, context.principal.user_id, "question.generate", question)
        created.append({"id": question.id, "text": question.text, "approved": False, "rubric": rubric})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Questions were added concurrently; generate again") from exc
    return created


@router.post("/questions/{question_id}/approve")
def approve_question(
    question_id: str,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    question = db.scalar(
        select(Question)
        .join(InterviewTemplate)
        .where(Question.id == question_id, InterviewTemplate.company_id == context.company_id)
    )
    if question is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    template = db.get(InterviewTemplate, question.template_id)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    question.approved = True
    audit(db, context.company_id, context.principal.user_id, "question.approve", question)
    db.commit()
    return {"id": question.id, "approved": True}


@router.post("/questions/{question_id}/deselect")
def deselect_question(
    question_id: str,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    question = db.scalar(
        select(Question)
        .join(InterviewTemplate)
        .where(Question.id == question_id, InterviewTemplate.company_id == context.company_id)
    )
    if question is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")
    template = db.get(InterviewTemplate, question.template_id)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    question.approved = False
    audit(db, context.company_id, context.principal.user_id, "question.deselect", question)
    db.commit()
    return {"id": question.id, "approved": False}


@router.post("/interviews/{template_id}/questions/approval")
def set_all_question_approvals(
    template_id: str,
    body: QuestionBulkApprovalRequest,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    template = tenant_template(db, template_id, context.company_id, lock=True)
    if template.published:
        raise HTTPException(status.HTTP_409_CONFLICT, "Published interviews are immutable")
    for question in template.questions:
        if question.approved != body.approved:
            question.approved = body.approved
            audit(db, context.company_id, context.principal.user_id, "question.approval.bulk", question)
    db.commit()
    return {"approved": body.approved, "count": len(template.questions)}


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
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Candidate was created concurrently; retry invitation") from exc
    raw_token, hashed = create_invitation_token()
    invitation = Invitation(
        token_hash=hashed,
        company_id=context.company_id,
        candidate_id=candidate.id,
        job_id=body.job_id,
        template_id=body.template_id,
        expires_at=body.expires_at or now() + timedelta(hours=get_settings().invitation_ttl_hours),
    )
    db.add(invitation)
    db.flush()
    notification = Notification(
        company_id=context.company_id,
        candidate_id=candidate.id,
        recipient=normalized_email,
        template="candidate_invitation",
        status="pending",
    )
    db.add(notification)
    audit(db, context.company_id, context.principal.user_id, "invitation.create", invitation)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Invitation was created concurrently; retry") from exc
    settings = get_settings()
    console = settings.email_delivery_mode == "console"
    company = db.get(Company, context.company_id)
    job = db.get(Job, body.job_id)
    try:
        notification.provider_message_id = get_email_provider(settings).send_invitation(
            normalized_email,
            candidate.name,
            company.name,
            job.title,
            raw_token,
        )
        notification.status = "sent" if not console else "console"
        audit(db, context.company_id, context.principal.user_id, "invitation.deliver", invitation)
        db.commit()
    except ProviderError as exc:
        # shortcut: synchronous delivery is sufficient for initial volume; use a transactional outbox before scaling.
        invitation.revoked_at = now()
        notification.status = "failed"
        notification.error = str(exc)[:500]
        audit(db, context.company_id, context.principal.user_id, "invitation.delivery_failed", invitation)
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return InvitationRead(
        id=invitation.id,
        expires_at=invitation.expires_at,
        delivery_status=notification.status,
        token=raw_token if console else None,
    )


@router.patch("/invitations/{invitation_id}", response_model=InvitationExpiryRead)
def update_invitation_expiry(
    invitation_id: str,
    body: InvitationExpiryUpdate,
    context: CompanyContext = Depends(manager),
    db: Session = Depends(get_db),
):
    invitation = db.scalar(
        select(Invitation)
        .where(Invitation.id == invitation_id, Invitation.company_id == context.company_id)
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    if invitation.accepted_at or invitation.revoked_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invitation is no longer editable")
    invitation.expires_at = body.expires_at
    audit(db, context.company_id, context.principal.user_id, "invitation.expiry.update", invitation)
    db.commit()
    return InvitationExpiryRead(id=invitation.id, expires_at=invitation.expires_at)


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


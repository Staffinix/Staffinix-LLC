from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.models import Membership, Role


bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    user_id: str
    email: str | None


def current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Principal:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    settings = get_settings()
    if settings.app_env != "test":
        if not settings.supabase_url or not settings.supabase_publishable_key:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Supabase Auth is not configured")
        try:
            response = httpx.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
                timeout=5,
            )
        except httpx.RequestError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication service unavailable") from exc
        if response.status_code != status.HTTP_200_OK:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token")
        try:
            payload = response.json()
        except ValueError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token") from exc
        if not isinstance(payload, dict) or not payload.get("id"):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token")
        return Principal(user_id=payload["id"], email=payload.get("email"))

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_audience,
            options={"require": ["exp", "sub"]},
        )
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token") from exc
    return Principal(user_id=payload["sub"], email=payload.get("email"))


@dataclass(frozen=True)
class CompanyContext:
    principal: Principal
    company_id: str
    role: Role


def company_context(
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> CompanyContext:
    membership = db.scalar(
        select(Membership).where(
            Membership.auth_user_id == principal.user_id,
            Membership.active.is_(True),
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Active company membership required")
    return CompanyContext(principal, membership.company_id, membership.role)


def require_roles(*roles: Role):
    def dependency(context: CompanyContext = Depends(company_context)) -> CompanyContext:
        if context.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permission")
        return context

    return dependency


import hashlib
import logging
import re
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError

from backend.api import router
from backend.config import get_settings
from backend.database import Base, engine


logger = logging.getLogger("interview_platform.security")
settings = get_settings()
redis = Redis.from_url(settings.redis_url, decode_responses=True)
request_id_pattern = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def rate_policy(path: str) -> tuple[str, int]:
    if path.endswith("/questions/generate"):
        return "ai-generation", 10
    if path == "/api/v1/invitations":
        return "invitations", 20
    return "api", settings.rate_limit_per_minute


async def rate_limited(request: Request) -> bool:
    if settings.app_env == "test" or not request.url.path.startswith("/api/"):
        return False
    group, limit = rate_policy(request.url.path)
    client = request.client.host if request.client else "unknown"
    identity = hashlib.sha256(client.encode()).hexdigest()[:24]
    key = f"rate:{group}:{identity}"
    try:
        count = await redis.eval(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
            1,
            key,
            60,
        )
    except RedisError:
        logger.exception("rate_limit_store_unavailable")
        if settings.app_env == "production":
            raise
        return False
    return int(count) > limit


def apply_security_headers(response, request_id: str, api_request: bool):
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if api_request:
        response.headers["Cache-Control"] = "no-store"
    return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    if get_settings().app_env == "test":
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Interview Platform API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in get_settings().cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
)


@app.middleware("http")
async def security_controls(request: Request, call_next):
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = supplied_request_id if request_id_pattern.fullmatch(supplied_request_id) else str(uuid.uuid4())
    api_request = request.url.path.startswith("/api/")
    content_length = request.headers.get("Content-Length")
    if content_length:
        try:
            declared_size = int(content_length)
            too_large = declared_size < 0 or declared_size > settings.max_request_bytes
        except ValueError:
            too_large = True
        if too_large:
            response = JSONResponse({"detail": "Request body too large"}, status_code=413)
            return apply_security_headers(response, request_id, api_request)
    if request.method in {"POST", "PUT", "PATCH"}:
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > settings.max_request_bytes:
                response = JSONResponse({"detail": "Request body too large"}, status_code=413)
                return apply_security_headers(response, request_id, api_request)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    try:
        if await rate_limited(request):
            response = JSONResponse({"detail": "Too many requests"}, status_code=429)
            response.headers["Retry-After"] = "60"
        else:
            response = await call_next(request)
    except RedisError:
        response = JSONResponse({"detail": "Request protection unavailable"}, status_code=503)
    if response.status_code in {401, 403, 429}:
        logger.warning(
            "request_denied request_id=%s method=%s path=%s status=%s client=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            request.client.host if request.client else "unknown",
        )
    return apply_security_headers(response, request_id, api_request)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    return {"status": "ready"}


app.include_router(router)

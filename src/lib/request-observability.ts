import type { ApplicationErrorCode } from "./application-error";

export interface RequestLogEvent {
  request_id: string;
  timestamp: string;
  operation: string;
  authenticated_user_id: string | null;
  tenant_id: string | null;
  status: number;
  duration_ms: number;
  error_code: ApplicationErrorCode | null;
}

interface MutableRequestContext {
  requestId: string;
  startedAt: number;
  timestamp: string;
  operation: string;
  authenticatedUserId: string | null;
  tenantId: string | null;
  errorCode: ApplicationErrorCode | null;
}

const requestContexts = new WeakMap<Request, MutableRequestContext>();
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sanitizeOperation(value: string): string {
  const withoutQuery = value.split("?", 1)[0] || "/";
  return withoutQuery.replace(/[^a-zA-Z0-9_./:-]/g, "_").slice(0, 160);
}

function createRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function beginRequestObservation(
  request: Request,
  operation: string,
): MutableRequestContext {
  const context: MutableRequestContext = {
    requestId: createRequestId(request),
    startedAt: performance.now(),
    timestamp: new Date().toISOString(),
    operation: sanitizeOperation(operation),
    authenticatedUserId: null,
    tenantId: null,
    errorCode: null,
  };
  requestContexts.set(request, context);
  return context;
}

export function setAuthenticatedRequestContext(
  request: Request,
  authenticatedUserId: string,
  tenantId: string | null,
): void {
  const context = requestContexts.get(request);
  if (!context) return;
  context.authenticatedUserId = authenticatedUserId;
  context.tenantId = tenantId;
}

export function setRequestErrorCode(request: Request, errorCode: ApplicationErrorCode): void {
  const context = requestContexts.get(request);
  if (context) context.errorCode = errorCode;
}

export function completeRequestObservation(
  context: MutableRequestContext,
  status: number,
): RequestLogEvent {
  return {
    request_id: context.requestId,
    timestamp: context.timestamp,
    operation: context.operation,
    authenticated_user_id: context.authenticatedUserId,
    tenant_id: context.tenantId,
    status,
    duration_ms: Math.max(0, Math.round((performance.now() - context.startedAt) * 100) / 100),
    error_code: context.errorCode,
  };
}

/**
 * Emit only the fixed, scalar RequestLogEvent schema. Never pass request data,
 * headers, tokens, error objects, candidate data, or arbitrary metadata here.
 */
export function writeRequestLog(event: RequestLogEvent): void {
  const serialized = JSON.stringify({
    request_id: event.request_id,
    timestamp: event.timestamp,
    operation: event.operation,
    authenticated_user_id: event.authenticated_user_id,
    tenant_id: event.tenant_id,
    status: event.status,
    duration_ms: event.duration_ms,
    error_code: event.error_code,
  } satisfies RequestLogEvent);
  if (event.status >= 500) console.error(serialized);
  else if (event.status >= 400) console.warn(serialized);
  else console.info(serialized);
}

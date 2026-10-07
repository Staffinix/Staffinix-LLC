import { ApplicationError } from "../../lib/application-error.ts";

const MAX_ACCESS_TOKEN_LENGTH = 16_384;
const BEARER_CREDENTIAL = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

export class UnauthorizedError extends ApplicationError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", { message });
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Extract one compact-JWT Supabase access token from an HTTP request.
 * No cookie, custom header, query-string, or body fallback is permitted.
 */
export function extractAccessToken(request: Request): string {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    throw new UnauthorizedError("Authorization header is required.");
  }

  if (authorization.length > MAX_ACCESS_TOKEN_LENGTH) {
    throw new UnauthorizedError("Authorization header is too large.");
  }

  const match = BEARER_CREDENTIAL.exec(authorization);
  if (!match) {
    throw new UnauthorizedError(
      "Authorization header must contain exactly one Bearer access token.",
    );
  }

  return match[1];
}

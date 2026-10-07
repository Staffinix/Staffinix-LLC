export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "DEPENDENCY_ERROR",
  "INTERNAL_ERROR",
] as const;

export type ApplicationErrorCode = (typeof ERROR_CODES)[number];

const DEFAULTS: Record<ApplicationErrorCode, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: "The request is invalid." },
  UNAUTHORIZED: { status: 401, message: "Authentication is required." },
  FORBIDDEN: { status: 403, message: "You are not authorized to perform this operation." },
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  CONFLICT: { status: 409, message: "The request conflicts with the current resource state." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Please try again later." },
  DEPENDENCY_ERROR: { status: 503, message: "A required service is temporarily unavailable." },
  INTERNAL_ERROR: { status: 500, message: "An unexpected server error occurred." },
};

export class ApplicationError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly code: ApplicationErrorCode;

  constructor(
    code: ApplicationErrorCode,
    options: { message?: string; status?: number; cause?: unknown } = {},
  ) {
    const defaults = DEFAULTS[code];
    super(options.message ?? defaults.message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = code;
    this.status = options.status ?? defaults.status;
    this.statusCode = this.status;
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }
}

export function dependencyError(cause?: unknown): ApplicationError {
  return new ApplicationError("DEPENDENCY_ERROR", { cause });
}

export function toApplicationError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;

  if (error != null && typeof error === "object") {
    const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown };
    if (candidate.name === "ZodError") {
      return new ApplicationError("VALIDATION_ERROR", { cause: error });
    }

    const status =
      typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : typeof candidate.status === "number"
          ? candidate.status
          : undefined;
    if (status === 400 || status === 413 || status === 422) {
      return new ApplicationError("VALIDATION_ERROR", { status, cause: error });
    }
    if (status === 401) return new ApplicationError("UNAUTHORIZED", { cause: error });
    if (status === 403) return new ApplicationError("FORBIDDEN", { cause: error });
    if (status === 404) return new ApplicationError("NOT_FOUND", { cause: error });
    if (status === 409) return new ApplicationError("CONFLICT", { cause: error });
    if (status === 429) return new ApplicationError("RATE_LIMITED", { cause: error });
    if (status != null && status >= 502 && status <= 504) {
      return new ApplicationError("DEPENDENCY_ERROR", { status, cause: error });
    }
  }

  return new ApplicationError("INTERNAL_ERROR", { cause: error });
}

export function serializeApplicationError(error: ApplicationError) {
  return { error: { code: error.code, message: error.message } };
}

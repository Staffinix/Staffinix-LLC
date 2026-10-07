import { ApplicationError } from "../../lib/application-error.ts";

export const MAX_SERVER_FUNCTION_BODY_BYTES = 1_048_576;

export class PayloadTooLargeError extends ApplicationError {
  constructor() {
    super("VALIDATION_ERROR", { message: "Request payload exceeds the 1 MiB limit.", status: 413 });
    this.name = "PayloadTooLargeError";
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export function assertDeclaredRequestBodyWithinLimit(
  request: Request,
  maximumBytes = MAX_SERVER_FUNCTION_BODY_BYTES,
): void {
  const declaredLength = request.headers.get("content-length");
  if (!declaredLength) return;
  const bytes = Number(declaredLength);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumBytes) {
    throw new PayloadTooLargeError();
  }
}

export async function assertRequestBodyWithinLimit(
  request: Request,
  maximumBytes = MAX_SERVER_FUNCTION_BODY_BYTES,
): Promise<void> {
  assertDeclaredRequestBodyWithinLimit(request, maximumBytes);

  if (!request.body) return;
  const reader = request.clone().body?.getReader();
  if (!reader) return;

  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        void reader.cancel();
        throw new PayloadTooLargeError();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

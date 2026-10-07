import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { assertRequestBodyWithinLimit } from "@/integrations/http/request-size";
import { toApplicationError } from "@/lib/application-error";
import {
  beginRequestObservation,
  completeRequestObservation,
  setRequestErrorCode,
  writeRequestLog,
} from "@/lib/request-observability";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next, handlerType, request }) => {
  try {
    return await next();
  } catch (error) {
    const publicError = toApplicationError(error);
    setRequestErrorCode(request, publicError.code);
    if (handlerType === "serverFn") throw publicError;
    return new Response(renderErrorPage(), {
      status: publicError.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const observabilityMiddleware = createMiddleware().server(
  async ({ next, request, pathname, handlerType, serverFnMeta }) => {
    const operation = handlerType === "serverFn" ? serverFnMeta?.id || pathname : pathname;
    const observation = beginRequestObservation(request, operation);

    try {
      const result = await next();
      const response = result.response;
      const headers = new Headers(response.headers);
      headers.set("x-request-id", observation.requestId);
      const responseWithRequestId = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      writeRequestLog(completeRequestObservation(observation, response.status));
      return { ...result, response: responseWithRequestId };
    } catch (error) {
      const publicError = toApplicationError(error);
      setRequestErrorCode(request, publicError.code);
      writeRequestLog(completeRequestObservation(observation, publicError.status));
      throw error;
    }
  },
);

const payloadLimitMiddleware = createMiddleware().server(async ({ next, request, handlerType }) => {
  if (handlerType === "serverFn" || !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    await assertRequestBodyWithinLimit(request);
  }
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [
    observabilityMiddleware,
    errorMiddleware,
    payloadLimitMiddleware,
    csrfMiddleware,
  ],
}));

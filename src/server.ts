import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  beginRequestObservation,
  completeRequestObservation,
  setRequestErrorCode,
  writeRequestLog,
} from "./lib/request-observability";
import {
  assertDeclaredRequestBodyWithinLimit,
  PayloadTooLargeError,
} from "./integrations/http/request-size";
import { applySecurityHeaders } from "./integrations/http/security-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  // Clear the captured exception without serializing it; it may contain request data.
  consumeLastCapturedError();
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        assertDeclaredRequestBodyWithinLimit(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return applySecurityHeaders(
          request,
          new Response(JSON.stringify({ error: "Request payload exceeds the 1 MiB limit." }), {
            status: 413,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          }),
        );
      }
      const observation = beginRequestObservation(request, new URL(request.url).pathname);
      setRequestErrorCode(request, "INTERNAL_ERROR");
      writeRequestLog(completeRequestObservation(observation, 500));
      return applySecurityHeaders(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-request-id": observation.requestId,
          },
        }),
      );
    }
  },
};

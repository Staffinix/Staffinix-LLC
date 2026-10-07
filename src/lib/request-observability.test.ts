import assert from "node:assert/strict";
import test from "node:test";

import {
  beginRequestObservation,
  completeRequestObservation,
  setAuthenticatedRequestContext,
  setRequestErrorCode,
  writeRequestLog,
} from "./request-observability.ts";

test("uses a validated caller request ID and strips query data from operations", () => {
  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const request = new Request("https://example.test/candidates?email=private@example.test", {
    headers: { "x-request-id": requestId },
  });
  const context = beginRequestObservation(request, "/candidates?email=private@example.test");
  setAuthenticatedRequestContext(request, "user-id", "tenant-id");
  setRequestErrorCode(request, "FORBIDDEN");

  const event = completeRequestObservation(context, 403);
  assert.equal(event.request_id, requestId);
  assert.equal(event.operation, "/candidates");
  assert.equal(event.authenticated_user_id, "user-id");
  assert.equal(event.tenant_id, "tenant-id");
  assert.equal(event.error_code, "FORBIDDEN");
});

test("rejects unsafe request IDs and emits only the allowlisted schema", () => {
  const request = new Request("https://example.test/", {
    headers: { "x-request-id": "attacker-controlled-log-entry" },
  });
  const context = beginRequestObservation(request, "/");
  const event = completeRequestObservation(context, 200);
  const output: string[] = [];
  const originalInfo = console.info;
  console.info = (value?: unknown) => output.push(String(value));
  try {
    writeRequestLog({
      ...event,
      password: "must-not-appear",
      access_token: "must-not-appear",
      resume_contents: "must-not-appear",
    } as typeof event);
  } finally {
    console.info = originalInfo;
  }

  assert.match(event.request_id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(Object.keys(JSON.parse(output[0])).sort(), [
    "authenticated_user_id",
    "duration_ms",
    "error_code",
    "operation",
    "request_id",
    "status",
    "tenant_id",
    "timestamp",
  ]);
  assert.doesNotMatch(output[0], /must-not-appear/);
});

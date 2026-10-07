import assert from "node:assert/strict";
import test from "node:test";

import { assertRequestBodyWithinLimit, PayloadTooLargeError } from "./request-size.ts";

test("accepts a body at the configured limit", async () => {
  const request = new Request("https://example.invalid/server-fn", {
    method: "POST",
    body: "a".repeat(32),
  });
  await assert.doesNotReject(assertRequestBodyWithinLimit(request, 32));
});

test("rejects a declared content length above the limit", async () => {
  const request = new Request("https://example.invalid/server-fn", {
    method: "POST",
    headers: { "content-length": "33" },
    body: "small",
  });
  await assert.rejects(assertRequestBodyWithinLimit(request, 32), PayloadTooLargeError);
});

test("rejects a streamed body when content length is absent", async () => {
  const request = new Request("https://example.invalid/server-fn", {
    method: "POST",
    body: "a".repeat(33),
  });
  await assert.rejects(assertRequestBodyWithinLimit(request, 32), PayloadTooLargeError);
});

test("rejects malformed content length", async () => {
  const request = new Request("https://example.invalid/server-fn", {
    method: "POST",
    headers: { "content-length": "not-a-number" },
    body: "small",
  });
  await assert.rejects(assertRequestBodyWithinLimit(request, 32), PayloadTooLargeError);
});

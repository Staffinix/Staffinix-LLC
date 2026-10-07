import assert from "node:assert/strict";
import test from "node:test";

import { extractAccessToken, UnauthorizedError } from "./auth-header.ts";

const validToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWlkIn0.signature";

function request(authorization?: string, extraHeaders: HeadersInit = {}) {
  const headers = new Headers(extraHeaders);
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://staffinix.invalid/server-function", { headers });
}

test("accepts exactly one Bearer compact JWT", () => {
  assert.equal(extractAccessToken(request(`Bearer ${validToken}`)), validToken);
  assert.equal(extractAccessToken(request(`bearer ${validToken}`)), validToken);
});

for (const [name, authorization] of [
  ["missing header", undefined],
  ["empty credential", "Bearer "],
  ["wrong scheme", `Basic ${validToken}`],
  ["multiple spaces", `Bearer  ${validToken}`],
  ["trailing credential", `Bearer ${validToken} second-token`],
  ["publishable key", "Bearer sb_publishable_example"],
  ["non-JWT token", "Bearer attacker-controlled-user-id"],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => extractAccessToken(request(authorization)), UnauthorizedError);
  });
}

test("ignores all client-supplied identity fallbacks", () => {
  assert.throws(
    () =>
      extractAccessToken(
        request(undefined, {
          "x-user-id": "attacker-selected-user",
          "x-user-email": "attacker@example.com",
          cookie: "userId=attacker-selected-user",
        }),
      ),
    UnauthorizedError,
  );
});

test("anonymous requests fail with HTTP 401 semantics", () => {
  assert.throws(
    () => extractAccessToken(request()),
    (error) => error instanceof UnauthorizedError && error.status === 401,
  );
});

test("rejects oversized credentials before calling Supabase", () => {
  assert.throws(
    () => extractAccessToken(request(`Bearer ${"a".repeat(17_000)}.b.c`)),
    UnauthorizedError,
  );
});

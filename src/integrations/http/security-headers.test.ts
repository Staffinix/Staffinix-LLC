import assert from "node:assert/strict";
import test from "node:test";

import { applySecurityHeaders } from "./security-headers.ts";

test("adds browser security headers and preserves the response", async () => {
  const request = new Request("https://app.example.test/dashboard");
  const response = applySecurityHeaders(
    request,
    new Response("ok", { status: 202, headers: { "x-existing": "preserved" } }),
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("x-existing"), "preserved");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

test("does not advertise HSTS for local plain HTTP", () => {
  const request = new Request("http://127.0.0.1:8084/");
  const response = applySecurityHeaders(request, new Response("ok"));

  assert.equal(response.headers.get("strict-transport-security"), null);
});

test("honors the trusted deployment protocol forwarded to the application", () => {
  const request = new Request("http://internal.invalid/", {
    headers: { "x-forwarded-proto": "https" },
  });
  const response = applySecurityHeaders(request, new Response("ok"));

  assert.ok(response.headers.has("strict-transport-security"));
});

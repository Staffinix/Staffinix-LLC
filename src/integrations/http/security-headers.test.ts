import assert from "node:assert/strict";
import test from "node:test";

import { applySecurityHeaders, createCspNonce } from "./security-headers.ts";

test("script policy permits only same-origin scripts and a fresh validated nonce", () => {
  const nonce = createCspNonce();
  assert.notEqual(nonce, createCspNonce());
  const policy =
    applySecurityHeaders(
      new Request("https://app.example.test"),
      new Response("ok"),
      nonce,
    ).headers.get("content-security-policy") ?? "";
  const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
  assert.ok(scriptPolicy.includes(`'nonce-${nonce}'`));
  assert.ok(!scriptPolicy.includes("unsafe-inline"));
  assert.throws(() =>
    applySecurityHeaders(
      new Request("https://app.example.test"),
      new Response("ok"),
      "injected' unsafe-inline",
    ),
  );
});

test("authenticated responses cannot retain public browser or CDN cache directives", () => {
  for (const credential of [
    new Headers({ authorization: "Bearer synthetic" }),
    new Headers({ cookie: "session=synthetic" }),
  ]) {
    const response = applySecurityHeaders(
      new Request("https://app.example.test/api", { headers: credential }),
      new Response("private data", {
        headers: {
          "cache-control": "public, max-age=86400",
          "cdn-cache-control": "public, s-maxage=86400",
          "vercel-cdn-cache-control": "public, s-maxage=86400",
          vary: "Accept-Encoding",
        },
      }),
    );
    for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
      assert.equal(response.headers.get(header), "private, no-store");
    }
    assert.match(response.headers.get("vary") ?? "", /Accept-Encoding/);
    assert.match(response.headers.get("vary") ?? "", /Authorization/);
    assert.match(response.headers.get("vary") ?? "", /Cookie/);
  }
});

test("HTML, mutations and session-setting responses are not cached", () => {
  const cases: [Request, Response][] = [
    [
      new Request("https://app.example.test/auth"),
      new Response("page", { headers: { "content-type": "text/html; charset=utf-8" } }),
    ],
    [new Request("https://app.example.test/api", { method: "POST" }), new Response("ok")],
    [
      new Request("https://app.example.test/callback"),
      new Response(null, {
        status: 302,
        headers: { "set-cookie": "session=synthetic", location: "/dashboard" },
      }),
    ],
  ];
  for (const [request, original] of cases) {
    assert.equal(
      applySecurityHeaders(request, original).headers.get("cache-control"),
      "private, no-store",
    );
  }
});

test("anonymous static assets keep their explicit cache policy", () => {
  const response = applySecurityHeaders(
    new Request("https://app.example.test/assets/app.js"),
    new Response("asset", {
      headers: {
        "content-type": "text/javascript",
        "cache-control": "public, max-age=31536000, immutable",
      },
    }),
  );
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("private responses preserve wildcard Vary and do not duplicate credential fields", () => {
  const request = new Request("https://app.example.test/api", { method: "POST" });
  assert.equal(
    applySecurityHeaders(request, new Response("ok", { headers: { vary: "*" } })).headers.get(
      "vary",
    ),
    "*",
  );
  const vary = applySecurityHeaders(
    request,
    new Response("ok", { headers: { vary: "authorization, cookie" } }),
  ).headers.get("vary");
  assert.equal(vary, "authorization, cookie");
});

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

import assert from "node:assert/strict";
import test from "node:test";
import { forwardRequest } from "./forward-request.ts";

function proxied(request: Request): Request {
  return new Proxy(request, {
    get(target, key) {
      return Reflect.get(target, key, target);
    },
  });
}

test("forwards a dev-server request proxy without Node private-brand checks", () => {
  const original = proxied(
    new Request("http://localhost/path?q=1", {
      headers: { cookie: "session=test", authorization: "Bearer test" },
    }),
  );
  const headers = new Headers(original.headers);
  headers.set("x-staffinix-csp-nonce", "test-nonce");
  const forwarded = forwardRequest(original, headers);
  assert.equal(forwarded.url, original.url);
  assert.equal(forwarded.method, "GET");
  assert.equal(forwarded.body, null);
  assert.equal(forwarded.headers.get("cookie"), "session=test");
  assert.equal(forwarded.headers.get("authorization"), "Bearer test");
  assert.equal(forwarded.headers.get("x-staffinix-csp-nonce"), "test-nonce");
});

test("preserves a streamed POST body and cancellation", async () => {
  const controller = new AbortController();
  const original = proxied(
    new Request("http://localhost/action", {
      method: "POST",
      body: "resume payload",
      signal: controller.signal,
    }),
  );
  const forwarded = forwardRequest(original, new Headers(original.headers));
  assert.equal(forwarded.method, "POST");
  assert.equal(await forwarded.text(), "resume payload");
  controller.abort();
  assert.equal(forwarded.signal.aborted, true);
});

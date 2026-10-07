import assert from "node:assert/strict";
import test from "node:test";

import { getServerServiceUrl } from "./server-service-url.ts";

const resolve = (configuredValue: string | undefined, production = false) =>
  getServerServiceUrl({
    name: "TEST_SERVICE_URL",
    configuredValue,
    developmentDefault: "http://127.0.0.1:9000",
    production,
  });

test("allows local HTTP development endpoints and remote HTTPS endpoints", () => {
  assert.equal(resolve(undefined), "http://127.0.0.1:9000");
  assert.equal(resolve("https://private.example.test"), "https://private.example.test");
});

test("rejects unsafe schemes, credentials, paths, and cleartext remote services", () => {
  for (const value of [
    "file:///etc/passwd",
    "https://user:password@example.test",
    "https://example.test/api",
    "https://example.test?token=value",
    "http://10.0.0.8:6333",
  ]) {
    assert.throws(() => resolve(value));
  }
});

test("fails closed when a production endpoint is missing", () => {
  assert.throws(() => resolve(undefined, true), /must be configured in production/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { assertPublishableSupabaseKey, isOpaquePublishableKey } from "./api-key-safety.ts";

function unsignedJwt(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ role })}.signature`;
}

test("accepts opaque publishable keys", () => {
  assert.doesNotThrow(() => assertPublishableSupabaseKey("sb_publishable_example"));
  assert.equal(isOpaquePublishableKey("sb_publishable_example"), true);
});

test("rejects opaque secret keys without echoing the key", () => {
  const secret = "sb_secret_sensitive_canary";
  assert.throws(
    () => assertPublishableSupabaseKey(secret),
    (error: unknown) => error instanceof Error && !error.message.includes(secret),
  );
});

test("rejects legacy service-role JWTs", () => {
  assert.throws(() => assertPublishableSupabaseKey(unsignedJwt("service_role")));
});

test("allows legacy anonymous JWTs during compatibility migration", () => {
  assert.doesNotThrow(() => assertPublishableSupabaseKey(unsignedJwt("anon")));
});

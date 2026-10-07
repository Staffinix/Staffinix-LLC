import assert from "node:assert/strict";
import test from "node:test";

import {
  ApplicationError,
  dependencyError,
  serializeApplicationError,
  toApplicationError,
} from "./application-error.ts";

test("defines stable public status and code values", () => {
  const error = new ApplicationError("NOT_FOUND");
  assert.equal(error.status, 404);
  assert.equal(error.statusCode, 404);
  assert.deepEqual(serializeApplicationError(error), {
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
});

test("never exposes an unknown database error message", () => {
  const error = toApplicationError(
    new Error('duplicate key value violates unique constraint "users_email_key"'),
  );
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.message, "An unexpected server error occurred.");
  assert.doesNotMatch(error.message, /duplicate|constraint|users_email_key/i);
});

test("dependency errors retain their private cause without serializing it", () => {
  const cause = { code: "23505", message: "sensitive database detail" };
  const error = dependencyError(cause);
  assert.equal(error.cause, cause);
  assert.equal(error.code, "DEPENDENCY_ERROR");
  assert.doesNotMatch(JSON.stringify(serializeApplicationError(error)), /23505|sensitive/i);
});

test("maps external HTTP statuses to the public taxonomy", () => {
  assert.equal(toApplicationError({ statusCode: 401, message: "secret" }).code, "UNAUTHORIZED");
  assert.equal(toApplicationError({ status: 403, message: "secret" }).code, "FORBIDDEN");
  assert.equal(toApplicationError({ status: 409, message: "secret" }).code, "CONFLICT");
  assert.equal(toApplicationError({ status: 429, message: "secret" }).code, "RATE_LIMITED");
  assert.equal(toApplicationError({ status: 503, message: "secret" }).code, "DEPENDENCY_ERROR");
});

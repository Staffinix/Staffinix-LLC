import assert from "node:assert/strict";
import test from "node:test";
import { getRuleFormErrorMessage, validateRuleName } from "./rule-form-validation.ts";

test("rule names are trimmed and must contain at least two characters", () => {
  assert.deepEqual(validateRuleName("  Job applications  "), {
    name: "Job applications",
    error: null,
  });
  assert.equal(validateRuleName(" ").error, "Enter a rule name with at least 2 characters.");
  assert.equal(validateRuleName("a").error, "Enter a rule name with at least 2 characters.");
});

test("raw schema errors are converted to safe form messages", () => {
  const zodError = new Error(
    JSON.stringify([
      {
        code: "too_small",
        minimum: 2,
        type: "string",
        message: "String must contain at least 2 character(s)",
        path: ["name"],
      },
    ]),
  );

  assert.equal(
    getRuleFormErrorMessage(zodError, "Unable to save rule"),
    "Enter a rule name with at least 2 characters.",
  );
  assert.equal(
    getRuleFormErrorMessage(new Error("Network unavailable"), "Unable to save rule"),
    "Network unavailable",
  );
});


import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedWorkEmail, parseEmailPolicyList } from "./work-email-policy.ts";

test("allows business mail and rejects malformed or consumer mail by default", () => {
  assert.equal(isAllowedWorkEmail("recruiter@staffinix.com"), true);
  assert.equal(isAllowedWorkEmail("person@gmail.com"), false);
  assert.equal(isAllowedWorkEmail("person@outlook.com"), false);
  assert.equal(isAllowedWorkEmail("missing-domain@"), false);
  assert.equal(isAllowedWorkEmail(undefined), false);
});

test("configured domains become an explicit allowlist", () => {
  const options = { allowedDomains: ["staffinix.com", "partner.example"] };
  assert.equal(isAllowedWorkEmail("user@staffinix.com", options), true);
  assert.equal(isAllowedWorkEmail("user@partner.example", options), true);
  assert.equal(isAllowedWorkEmail("user@another-business.example", options), false);
});

test("configured email exceptions are normalized", () => {
  assert.equal(
    isAllowedWorkEmail("contractor@gmail.com", {
      allowedEmails: parseEmailPolicyList(" CONTRACTOR@GMAIL.COM, second@example.com "),
    }),
    true,
  );
});

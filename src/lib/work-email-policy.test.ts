import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedWorkEmail, parseEmailPolicyList } from "./work-email-policy.ts";

test("allows business and Gmail mail while rejecting other consumer providers", () => {
  assert.equal(isAllowedWorkEmail("recruiter@staffinix.com"), true);
  assert.equal(isAllowedWorkEmail("person@gmail.com"), true);
  assert.equal(isAllowedWorkEmail(" Person@GMAIL.COM "), true);
  assert.equal(isAllowedWorkEmail("person@googlemail.com"), true);
  assert.equal(isAllowedWorkEmail("person@outlook.com"), false);
  assert.equal(isAllowedWorkEmail("missing-domain@"), false);
  assert.equal(isAllowedWorkEmail(undefined), false);
  assert.equal(isAllowedWorkEmail("person@@gmail.com"), false);
  assert.equal(isAllowedWorkEmail("person\n@gmail.com"), false);
});

test("configured domains become an explicit allowlist", () => {
  const options = { allowedDomains: ["staffinix.com", "partner.example"] };
  assert.equal(isAllowedWorkEmail("user@staffinix.com", options), true);
  assert.equal(isAllowedWorkEmail("user@partner.example", options), true);
  assert.equal(isAllowedWorkEmail("user@another-business.example", options), false);
  assert.equal(isAllowedWorkEmail("any.person+tag@gmail.com", options), true);
  assert.equal(isAllowedWorkEmail("user@googlemail.com", options), true);
  assert.equal(isAllowedWorkEmail("user@gmail.com.attacker.example", options), false);
});

test("configured email exceptions are normalized", () => {
  assert.equal(
    isAllowedWorkEmail("contractor@gmail.com", {
      allowedEmails: parseEmailPolicyList(" CONTRACTOR@GMAIL.COM, second@example.com "),
    }),
    true,
  );
});

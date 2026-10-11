import assert from "node:assert/strict";
import test from "node:test";
import { hasValidSubmissionResumeEvidence } from "./submission-resume-evidence.ts";

test("submission resume requires a source hash and explicitly valid evidence", () => {
  assert.equal(
    hasValidSubmissionResumeEvidence({ source_hash: "hash", claim_validation: { valid: true } }),
    true,
  );
  for (const claim_validation of [null, {}, { valid: false }, { valid: "true" }, true]) {
    assert.equal(
      hasValidSubmissionResumeEvidence({ source_hash: "hash", claim_validation }),
      false,
    );
  }
  for (const source_hash of [null, ""]) {
    assert.equal(
      hasValidSubmissionResumeEvidence({ source_hash, claim_validation: { valid: true } }),
      false,
    );
  }
});

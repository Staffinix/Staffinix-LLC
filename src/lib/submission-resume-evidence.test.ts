import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasValidSubmissionResumeEvidence } from "./submission-resume-evidence.ts";

test("stage tracking is independent of resume approval and retains authorization", () => {
  const source = readFileSync(new URL("./submissions.functions.ts", import.meta.url), "utf8");
  const stageHandler = source
    .split("export const changeSubmissionStage =")[1]
    .split("export const addSubmissionNote =")[0];
  assert.match(stageHandler, /middleware\(\[requireSubmissionsAccess\]\)/);
  assert.doesNotMatch(stageHandler, /requireApprovedResumeVersion\(/);
  assert.match(stageHandler, /\.update\(patch\)/);
  assert.match(stageHandler, /stage update not authorized/);
  assert.match(
    source
      .split("export const updateSubmission =")[1]
      .split("export const listApprovedSubmissionResumes =")[0],
    /requireApprovedResumeVersion\(/,
  );
});

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

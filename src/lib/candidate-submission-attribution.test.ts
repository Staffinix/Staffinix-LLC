import assert from "node:assert/strict";
import test from "node:test";
import { getCandidateSubmissionAttribution } from "./candidate-submission-attribution.ts";

const draft = { stage: "draft", submitted_at: null, submitted_by: null, created_by: "recruiter-a" };
const candidate = { last_submitted_at: null, last_submitted_by: null, submissions: [draft] };

test("draft creator is labeled separately from a submitter", () => {
  assert.deepEqual(getCandidateSubmissionAttribution(candidate), {
    kind: "draft",
    userId: "recruiter-a",
  });
});

test("the actual submitter takes precedence over the draft creator", () => {
  assert.deepEqual(
    getCandidateSubmissionAttribution({
      ...candidate,
      submissions: [
        { ...draft, stage: "submitted", submitted_at: "2026-10-23", submitted_by: "recruiter-b" },
      ],
    }),
    { kind: "submitted", userId: "recruiter-b" },
  );
});

test("cached latest submitter survives inaccessible nested submissions without guessing", () => {
  assert.deepEqual(
    getCandidateSubmissionAttribution({
      ...candidate,
      last_submitted_at: "2026-10-23",
      last_submitted_by: "recruiter-c",
      submissions: [],
    }),
    { kind: "submitted", userId: "recruiter-c" },
  );
  assert.deepEqual(
    getCandidateSubmissionAttribution({
      ...candidate,
      last_submitted_at: "2026-10-23",
      last_submitted_by: null,
    }),
    { kind: "submitted", userId: null },
  );
});

test("a candidate without submissions has no attribution", () => {
  assert.deepEqual(getCandidateSubmissionAttribution({ ...candidate, submissions: [] }), {
    kind: "none",
    userId: null,
  });
});

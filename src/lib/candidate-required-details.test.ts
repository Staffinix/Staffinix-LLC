import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { validateRequiredCandidateDetails } from "./candidate-required-details.ts";
const complete = {
  first_name: "Test",
  last_name: "Candidate",
  email: "test@example.test",
  phone: "+13175550188",
  current_title: "Developer",
  required_job: "Developer",
  location: "Dallas, TX",
  visa_status: "USC",
  experience_years: 0,
  ready_to_relocate: true,
  availability: "immediate",
  marketing_types: ["W2"],
  skills: [{ skill: "Java" }],
};
const schema = z
  .unknown()
  .superRefine((value, ctx) => validateRequiredCandidateDetails(value, ctx));
test("complete details accept zero experience and no resume or history", () => {
  assert.equal(schema.safeParse(complete).success, true);
});
test("each candidate detail is enforced on complete saves", () => {
  for (const key of Object.keys(complete)) {
    const input = { ...complete };
    delete input[key as keyof typeof input];
    assert.equal(schema.safeParse(input).success, false, key);
  }
});
test("partial saves may omit details but cannot clear mandatory values", () => {
  const patch = z
    .unknown()
    .superRefine((value, ctx) => validateRequiredCandidateDetails(value, ctx, true));
  assert.equal(patch.safeParse({ summary: "Edited" }).success, true);
  for (const input of [
    { email: null },
    { location: " " },
    { skills: [] },
    { experience_years: null },
  ])
    assert.equal(patch.safeParse(input).success, false);
});

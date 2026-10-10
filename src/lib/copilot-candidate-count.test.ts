import assert from "node:assert/strict";
import test from "node:test";

import {
  candidateMatchesCountTerm,
  extractCandidateCountTerm,
  type CopilotCandidateCountRow,
} from "./copilot-candidate-count.ts";

const dataEngineer: CopilotCandidateCountRow = {
  id: "candidate-1",
  first_name: "Dana",
  last_name: "Example",
  current_title: "Senior Data Engineer",
  required_job: "Data Architect",
  primary_technology: "PySpark",
  status: "active",
  candidate_skills: [{ skill: "Python" }, { skill: "Azure Data Factory" }],
};

test("extracts a role from natural candidate count questions", () => {
  assert.equal(
    extractCandidateCountTerm("how many data engineer persons are there"),
    "data engineer",
  );
  assert.equal(extractCandidateCountTerm("What is the number of Python candidates?"), "Python");
  assert.equal(
    extractCandidateCountTerm("how many candidates are data engineers?"),
    "data engineers",
  );
  assert.equal(extractCandidateCountTerm("count candidates"), "");
});

test("does not claim non-count questions", () => {
  assert.equal(extractCandidateCountTerm("show me data engineers"), null);
  assert.equal(extractCandidateCountTerm("how many requisitions are there?"), null);
});

test("matches role and skill terms without case or plural sensitivity", () => {
  assert.equal(candidateMatchesCountTerm(dataEngineer, "DATA engineers"), true);
  assert.equal(candidateMatchesCountTerm(dataEngineer, "azure data"), true);
  assert.equal(candidateMatchesCountTerm(dataEngineer, "java developer"), false);
});

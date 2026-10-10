import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCandidateMatch,
  inferPreferredSkills,
  normalizeMatchConcept,
  type MatchCandidate,
  type MatchRequirement,
  type MatchSkill,
} from "./candidate-match-engine.ts";

const requirement: MatchRequirement = {
  title: "Data Engineer",
  description: "Build ETL pipelines with Python, SQL, Spark, and AWS.",
  min_experience_years: 3,
  work_mode: "remote",
  visa_types: ["USC", "GC", "H1B"],
};
const skills: MatchSkill[] = [
  { skill: "Python", is_mandatory: true, source: "structured" },
  { skill: "SQL", is_mandatory: true, source: "structured" },
  { skill: "Spark", is_mandatory: false, source: "structured" },
];
const candidate: MatchCandidate = {
  current_title: "Senior Data Engineering Consultant",
  experience_years: 5,
  location: "Dallas, TX",
  visa_status: "US Citizen",
  availability: "immediate",
};

function evaluate(
  overrides: {
    requirement?: Partial<MatchRequirement>;
    candidate?: Partial<MatchCandidate>;
    requirementSkills?: MatchSkill[];
    candidateSkills?: string[];
    resumeText?: string | null;
    semanticSimilarity?: number | null;
  } = {},
) {
  return evaluateCandidateMatch({
    requirement: { ...requirement, ...overrides.requirement },
    candidate: { ...candidate, ...overrides.candidate },
    requirementSkills: overrides.requirementSkills ?? skills,
    evidence: {
      skills: (overrides.candidateSkills ?? ["Python", "SQL"]).map((skill) => ({ skill })),
      resumeText: overrides.resumeText,
      semanticSimilarity: overrides.semanticSimilarity,
    },
  });
}

test("normalizes controlled technology and role aliases", () => {
  assert.equal(normalizeMatchConcept("Node.js / ReactJS / .NET"), "nodejs react dotnet");
  assert.equal(normalizeMatchConcept("Data Engineering"), "data engineer");
});

test("derives only controlled description skills as preferred evidence", () => {
  assert.deepEqual(inferPreferredSkills(requirement.description), [
    "Python",
    "SQL",
    "ETL",
    "Spark",
    "AWS",
  ]);
});

test("includes a candidate meeting mandatory minimums without preferred skills", () => {
  const result = evaluate();
  assert.equal(result.eligibility, "meets_minimum");
  assert.deepEqual(result.matched_required_skills, ["Python", "SQL"]);
  assert.ok(result.missing_preferred_skills.includes("Spark"));
  assert.ok(result.overall >= 0 && result.overall <= 100);
});

test("uses existing resume evidence when structured candidate skills are incomplete", () => {
  const result = evaluate({ candidateSkills: [], resumeText: "Built Python and SQL pipelines." });
  assert.deepEqual(result.matched_required_skills, ["Python", "SQL"]);
  assert.notEqual(result.eligibility, "hard_constraint_not_met");
});

test("marks confirmed minimum experience failure separately from score", () => {
  const result = evaluate({ candidate: { experience_years: 2 } });
  assert.equal(result.eligibility, "hard_constraint_not_met");
  assert.match(result.hard_constraint_reasons.join(" "), /minimum experience/i);
});

test("marks missing experience evidence for review instead of automatic failure", () => {
  const result = evaluate({ candidate: { experience_years: null } });
  assert.equal(result.eligibility, "needs_review");
  assert.match(result.review_notes.join(" "), /not recorded/i);
});

test("treats visa as a constraint and normalizes equivalent values", () => {
  assert.equal(evaluate({ candidate: { visa_status: "Green Card" } }).eligibility, "meets_minimum");
  assert.equal(
    evaluate({ candidate: { visa_status: "OPT-STEM" } }).eligibility,
    "hard_constraint_not_met",
  );
});

test("does not require embeddings and bounds every score", () => {
  const withoutEmbedding = evaluate({ semanticSimilarity: null });
  const malformedHigh = evaluate({ semanticSimilarity: 50 });
  const malformedLow = evaluate({ semanticSimilarity: -50 });
  for (const result of [withoutEmbedding, malformedHigh, malformedLow]) {
    assert.ok(result.overall >= 0 && result.overall <= 100);
  }
});

test("ranks an existing Data Engineer profile when neither side has an embedding", () => {
  const result = evaluate({
    requirement: {
      title: "Data Engineer",
      description: "Build data pipelines using Python, SQL, ETL, and Git.",
      primary_technology: null,
      min_experience_years: null,
      work_mode: null,
      visa_types: [],
    },
    requirementSkills: [],
    candidate: {
      current_title: "Data Engineer",
      primary_technology: "Data Engineer",
      experience_years: 12,
      visa_status: "USC",
    },
    candidateSkills: ["Data Engineer"],
    semanticSimilarity: null,
  });
  assert.ok(result.overall > 0);
  assert.notEqual(result.level, "low");
  assert.equal(result.eligibility, "needs_review");
});

test("keeps preferred-skill gaps out of hard-constraint failures", () => {
  const result = evaluate({ candidateSkills: ["Python", "SQL"] });
  assert.equal(result.eligibility, "meets_minimum");
  assert.ok(result.missing_preferred_skills.length > 0);
});

test("caps title-only matching so a title alone cannot produce a perfect score", () => {
  const result = evaluate({
    requirement: {
      description: null,
      min_experience_years: null,
      work_mode: null,
      visa_types: [],
    },
    requirementSkills: [],
    candidateSkills: [],
  });
  assert.equal(result.overall, 85);
  assert.equal(result.eligibility, "needs_review");
});

test("returns stable match levels at requested boundaries", () => {
  const result = evaluate();
  assert.ok(["excellent", "strong", "good", "partial", "low"].includes(result.level));
  assert.equal(Number.isInteger(result.overall), true);
});


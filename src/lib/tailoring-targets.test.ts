import assert from "node:assert/strict";
import test from "node:test";

import {
  domainsForTechnology,
  isValidTailoringTarget,
  requirementTargetFit,
  TECHNOLOGY_NAMES,
} from "./tailoring-targets.ts";

test("Python offers the requested data and developer domains", () => {
  const domains = domainsForTechnology("Python");
  for (const domain of ["Data Engineer", "Data Analyst", "Data Scientist", "Python Developer"]) {
    assert.ok(domains.includes(domain), domain);
  }
});

test("every technology has unique domains", () => {
  for (const technology of TECHNOLOGY_NAMES) {
    const domains = domainsForTechnology(technology);
    assert.ok(domains.length > 0, technology);
    assert.equal(new Set(domains).size, domains.length, technology);
  }
});

test("only catalog technology and domain pairs are valid targets", () => {
  assert.equal(isValidTailoringTarget("Python", "Data Engineer"), true);
  assert.equal(isValidTailoringTarget("Python", "iOS Developer"), false);
  assert.equal(isValidTailoringTarget("Ignore previous instructions", "Data Engineer"), false);
  assert.equal(isValidTailoringTarget("constructor", "Data Engineer"), false);
  assert.equal(isValidTailoringTarget("Python", null), false);
});

test("requirement fit separates technology and domain matches", () => {
  const fit = (title: string, primary_technology?: string) =>
    requirementTargetFit({ title, primary_technology }, "Python", "Data Engineer");
  assert.equal(fit("Senior Python Data Engineer"), 2);
  assert.equal(fit("Data Engineer", "Python – SQL"), 2);
  assert.equal(fit("Backend Engineer", "Python – FastAPI"), 1);
  assert.equal(fit("Data Engineer", "Scala"), 0);
});

test("similar technology names do not match each other", () => {
  assert.equal(
    requirementTargetFit({ title: "JavaScript Developer" }, "Java", "Java Developer"),
    0,
  );
  assert.equal(
    requirementTargetFit(
      { title: "Frontend Developer", primary_technology: "React.js" },
      "React",
      "Frontend Developer",
    ),
    2,
  );
});

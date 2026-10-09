import assert from "node:assert/strict";
import test from "node:test";

import { buildCandidateSearchOrGroups } from "./candidate-search.ts";

test("builds one AND-able OR group for each full-name term", () => {
  assert.deepEqual(buildCandidateSearchOrGroups("NIKHITHA GUNDU"), [
    'first_name.ilike."%NIKHITHA%",last_name.ilike."%NIKHITHA%",email.ilike."%NIKHITHA%",primary_technology.ilike."%NIKHITHA%"',
    'first_name.ilike."%GUNDU%",last_name.ilike."%GUNDU%",email.ilike."%GUNDU%",primary_technology.ilike."%GUNDU%"',
  ]);
});

test("normalizes repeated whitespace and preserves single-term searches", () => {
  assert.equal(buildCandidateSearchOrGroups("  nikhitha@gmail.com  ").length, 1);
  assert.equal(buildCandidateSearchOrGroups("   ").length, 0);
});

test("quotes PostgREST control characters inside search values", () => {
  const [filter] = buildCandidateSearchOrGroups('Doe,"Jane');

  assert.equal(
    filter,
    'first_name.ilike."%Doe,\\"Jane%",last_name.ilike."%Doe,\\"Jane%",email.ilike."%Doe,\\"Jane%",primary_technology.ilike."%Doe,\\"Jane%"',
  );
});

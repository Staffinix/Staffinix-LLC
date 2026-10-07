import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/lib/candidates.functions.ts", import.meta.url),
  "utf8",
);
const start = source.indexOf("export const listCandidates");
const end = source.indexOf("// ============ Get one", start);

assert.notEqual(start, -1, "listCandidates server function is missing");
assert.notEqual(end, -1, "listCandidates boundary is missing");

const listing = source.slice(start, end);

assert.match(
  listing,
  /candidate_skills!inner\(skill,is_primary\)/,
  "skill search must use a relational inner embed",
);
assert.match(
  listing,
  /\.ilike\("candidate_skills\.skill"/,
  "skill matching must execute in Postgres",
);
assert.doesNotMatch(
  listing,
  /skillMatches|\.in\("id",\s*ids\)/,
  "candidate search must not materialize skill candidate IDs in application memory",
);
assert.equal(
  (listing.match(/await q/g) ?? []).length,
  1,
  "candidate listing must execute as one database request",
);

console.log("Candidate search uses one relational, database-filtered query.");

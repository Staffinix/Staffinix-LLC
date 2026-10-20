import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("recruiter list filters roles before limits and profile loading", () => {
  const source = readFileSync(new URL("./recruiters.functions.ts", import.meta.url), "utf8");
  const list = source.slice(
    source.indexOf("export const listRecruiters"),
    source.indexOf("export interface"),
  );
  assert.match(
    list,
    /\.from\("user_roles"\)\s*\.select\("user_id, role"\)\s*\.eq\("role", "recruiter"\)\s*\.limit\(500\)/,
  );
  assert.match(list, /\.in\("id", userIds\)/);
  assert.match(list, /\.middleware\(\[requireRecruitersAccess\]\)/);
});

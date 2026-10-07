import assert from "node:assert/strict";
import test from "node:test";

import { providedCandidateChildKeys } from "./candidate-child-updates.ts";

test("omitted candidate child collections remain untouched", () => {
  assert.deepEqual(
    providedCandidateChildKeys({
      skills: [{ skill: "TypeScript" }],
    }),
    ["skills"],
  );
});

test("an explicit empty collection remains an intentional clear", () => {
  assert.deepEqual(providedCandidateChildKeys({ employment: [] }), ["employment"]);
});

test("a core-only update does not replace any child collection", () => {
  assert.deepEqual(providedCandidateChildKeys({}), []);
});

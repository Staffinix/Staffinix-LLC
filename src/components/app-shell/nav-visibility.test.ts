import assert from "node:assert/strict";
import test from "node:test";

import { isNavGroupVisible } from "./nav-visibility.ts";

test("L1 hides Talent Operations without hiding other navigation groups", () => {
  assert.equal(isNavGroupVisible("Talent Operations", "L1"), false);
  assert.equal(isNavGroupVisible("Workspace", "L1"), true);
  assert.equal(isNavGroupVisible("Relationships & Delivery", "L1"), true);
  assert.equal(isNavGroupVisible("Administration", "L1"), true);
  assert.equal(isNavGroupVisible("SaaS Administration", "L1"), true);
});

test("tenant roles continue to see Talent Operations", () => {
  for (const level of ["L2", "L3", "L4", null]) {
    assert.equal(isNavGroupVisible("Talent Operations", level), true);
  }
});


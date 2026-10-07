import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_TIER_OPTIONS,
  AccessRequestInputSchema,
  getAccessTierLabel,
  isRequestableAccessTier,
} from "./access-request-tiers.ts";

test("request form exposes exactly the L2, L3, and L4 tiers", () => {
  assert.deepEqual(ACCESS_TIER_OPTIONS, [
    { value: "l2_admin", label: "Admin (L2)" },
    { value: "l3_developer", label: "Developer (L3)" },
    { value: "l4_recruiter", label: "Recruiter (L4)" },
  ]);
});

test("legacy Platform Support is not requestable", () => {
  assert.equal(isRequestableAccessTier("platform_support"), false);
});

for (const tier of ["l2_admin", "l3_developer", "l4_recruiter"] as const) {
  test(`${tier} is accepted as a request tier`, () => {
    assert.equal(
      AccessRequestInputSchema.parse({ requestedTier: tier, reason: "Business access required" })
        .requestedTier,
      tier,
    );
  });
}

test("arbitrary request tiers are rejected", () => {
  assert.equal(
    AccessRequestInputSchema.safeParse({
      requestedTier: "platform_owner",
      reason: "Business access required",
    }).success,
    false,
  );
});

test("empty and whitespace-only reasons are rejected", () => {
  for (const reason of ["", "   \n\t "]) {
    assert.equal(
      AccessRequestInputSchema.safeParse({ requestedTier: "l4_recruiter", reason }).success,
      false,
    );
  }
});

test("email preview labels never expose internal tier values", () => {
  assert.equal(getAccessTierLabel("l2_admin"), "Admin (L2)");
  assert.equal(getAccessTierLabel("l3_developer"), "Developer (L3)");
  assert.equal(getAccessTierLabel("l4_recruiter"), "Recruiter (L4)");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessFeature,
  canAccessPath,
  getDefaultAuthorizedPath,
  type FeatureAccessIdentity,
} from "./feature-access.ts";

const identity = (role: string, platformRole: string | null = null): FeatureAccessIdentity => ({
  roles: role ? [role] : [],
  platformRole,
});

test("platform owner with super admin receives both platform and tenant access", () => {
  const owner = { roles: ["super_admin"], platformRole: "platform_owner" };
  assert.equal(canAccessPath(owner, "/platform"), true);
  assert.equal(canAccessPath(owner, "/users"), true);
  assert.equal(canAccessPath(owner, "/matching"), true);
});

test("developer admin is isolated to the developer workspace", () => {
  const developer = identity("developer_admin");
  assert.equal(canAccessFeature(developer, "developer"), true);
  assert.equal(canAccessPath(developer, "/dashboard"), false);
  assert.equal(canAccessPath(developer, "/candidates"), false);
  assert.equal(canAccessPath(developer, "/users"), false);
  assert.equal(getDefaultAuthorizedPath(developer), "/developer");
});

test("operational roles receive their assigned business features", () => {
  assert.equal(canAccessPath(identity("recruiter"), "/candidates/new"), true);
  assert.equal(canAccessPath(identity("recruiter"), "/clients"), false);
  assert.equal(canAccessPath(identity("account_manager"), "/clients"), true);
  assert.equal(canAccessPath(identity("account_manager"), "/matching"), false);
  assert.equal(canAccessPath(identity("delivery_manager"), "/recruiters"), true);
  assert.equal(canAccessPath(identity("marketing_executive"), "/tailoring"), true);
  assert.equal(canAccessPath(identity("marketing_executive"), "/requirements"), false);
});

test("smart email is available only to the L4 recruiter role", () => {
  assert.equal(canAccessPath(identity("recruiter"), "/email-intelligence"), true);
  assert.equal(canAccessPath(identity("recruiter"), "/settings/email-accounts"), true);
  for (const role of ["super_admin", "admin", "developer_admin"] as const) {
    assert.equal(canAccessPath(identity(role), "/email-intelligence"), false);
    assert.equal(canAccessPath(identity(role), "/settings/email-accounts"), false);
  }
});

test("unprovisioned users can only reach access request and forbidden pages", () => {
  const unprovisioned = identity("");
  assert.equal(canAccessPath(unprovisioned, "/access-request"), true);
  assert.equal(canAccessPath(unprovisioned, "/dashboard"), false);
  assert.equal(getDefaultAuthorizedPath(unprovisioned), "/access-request");
});

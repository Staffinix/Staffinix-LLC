import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_ROLES } from "./authorization-policy.ts";
import {
  getAssignedRoleLabel,
  getAssignedRoleLevel,
  getRoleLabel,
  ROLE_LEVEL_LABELS,
} from "./role-presentation.ts";

test("visible role names use the four requested labels", () => {
  assert.deepEqual(ROLE_LEVEL_LABELS, {
    L1: "L1 - Owner",
    L2: "L2 - Admin",
    L3: "L3 - Developer",
    L4: "L4 - Recruiters",
  });
  for (const role of ["platform_owner", "platform_admin"])
    assert.equal(getRoleLabel(role), ROLE_LEVEL_LABELS.L1);
  for (const role of ["super_admin", "admin"])
    assert.equal(getRoleLabel(role), ROLE_LEVEL_LABELS.L2);
  for (const role of ["developer_admin", "account_manager", "delivery_manager", "platform_support"])
    assert.equal(getRoleLabel(role), ROLE_LEVEL_LABELS.L3);
  for (const role of ["recruiter", "marketing_executive"])
    assert.equal(getRoleLabel(role), ROLE_LEVEL_LABELS.L4);
});

test("all stored roles retain their level and tier precedence is independent of array order", () => {
  for (const role of APP_ROLES) assert.notEqual(getAssignedRoleLevel([role], null), null);
  assert.equal(getAssignedRoleLevel(["recruiter", "admin"], null), "L2");
  assert.equal(getAssignedRoleLevel(["admin", "recruiter"], null), "L2");
  assert.equal(getAssignedRoleLevel(["admin"], "platform_owner"), "L1");
  assert.equal(getAssignedRoleLevel(["admin"], "platform_support"), "L2");
  assert.equal(getAssignedRoleLabel(["recruiter", "developer_admin"], null), "L3 - Developer");
  assert.equal(getAssignedRoleLabel([], "platform_support"), "L3 - Developer");
});

test("unknown and unassigned roles never receive a recruiter identity", () => {
  for (const value of [null, undefined, "", "user", "unknown", "toString", "__proto__"]) {
    assert.equal(getRoleLabel(value), "Awaiting role assignment");
  }
  assert.equal(getAssignedRoleLevel([], null), null);
  assert.equal(getAssignedRoleLevel(["unknown"], null), null);
  assert.equal(getAssignedRoleLabel([], null), "Awaiting role assignment");
});

test("shared role presentation does not mutate identity or infer permissions", () => {
  const roles = Object.freeze(["recruiter", "admin"]);
  assert.equal(getAssignedRoleLabel(roles, null), "L2 - Admin");
  assert.deepEqual(roles, ["recruiter", "admin"]);
});

test("role-bearing pages use shared presentation instead of local label maps", () => {
  for (const file of [
    "../components/app-shell/topbar.tsx",
    "./profile.functions.ts",
    "./access-request-tiers.ts",
    "../routes/_authenticated/users.tsx",
    "../routes/_authenticated/recruiters.index.tsx",
    "../routes/_authenticated/recruiters.$id.tsx",
    "../routes/_authenticated/settings.profile.tsx",
    "../routes/_authenticated/architecture.tsx",
    "../routes/index.tsx",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /role-presentation/, file);
    assert.doesNotMatch(source, /const ROLE_LABEL|const ROLE_MAP/, file);
  }
});

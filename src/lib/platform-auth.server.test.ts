import assert from "node:assert/strict";
import test from "node:test";

import { isPlatformAdministratorRole } from "./platform-auth.server.ts";

test("only explicit platform administrator memberships grant platform administration", () => {
  assert.equal(isPlatformAdministratorRole("platform_owner"), true);
  assert.equal(isPlatformAdministratorRole("platform_admin"), true);
  assert.equal(isPlatformAdministratorRole("platform_support"), false);
  assert.equal(isPlatformAdministratorRole("admin"), false);
  assert.equal(isPlatformAdministratorRole(null), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  createProfileAvatarReference,
  getProfileAvatarPath,
  isAllowedProfileAvatarValue,
} from "./profile-avatar.ts";

const USER_ID = "aaaaaaaa-0000-4000-8000-000000000001";

test("profile avatar references round-trip to a canonical object path", () => {
  const reference = createProfileAvatarReference(USER_ID);
  assert.equal(getProfileAvatarPath(reference), `${USER_ID}/avatar`);
  assert.equal(isAllowedProfileAvatarValue(reference), true);
});

test("profile avatars permit HTTP(S) but reject executable or malformed schemes", () => {
  assert.equal(isAllowedProfileAvatarValue("https://images.example.test/avatar.png"), true);
  assert.equal(isAllowedProfileAvatarValue("javascript:alert(1)"), false);
  assert.equal(isAllowedProfileAvatarValue("data:image/svg+xml,<svg></svg>"), false);
  assert.equal(getProfileAvatarPath("staffinix-avatar://profile-avatars/not-a-uuid/avatar"), null);
});

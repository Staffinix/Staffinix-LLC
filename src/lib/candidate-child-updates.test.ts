import assert from "node:assert/strict";
import test from "node:test";

import { providedCandidateChildKeys } from "./candidate-child-updates.ts";
import { refreshCandidateEmbeddingBestEffort } from "./candidate-embedding-refresh.ts";

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

test("does not reject a saved candidate when embedding refresh fails", async () => {
  const messages: string[] = [];

  await assert.doesNotReject(() =>
    refreshCandidateEmbeddingBestEffort(
      async () => {
        throw new Error("No default secret key found");
      },
      (message) => messages.push(message),
    ),
  );

  assert.deepEqual(messages, ["[candidate-embedding] refresh failed"]);
});

test("refreshes normally when the embedding service is configured", async () => {
  let refreshed = false;
  const messages: string[] = [];

  await refreshCandidateEmbeddingBestEffort(
    async () => {
      refreshed = true;
    },
    (message) => messages.push(message),
  );

  assert.equal(refreshed, true);
  assert.deepEqual(messages, []);
});

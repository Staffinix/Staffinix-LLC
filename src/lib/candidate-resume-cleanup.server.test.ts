import { test } from "node:test";
import assert from "node:assert/strict";
import { removeCandidateFiles } from "./candidate-resume-cleanup.server.ts";

test("removes all pages only within the deleted candidate folder", async () => {
  const removed: string[][] = [];
  const files = [
    { name: "original.pdf", id: "1" },
    { name: "older.docx", id: "2" },
  ];
  const pending = await removeCandidateFiles(
    {
      list: async (prefix) => {
        assert.equal(prefix, "tenant/candidate");
        return { data: files.slice(0, 1), error: null };
      },
      remove: async (paths) => {
        removed.push(paths);
        files.shift();
        return { error: null };
      },
    },
    "tenant/candidate",
  );
  assert.equal(pending, false);
  assert.deepEqual(removed, [["tenant/candidate/original.pdf"], ["tenant/candidate/older.docx"]]);
});
test("storage failure is reported as cleanup pending", async () => {
  assert.equal(
    await removeCandidateFiles(
      {
        list: async () => ({ data: null, error: new Error("offline") }),
        remove: async () => {
          throw new Error("must not remove");
        },
      },
      "tenant/candidate",
    ),
    true,
  );
});
test("unexpected nested folder is not recursively deleted", async () => {
  assert.equal(
    await removeCandidateFiles(
      {
        list: async () => ({ data: [{ name: "../other", id: "1" }], error: null }),
        remove: async () => {
          throw new Error("must not remove");
        },
      },
      "tenant/candidate",
    ),
    true,
  );
});

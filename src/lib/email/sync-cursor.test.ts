import assert from "node:assert/strict";
import test from "node:test";
import { parseEmailSyncCursor } from "./sync-cursor.ts";

test("sync continuation preserves its original window and rejects invalid state", () => {
  const state = {
    provider: "gmail",
    since: "2026-01-01T00:00:00Z",
    watermark: "2026-02-01T00:00:00Z",
    nextCursor: "page-3",
  };
  assert.deepEqual(parseEmailSyncCursor(JSON.stringify(state), "gmail"), state);
  for (const value of [null, "bad-json", "{}", JSON.stringify({ ...state, since: "bad-date" })]) {
    assert.equal(parseEmailSyncCursor(value, "gmail"), null);
  }
  assert.equal(parseEmailSyncCursor(JSON.stringify(state), "microsoft"), null);
});

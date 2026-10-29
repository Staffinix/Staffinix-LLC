import assert from "node:assert/strict";
import test from "node:test";
import { collectVendorExport } from "./vendor-export.ts";
test("export collects beyond the former 5000 row cap using a stable cutoff", async () => {
  let pages = 0;
  const rows = await collectVendorExport(async ({ cursor, asOf }) => {
    if (pages) {
      assert.equal(cursor, String(pages));
      assert.equal(asOf, "cutoff");
    }
    pages++;
    return {
      rows: Array.from({ length: 500 }, (_, index) => ({ id: (pages - 1) * 500 + index })),
      asOf: "cutoff",
      nextCursor: pages < 11 ? String(pages) : null,
    };
  });
  assert.equal(rows.length, 5500);
  assert.equal(new Set(rows.map((row) => row.id)).size, 5500);
});
test("a failed or looping page never produces a partial success", async () => {
  await assert.rejects(
    collectVendorExport(async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  await assert.rejects(
    collectVendorExport(async () => ({ rows: [1], nextCursor: "same", asOf: "cutoff" })),
    /did not advance/,
  );
});

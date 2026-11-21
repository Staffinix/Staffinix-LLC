import assert from "node:assert/strict";
import test from "node:test";
import { readSheet } from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";

import { createVendorSheet, parseVendorCsv, parseVendorSheet } from "./vendor-csv.ts";
import { chunkVendorRows, importVendorRows } from "./vendor-import.ts";

const vendor = (name: string, contact_email: string | null = null) => ({ name, contact_email });

test("Excel export round-trips through a real .xlsx file without running formulas", async () => {
  const source = [
    {
      name: "=HYPERLINK(1)",
      contact_email: "ops@acme.test",
      contact_phone: "+1 202-555-0110",
      status: "active" as const,
      tier: "a" as const,
      payment_terms_days: 30,
      msa_signed_at: "2026-01-15",
      notes: "Line 1\nLine 2",
    },
  ];
  const blob = await writeExcelFile(createVendorSheet(source)).toBuffer();
  const [row] = parseVendorSheet(await readSheet(blob));
  assert.equal(row.name, "=HYPERLINK(1)");
  assert.equal(row.contact_phone, "+1 202-555-0110");
  assert.equal(row.tier, "a");
  assert.equal(row.payment_terms_days, 30);
  assert.equal(row.msa_signed_at, "2026-01-15");
  assert.equal(row.notes, "Line 1\nLine 2");
});

test("Excel cell types become the stored text and date formats", () => {
  const [row] = parseVendorSheet([
    ["Company", "Phone", "Payment Terms Days", "MSA Signed At"],
    ["Acme", 12025550110, 45, new Date("2026-03-02T00:00:00Z")],
    [null, null, null, null],
  ]);
  assert.equal(row.contact_phone, "12025550110");
  assert.equal(row.payment_terms_days, 45);
  assert.equal(row.msa_signed_at, "2026-03-02");
});

test("spreadsheet-style values are normalized and bad rows name their row", () => {
  const [row] = parseVendorCsv(
    "Company Name,Website,Payment Terms Days,MSA Signed At\nAcme,www.acme.test,Net 30,1/5/2026",
  );
  assert.equal(row.website, "https://www.acme.test");
  assert.equal(row.payment_terms_days, 30);
  assert.equal(row.msa_signed_at, "2026-01-05");
  assert.throws(() => parseVendorCsv("Company Name,Mail\nAcme,not-an-email"), /Row 2: Mail/);
  assert.throws(
    () => parseVendorCsv("Company Name,MSA Signed At\nAcme,2026-02-31"),
    /Row 2: MSA Signed At/,
  );
});

test("a duplicate contact is skipped while new vendors in the file are saved", async () => {
  const saved: string[] = [];
  const result = await importVendorRows(
    [vendor("Old", "old@a.test"), vendor("New", "new@a.test"), vendor("Bad", "bad@a.test")],
    new Set(),
    async (rows) => {
      if (rows.length > 1) return { code: "23505" };
      if (rows[0].name === "Old") return { code: "23505" };
      if (rows[0].name === "Bad") return { code: "23514" };
      saved.push(rows[0].name);
      return null;
    },
  );
  assert.deepEqual(saved, ["New"]);
  assert.deepEqual(result, { imported: 1, skipped: 1, failed: [2] });
});

test("vendors without contacts are matched by name, including within the file", async () => {
  let inserted: string[] = [];
  const result = await importVendorRows(
    [vendor("Existing Co"), vendor("Fresh Co"), vendor("fresh co")],
    new Set(["EXISTING CO"]),
    async (rows) => {
      inserted = rows.map((row) => row.name);
      return null;
    },
  );
  assert.deepEqual(inserted, ["Fresh Co"]);
  assert.deepEqual(result, { imported: 1, skipped: 2, failed: [] });
});

test("import requests stay under the row and body limits", () => {
  const rows = Array.from({ length: 250 }, (_, index) => ({
    name: `Vendor ${index}`,
    notes: "x".repeat(5000),
  }));
  const chunks = chunkVendorRows(rows);
  assert.deepEqual(
    chunks.flatMap((chunk) => chunk.rows.map((row) => row.name)),
    rows.map((row) => row.name),
  );
  for (const chunk of chunks) {
    assert.ok(chunk.rows.length <= 100);
    assert.ok(JSON.stringify(chunk.rows).length < 450_000);
    assert.equal(chunk.rows[0], rows[chunk.start]);
  }
});

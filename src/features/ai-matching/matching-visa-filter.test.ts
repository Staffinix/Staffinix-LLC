import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchingVisaOptions,
  matchesSelectedVisas,
  normalizeVisaStatus,
} from "./matching-visa-filter.ts";

test("always exposes every supported visa option", () => {
  const options = buildMatchingVisaOptions([]);
  assert.deepEqual(options, [
    "USC",
    "GC",
    "GC-EAD",
    "H1B",
    "H4-EAD",
    "L2",
    "OPT",
    "CPT",
    "TN",
    "EAD",
  ]);
});

test("normalizes equivalent candidate visa labels", () => {
  assert.equal(normalizeVisaStatus("US Citizen"), "USC");
  assert.equal(normalizeVisaStatus("Green Card"), "GC");
  assert.equal(normalizeVisaStatus("OPT-STEM"), "OPT");
  assert.equal(normalizeVisaStatus("F1-OPT valid upto 2028"), "OPT");
  assert.equal(normalizeVisaStatus("H1BT"), "H1B");
  assert.equal(normalizeVisaStatus("GC Holder"), "GC");
  assert.equal(normalizeVisaStatus("H4 EAD"), "H4-EAD");
  assert.equal(normalizeVisaStatus("TN Visa"), "TN");
});

test("supports matching any of multiple selected visa types", () => {
  assert.equal(matchesSelectedVisas("Green Card", ["H1B", "GC"]), true);
  assert.equal(matchesSelectedVisas("H1B", ["USC", "OPT"]), false);
  assert.equal(matchesSelectedVisas("H1B", []), true);
});

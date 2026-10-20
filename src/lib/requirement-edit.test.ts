import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UsRequisitionLocationSchema, UsRequisitionCurrencySchema } from "./us-requisition.ts";

test("requisitions accept U.S. state locations and USD only", () => {
  for (const value of [
    "Dallas, TX",
    "New York, NY, USA",
    "Washington, DC",
    "Remote, USA",
    "Remote",
  ]) {
    assert.equal(UsRequisitionLocationSchema.safeParse(value).success, true);
  }
  for (const value of [
    "",
    "France",
    "Delhi, India",
    "Toronto, ON",
    "Remote, India",
    "Dallas, ZZ",
  ]) {
    assert.equal(UsRequisitionLocationSchema.safeParse(value).success, false);
  }
  assert.equal(UsRequisitionCurrencySchema.safeParse("USD").success, true);
  assert.equal(UsRequisitionCurrencySchema.safeParse("INR").success, false);
});

const routeSource = (name: string) =>
  readFileSync(new URL(`../routes/_authenticated/${name}`, import.meta.url), "utf8");

test("requisition edit is reachable from the list and rendered by the parent route", () => {
  assert.match(routeSource("requirements.index.tsx"), /to="\/requirements\/\$id\/edit"/);
  assert.match(
    routeSource("requirements.$id.tsx"),
    /editing \? <Outlet \/> : <RequirementDetailPage \/>/,
  );
});

test("editing preserves saved priority, zero rates and JD text", () => {
  const source = routeSource("requirements.$id.edit.tsx");
  assert.match(source, /priority: data.priority/);
  assert.match(source, /rate_min: data.rate_min != null \? Number\(data.rate_min\) : null/);
  assert.match(source, /rate_max: data.rate_max != null \? Number\(data.rate_max\) : null/);
  assert.match(source, /description: data.description \?\? ""/);
});

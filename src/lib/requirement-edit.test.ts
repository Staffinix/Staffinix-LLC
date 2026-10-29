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

import { RequiredRequirementDetailsSchema } from "./requirement-form-validation.ts";
const completeDetails = {
  title: "Developer",
  client_id: "client",
  vendor_id: "vendor",
  vendor_email: "recruiter@example.com",
  vendor_contact: "+14155552671",
  location: "Dallas, TX",
  work_mode: "remote",
  primary_technology: "Java",
  duration: "6 months",
  min_experience_years: 0,
  max_experience_years: 5,
  rate_type: "hourly",
  currency: "USD",
  visa_types: ["H1B"],
  status: "open",
  priority: "medium",
  description: "Build APIs",
  recruiter_notes: "Interview available",
  skills: [{ skill: "Java", is_mandatory: true }],
};

test("complete requirements allow missing rates and zero experience", () => {
  assert.equal(RequiredRequirementDetailsSchema.safeParse(completeDetails).success, true);
  assert.equal(
    RequiredRequirementDetailsSchema.safeParse({
      ...completeDetails,
      rate_min: null,
      rate_max: null,
    }).success,
    true,
  );
});
test("every requirement detail is mandatory, including selections and skills", () => {
  for (const key of Object.keys(completeDetails)) {
    const input = { ...completeDetails } as Record<string, unknown>;
    delete input[key];
    assert.equal(RequiredRequirementDetailsSchema.safeParse(input).success, false, key);
  }
  for (const key of ["client_id", "vendor_id", "description", "recruiter_notes"]) {
    assert.equal(
      RequiredRequirementDetailsSchema.safeParse({ ...completeDetails, [key]: "   " }).success,
      false,
      key,
    );
  }
  for (const key of ["visa_types", "skills"]) {
    assert.equal(
      RequiredRequirementDetailsSchema.safeParse({ ...completeDetails, [key]: [] }).success,
      false,
      key,
    );
  }
  assert.equal(
    RequiredRequirementDetailsSchema.safeParse({ ...completeDetails, max_experience_years: -1 })
      .success,
    false,
  );
});

import { Constants } from "../integrations/supabase/types.ts";
import { REQ_STATUSES, STATUS_STYLES, STATUS_LABEL } from "./requirements-constants.ts";
import { z } from "zod";

test("saved database requirement states remain editable and filterable", () => {
  const schema = z.enum(REQ_STATUSES);
  for (const status of Constants.public.Enums.requirement_status) {
    assert.equal(schema.safeParse(status).success, true, status);
    assert.ok(STATUS_STYLES[status]);
    assert.ok(STATUS_LABEL[status]);
  }
  assert.equal(schema.safeParse("unexpected").success, false);
});

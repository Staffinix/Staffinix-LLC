import assert from "node:assert/strict";
import test from "node:test";
import { createVendorCsv, parseVendorCsv } from "./vendor-csv.ts";

test("vendor CSV round-trips the requested contact fields", () => {
  const csv = createVendorCsv([
    {
      name: "Example Staffing, Inc.",
      contact_name: "Asha Rao",
      contact_email: "asha@example.com",
      contact_phone: "+1 555 0100",
      linkedin_id: "linkedin.com/in/asharao",
      contact_role: "Account Manager",
      status: "active",
      tier: "a",
    },
  ]);

  const [vendor] = parseVendorCsv(csv);
  assert.equal(vendor.name, "Example Staffing, Inc.");
  assert.equal(vendor.contact_name, "Asha Rao");
  assert.equal(vendor.contact_email, "asha@example.com");
  assert.equal(vendor.contact_phone, "+1 555 0100");
  assert.equal(vendor.linkedin_id, "linkedin.com/in/asharao");
  assert.equal(vendor.contact_role, "Account Manager");
});

test("vendor CSV accepts common header aliases and quoted newlines", () => {
  const [vendor] = parseVendorCsv(
    'Vendor Name,Email,Phone,LinkedIn,Job Title,Notes\r\n"Acme, LLC",ops@acme.com,123,acme,Director,"Line 1\nLine 2"',
  );
  assert.equal(vendor.name, "Acme, LLC");
  assert.equal(vendor.contact_email, "ops@acme.com");
  assert.equal(vendor.contact_role, "Director");
  assert.equal(vendor.notes, "Line 1\nLine 2");
});

test("vendor CSV rejects rows without a company name", () => {
  assert.throws(
    () => parseVendorCsv("Company Name,Mail\n,test@example.com"),
    /Company Name is required/,
  );
});

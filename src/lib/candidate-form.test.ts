import assert from "node:assert/strict";
import test from "node:test";

import { shouldAdvanceCandidateFormOnEnter } from "./candidate-form-keyboard.ts";
import { MARKETING_TYPES, toggleMarketingType } from "./candidates-constants.ts";
import { formatUsPhone, normalizeUsPhone } from "./us-phone.ts";

test("normalizes supported US phone formats to E.164", () => {
  for (const value of [
    "4155552671",
    "415-555-2671",
    "(415) 555-2671",
    "415 555 2671",
    "+1 (415) 555-2671",
  ]) {
    assert.equal(normalizeUsPhone(value), "+14155552671");
  }
  assert.equal(formatUsPhone("+14155552671"), "(415) 555-2671");
});

test("rejects wrong lengths, invalid characters, and invalid NANP prefixes", () => {
  for (const value of [
    "415555267",
    "415555267100",
    "415-CALL-NOW",
    "++1 (415) 555-2671",
    "415) 555-2671",
    "1155552671",
    "4151552671",
    "4115552671",
    "4152112671",
  ]) {
    assert.equal(normalizeUsPhone(value), null);
  }
});

test("Enter advances ordinary controls without overriding multiline or open combobox behavior", () => {
  assert.equal(shouldAdvanceCandidateFormOnEnter({ tagName: "input", type: "text" }), true);
  assert.equal(shouldAdvanceCandidateFormOnEnter({ tagName: "button", role: "checkbox" }), true);
  assert.equal(
    shouldAdvanceCandidateFormOnEnter({
      tagName: "button",
      role: "combobox",
      ariaExpanded: "false",
    }),
    true,
  );
  assert.equal(shouldAdvanceCandidateFormOnEnter({ tagName: "textarea" }), false);
  assert.equal(shouldAdvanceCandidateFormOnEnter({ tagName: "input", type: "file" }), false);
  assert.equal(
    shouldAdvanceCandidateFormOnEnter({
      tagName: "button",
      role: "combobox",
      ariaExpanded: "true",
    }),
    false,
  );
});

test("marketing types support multiple selections and deselection", () => {
  let selected = toggleMarketingType([], "C2C");
  selected = toggleMarketingType(selected, "W2");
  assert.deepEqual(selected, ["C2C", "W2"]);
  selected = toggleMarketingType(selected, "C2C");
  assert.deepEqual(selected, ["W2"]);
  assert.deepEqual(MARKETING_TYPES, ["C2C", "W2", "Full-Time", "1099"]);
});

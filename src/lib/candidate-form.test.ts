import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldAdvanceCandidateFormOnEnter } from "./candidate-form-keyboard.ts";
import { MARKETING_TYPES, toggleMarketingType } from "./candidates-constants.ts";
import { formatUsPhone, normalizeUsPhone } from "./us-phone.ts";

test("resume auto-fill is a reviewed preview, not an automatic candidate creation", () => {
  const server = readFileSync(new URL("./candidates.functions.ts", import.meta.url), "utf8");
  const preview = server
    .split("export const previewCandidateResume =")[1]
    .split("export const parseAndCreateCandidate =")[0];
  assert.match(preview, /middleware\(\[requireCandidatesAccess\]\)/);
  assert.match(preview, /readAndValidateResumeUpload/);
  assert.match(preview, /runWithAiUsageGuard/);
  assert.match(preview, /UNTRUSTED_DOCUMENT_SYSTEM_RULES/);
  assert.doesNotMatch(preview, /createCandidateGraph|\.insert\(|\.update\(|\.upsert\(/);
  const form = readFileSync(
    new URL("../components/candidates/candidate-form.tsx", import.meta.url),
    "utf8",
  );
  const fill = form.split("async function autofillResume()")[1].split("const skills =")[0];
  assert.match(fill, /await previewFn/);
  for (const setter of [
    "setFirst",
    "setLast",
    "setEmail",
    "setPhone",
    "setCurrentJob",
    "setTechSkills",
    "setEmployment",
    "setEducation",
  ])
    assert.ok(fill.includes(setter));
  assert.doesNotMatch(fill, /createFn\(|createWithResumeFn\(|onSaved\(/);
  assert.match(fill, /setVisa\(""\)/);
  assert.match(form, /disabled=\{isParsing \|\| isSubmitting\}/);
  assert.match(form, /previewUpload\?\.file === resumeFile/);
  assert.match(form, /configured\s+AI\s+provider/);
});

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

test("candidate edit renders as a sibling instead of a hidden detail child", () => {
  const routeTree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
  const editRoute = routeTree.match(
    /const AuthenticatedCandidatesIdEditRoute =[\s\S]*?\n\s*\}\s+as any\)/,
  );

  assert.ok(editRoute, "generated candidate edit route was not found");
  assert.match(editRoute[0], /getParentRoute: \(\) => AuthenticatedRouteRoute/);
  assert.doesNotMatch(editRoute[0], /getParentRoute: \(\) => AuthenticatedCandidatesIdRoute/);
});

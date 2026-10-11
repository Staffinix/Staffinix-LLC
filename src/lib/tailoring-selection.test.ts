import test from "node:test";
import assert from "node:assert/strict";
import { validateFactSelection, type FactSelection } from "./tailoring-selection.ts";
import { createResumeExport, RESUME_TEMPLATES, validateResumeExport } from "./resume-export.ts";

const source = {
  skills: [{ id: "skill" }],
  employment: [{ id: "job" }],
  education: [],
  projects: [],
  certifications: [],
};
const selection: FactSelection = {
  skill_ids: ["skill"],
  employment_ids: ["job"],
  education_ids: [],
  project_ids: [],
  certification_ids: [],
};
test("mock AI output can select only facts from the matching category", () => {
  assert.equal(validateFactSelection(source, selection).claim_count, 2);
  assert.throws(() => validateFactSelection(source, { ...selection, skill_ids: ["invented"] }));
  assert.throws(() => validateFactSelection(source, { ...selection, skill_ids: ["job"] }));
  assert.throws(() =>
    validateFactSelection(source, { ...selection, skill_ids: ["skill", "skill"] }),
  );
  assert.deepEqual(selection.skill_ids, ["skill"]);
});
test("exports require human approval and nonempty content", () => {
  assert.throws(() => validateResumeExport({ status: "draft", tailored_content: "Resume" }));
  assert.throws(() => validateResumeExport({ status: "rejected", tailored_content: "Resume" }));
  assert.throws(() => validateResumeExport({ status: "approved", tailored_content: " " }));
  assert.equal(validateResumeExport({ status: "approved", tailored_content: "Resume" }), "Resume");
});
test("unsupported PDF glyphs fail safely while DOCX retains Unicode", async () => {
  await assert.rejects(createResumeExport("候補者", "classic", "pdf"), /Unicode font/);
  assert.ok((await createResumeExport("候補者", "classic", "docx")).size > 0);
});
test("every template produces actual PDF and zipped DOCX documents", async () => {
  for (const template of Object.keys(RESUME_TEMPLATES) as Array<keyof typeof RESUME_TEMPLATES>) {
    const pdf = await createResumeExport(
      "Test Candidate\nSKILLS\nPython\n" + "Verified experience\n".repeat(100),
      template,
      "pdf",
    );
    assert.equal((await pdf.text()).slice(0, 5), "%PDF-");
    const docx = await createResumeExport("Test Candidate\nSKILLS\nPython", template, "docx");
    assert.deepEqual([...new Uint8Array(await docx.arrayBuffer()).slice(0, 2)], [0x50, 0x4b]);
  }
});

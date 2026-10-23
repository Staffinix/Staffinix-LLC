import assert from "node:assert/strict";
import test from "node:test";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABEL,
  pipelineStage,
  PipelineStageChangeSchema,
  INTERVIEW_TYPES,
} from "./pipeline-stages.ts";

const id = "97000000-0000-4000-8000-000000000001";
test("offers only the five requested stages while preserving legacy records", () => {
  assert.deepEqual(
    PIPELINE_STAGES.map((stage) => PIPELINE_STAGE_LABEL[stage]),
    ["Applied", "Rate Confirmation", "Interview", "Selected", "Rejected"],
  );
  for (const [stored, shown] of [
    ["draft", "submitted"],
    ["client_review", "vendor_review"],
    ["hired", "offer"],
    ["withdrawn", "rejected"],
  ])
    assert.equal(pipelineStage(stored), shown);
  for (const to_stage of ["draft", "client_review", "hired", "withdrawn"])
    assert.equal(PipelineStageChangeSchema.safeParse({ id, to_stage }).success, false);
});
test("interview requires one of six types and Other requires bounded custom text", () => {
  assert.equal(PipelineStageChangeSchema.safeParse({ id, to_stage: "interview" }).success, false);
  for (const interview_type of INTERVIEW_TYPES) {
    assert.ok(
      PipelineStageChangeSchema.safeParse({
        id,
        to_stage: "interview",
        interview_type,
        interview_other: interview_type === "other" ? "Panel discussion" : null,
      }).success,
    );
  }
  for (const interview_other of ["", "   ", "x".repeat(121)])
    assert.equal(
      PipelineStageChangeSchema.safeParse({
        id,
        to_stage: "interview",
        interview_type: "other",
        interview_other,
      }).success,
      false,
    );
  assert.ok(PipelineStageChangeSchema.safeParse({ id, to_stage: "offer" }).success);
});

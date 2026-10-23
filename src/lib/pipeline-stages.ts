import { z } from "zod";
import { SUBMISSION_STAGES } from "./submissions-constants.ts";

// Keep stored legacy stages compatible with attribution, dashboards, and placements.
export const PIPELINE_STAGES = [
  "submitted",
  "vendor_review",
  "interview",
  "offer",
  "rejected",
] as const;
export const INTERVIEW_TYPES = [
  "screening",
  "coding",
  "technical",
  "client",
  "hr",
  "other",
] as const;
export const INTERVIEW_TYPE_LABEL = {
  screening: "Screening",
  coding: "Coding",
  technical: "Technical",
  client: "Client",
  hr: "HR",
  other: "Other",
};
export const PIPELINE_STAGE_LABEL = {
  submitted: "Applied",
  vendor_review: "Rate Confirmation",
  interview: "Interview",
  offer: "Selected",
  rejected: "Rejected",
};

export function pipelineStage(stage: string): (typeof PIPELINE_STAGES)[number] {
  if (stage === "draft" || stage === "submitted") return "submitted";
  if (stage === "vendor_review" || stage === "client_review") return "vendor_review";
  if (stage === "offer" || stage === "hired") return "offer";
  if (stage === "interview") return "interview";
  return "rejected";
}

export const PipelineStageChangeSchema = z
  .object({
    id: z.string().uuid(),
    to_stage: z
      .enum(SUBMISSION_STAGES)
      .refine(
        (value) => (PIPELINE_STAGES as readonly string[]).includes(value),
        "Select a supported pipeline stage.",
      ),
    interview_type: z.enum(INTERVIEW_TYPES).nullable().optional(),
    interview_other: z.string().trim().max(120).nullable().optional(),
    message: z.string().max(2000).optional(),
    rejected_reason: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to_stage === "interview" && !value.interview_type) {
      ctx.addIssue({
        code: "custom",
        path: ["interview_type"],
        message: "Select an interview type.",
      });
    }
    if (
      value.to_stage === "interview" &&
      value.interview_type === "other" &&
      !value.interview_other
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["interview_other"],
        message: "Enter the interview type.",
      });
    }
  });

export type PipelineStageChange = z.infer<typeof PipelineStageChangeSchema>;

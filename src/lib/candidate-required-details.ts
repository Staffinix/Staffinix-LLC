import { z } from "zod";

const text = z.string().trim().min(1);
export const CandidateRequiredDetails = z.object({
  first_name: text,
  last_name: text,
  email: text.email(),
  phone: text,
  current_title: text,
  required_job: text,
  location: text,
  visa_status: text,
  experience_years: z.number().min(0).max(60),
  ready_to_relocate: z.boolean(),
  availability: text,
  marketing_types: z.array(text).min(1),
  skills: z.array(z.object({ skill: text })).min(1),
});

export function validateRequiredCandidateDetails(
  value: unknown,
  context: z.RefinementCtx,
  partial = false,
) {
  const result = (
    partial ? CandidateRequiredDetails.partial() : CandidateRequiredDetails
  ).safeParse(value);
  if (!result.success)
    for (const issue of result.error.issues)
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: `${String(issue.path[0])} is required and must be valid`,
      });
}

import { z } from "zod";

const text = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`);
const selection = (label: string) =>
  text(label).refine((value) => value !== "none" && value !== "unset", `${label} is required`);
export const RequiredRequirementDetailsSchema = z
  .object({
    title: text("Title"),
    client_id: selection("Client"),
    vendor_id: selection("Vendor name"),
    vendor_email: text("Vendor contact email").email("Enter a valid vendor contact email"),
    vendor_contact: text("Vendor contact number"),
    location: text("Location"),
    work_mode: selection("Work mode"),
    primary_technology: text("Primary technology"),
    duration: text("Duration"),
    min_experience_years: z.number({ error: "Minimum experience is required" }).min(0),
    max_experience_years: z.number({ error: "Maximum experience is required" }).min(0),
    rate_type: selection("Rate type"),
    currency: text("Currency"),
    visa_types: z.array(text("Visa type")).min(1, "Select at least one visa type"),
    status: selection("Status"),
    priority: selection("Priority"),
    description: text("Description"),
    recruiter_notes: text("Recruiter notes"),
    skills: z.array(z.object({ skill: text("Skill") })).min(1, "Add at least one skill"),
  })
  .refine((value) => value.max_experience_years >= value.min_experience_years, {
    path: ["max_experience_years"],
    message: "Maximum experience cannot be less than minimum experience",
  });

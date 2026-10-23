import { z } from "zod";
import { inferPreferredSkills } from "./candidate-match-engine.ts";

export const EmailMatchExtractionSchema = z
  .object({
    title: z.string().trim().min(2).max(200).nullable(),
    skills: z.array(z.string().trim().min(2).max(100)).max(30),
  })
  .strict();

export function buildEmailMatchRequirement(
  email: { id: string; subject: string; preview: string | null },
  extracted?: z.infer<typeof EmailMatchExtractionSchema>,
) {
  const subject = email.subject.slice(0, 2000);
  const preview = (email.preview ?? "").slice(0, 1000);
  const text = `${subject}\n${preview}`;
  const containsPhrase = (phrase: string) => {
    const words = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9+#.]+/g, " ")
        .trim();
    return ` ${words(text)} `.includes(` ${words(phrase)} `);
  };
  const skills = [...new Set((extracted?.skills ?? []).filter(containsPhrase))];
  const title = extracted?.title && containsPhrase(extracted.title) ? extracted.title : subject;
  if (
    !skills.length &&
    !inferPreferredSkills(text).length &&
    !/\b(engineer|developer|architect|analyst|scientist|administrator|designer|consultant)\b/i.test(
      text,
    )
  ) {
    throw new Error(
      "This email preview does not contain enough job or technology details. Use a requisition with the complete job description instead.",
    );
  }
  return {
    id: email.id,
    title: title || "Email recruitment requirement",
    description: text,
    primary_technology: skills.length ? skills.join(", ") : null,
    skills: skills.map((skill) => ({ skill, is_mandatory: false })),
    location: null,
    work_mode: null,
    visa_types: null,
    min_experience_years: null,
    max_experience_years: null,
  };
}

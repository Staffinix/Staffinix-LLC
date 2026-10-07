import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireTailoringAccess } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { requestStructuredAiOutput } from "@/lib/ai-gateway.server";
import { writeAudit } from "@/lib/audit.server";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";

type AppSupabase = SupabaseClient<Database>;

const IdPairSchema = z.object({
  candidate_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
});

const SelectionSchema = z
  .object({
    skill_ids: z.array(z.string().uuid()).max(50),
    employment_ids: z.array(z.string().uuid()).max(50),
    education_ids: z.array(z.string().uuid()).max(30),
    project_ids: z.array(z.string().uuid()).max(30),
    certification_ids: z.array(z.string().uuid()).max(30),
  })
  .strict();

type FactSelection = z.infer<typeof SelectionSchema>;

async function loadTailoringSource(
  supabase: AppSupabase,
  candidateId: string,
  requirementId: string,
  sourceResumeId?: string,
) {
  const resumeQuery = supabase
    .from("resumes")
    .select(
      "id, file_name, extracted_text, is_primary, created_at, verification_status, verified_by, verified_at, verified_facts_hash",
    )
    .eq("candidate_id", candidateId)
    .eq("verification_status", "verified")
    .not("extracted_text", "is", null)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (sourceResumeId) resumeQuery.eq("id", sourceResumeId);

  const [
    candidateResult,
    requirementResult,
    requirementSkillsResult,
    skillsResult,
    employmentResult,
    educationResult,
    projectsResult,
    certificationsResult,
    resumeResult,
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, first_name, last_name, current_title, current_employer, location, visa_status, availability, experience_years, primary_technology, summary",
      )
      .eq("id", candidateId)
      .maybeSingle(),
    supabase
      .from("requirements")
      .select(
        "id, title, description, primary_technology, location, work_mode, visa_types, min_experience_years, max_experience_years",
      )
      .eq("id", requirementId)
      .maybeSingle(),
    supabase
      .from("requirement_skills")
      .select("id, skill, is_mandatory")
      .eq("requirement_id", requirementId)
      .order("is_mandatory", { ascending: false })
      .order("skill"),
    supabase
      .from("candidate_skills")
      .select("id, skill, years, is_primary")
      .eq("candidate_id", candidateId)
      .order("is_primary", { ascending: false })
      .order("skill"),
    supabase
      .from("candidate_employment")
      .select("id, company, title, location, start_date, end_date, is_current, description")
      .eq("candidate_id", candidateId)
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_education")
      .select("id, institution, degree, field, start_year, end_year")
      .eq("candidate_id", candidateId)
      .order("end_year", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_projects")
      .select("id, name, description, technologies")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_certifications")
      .select("id, name, issuer, issued_date, expires_date, credential_id")
      .eq("candidate_id", candidateId)
      .order("issued_date", { ascending: false, nullsFirst: false }),
    resumeQuery,
  ]);

  const errors = [
    ["candidate", candidateResult.error],
    ["requirement", requirementResult.error],
    ["requirement skills", requirementSkillsResult.error],
    ["candidate skills", skillsResult.error],
    ["employment", employmentResult.error],
    ["education", educationResult.error],
    ["projects", projectsResult.error],
    ["certifications", certificationsResult.error],
    ["verified resume", resumeResult.error],
  ] as const;
  for (const [label, error] of errors) {
    if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
  }

  if (!candidateResult.data || !requirementResult.data) {
    throw new Error("Candidate or requirement not found or access denied");
  }

  const sourceResume = resumeResult.data?.[0];
  if (!sourceResume || !sourceResume.extracted_text?.trim()) {
    throw new Error(
      "A human-verified resume with extracted source text is required before tailoring",
    );
  }

  const resumeTextHash = createHash("sha256")
    .update(sourceResume.extracted_text, "utf8")
    .digest("hex");
  const verifiedFactsSnapshot = {
    candidate: candidateResult.data,
    skills: skillsResult.data ?? [],
    employment: employmentResult.data ?? [],
    education: educationResult.data ?? [],
    projects: projectsResult.data ?? [],
    certifications: certificationsResult.data ?? [],
    source_resume: {
      id: sourceResume.id,
      file_name: sourceResume.file_name,
      extracted_text_sha256: resumeTextHash,
    },
  };
  const currentVerifiedFactsHash = createHash("sha256")
    .update(JSON.stringify(verifiedFactsSnapshot), "utf8")
    .digest("hex");
  if (sourceResume.verified_facts_hash !== currentVerifiedFactsHash) {
    throw new Error(
      "Candidate facts changed after source verification; review and verify the resume again",
    );
  }

  const sourceFacts = {
    ...verifiedFactsSnapshot,
    requirement: requirementResult.data,
    requirement_skills: requirementSkillsResult.data ?? [],
    source_resume: {
      ...verifiedFactsSnapshot.source_resume,
      verified_by: sourceResume.verified_by,
      verified_at: sourceResume.verified_at,
      verified_facts_hash: sourceResume.verified_facts_hash,
    },
  };
  const sourceHash = createHash("sha256").update(JSON.stringify(sourceFacts), "utf8").digest("hex");

  return { ...sourceFacts, sourceResume, sourceFacts, sourceHash };
}

function compactFactsForSelection(source: Awaited<ReturnType<typeof loadTailoringSource>>) {
  const shorten = (value: string | null, max = 1200) => value?.slice(0, max) ?? null;
  return {
    requirement: {
      ...source.requirement,
      description: shorten(source.requirement.description, 2500),
    },
    skills: source.skills.map(({ id, skill, years, is_primary }) => ({
      id,
      skill,
      years,
      is_primary,
    })),
    employment: source.employment.map(
      ({ id, company, title, start_date, end_date, is_current, description }) => ({
        id,
        company,
        title,
        start_date,
        end_date,
        is_current,
        description: shorten(description),
      }),
    ),
    education: source.education.map(({ id, institution, degree, field, start_year, end_year }) => ({
      id,
      institution,
      degree,
      field,
      start_year,
      end_year,
    })),
    projects: source.projects.map(({ id, name, description, technologies }) => ({
      id,
      name,
      description: shorten(description),
      technologies,
    })),
    certifications: source.certifications.map(
      ({ id, name, issuer, issued_date, expires_date, credential_id }) => ({
        id,
        name,
        issuer,
        issued_date,
        expires_date,
        credential_id,
      }),
    ),
  };
}

async function selectRelevantFactIds(
  source: Awaited<ReturnType<typeof loadTailoringSource>>,
): Promise<FactSelection> {
  const prompt = `Select and order the candidate fact IDs that are most relevant to the requirement.

ABSOLUTE RULES:
- Return IDs only. Never write, rewrite, summarize, infer, or add a candidate claim.
- Every returned ID must appear in the supplied facts in its matching category.
- Omit irrelevant facts, but do not change any fact.
- Empty arrays are valid when the source has no supported fact.

Return ONLY this JSON shape:
{
  "skill_ids": ["uuid"],
  "employment_ids": ["uuid"],
  "education_ids": ["uuid"],
  "project_ids": ["uuid"],
  "certification_ids": ["uuid"]
}

SOURCE FACTS:
${JSON.stringify(compactFactsForSelection(source))}`;

  return requestStructuredAiOutput(
    {
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a constrained record selector. You may output only existing record IDs in JSON; you never generate candidate claims.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    },
    SelectionSchema,
  );
}

function validateSelection(
  source: Awaited<ReturnType<typeof loadTailoringSource>>,
  selection: FactSelection,
) {
  const categories = [
    ["skill_ids", source.skills],
    ["employment_ids", source.employment],
    ["education_ids", source.education],
    ["project_ids", source.projects],
    ["certification_ids", source.certifications],
  ] as const;

  const selectedIds: string[] = [];
  for (const [key, rows] of categories) {
    const allowed = new Set(rows.map((row) => row.id));
    const ids = selection[key];
    if (new Set(ids).size !== ids.length) {
      throw new Error(`AI returned duplicate ${key}; no draft was saved`);
    }
    const invalid = ids.filter((id) => !allowed.has(id));
    if (invalid.length) {
      throw new Error(`AI selected unsupported ${key}; no draft was saved`);
    }
    selectedIds.push(...ids);
  }

  return {
    valid: true,
    validation_mode: "existing_record_ids_only",
    generated_claims_allowed: false,
    claim_count: selectedIds.length,
    selected_ids: selectedIds,
    checked_at: new Date().toISOString(),
  };
}

function inSelectedOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => Boolean(row));
}

function renderFactPreservingResume(
  source: Awaited<ReturnType<typeof loadTailoringSource>>,
  selection: FactSelection,
) {
  const { candidate } = source;
  const lines = [`${candidate.first_name} ${candidate.last_name}`];
  const headline = [candidate.current_title, candidate.current_employer, candidate.location]
    .filter(Boolean)
    .join(" | ");
  if (headline) lines.push(headline);
  if (candidate.summary) lines.push("", "SUMMARY", candidate.summary);

  const skills = inSelectedOrder(source.skills, selection.skill_ids);
  if (skills.length) {
    lines.push(
      "",
      "SKILLS",
      ...skills.map((fact) =>
        [fact.skill, fact.years === null ? null : `${fact.years} years`]
          .filter(Boolean)
          .join(" | "),
      ),
    );
  }

  const employment = inSelectedOrder(source.employment, selection.employment_ids);
  if (employment.length) {
    lines.push("", "EMPLOYMENT");
    for (const fact of employment) {
      lines.push(
        [fact.title, fact.company].filter(Boolean).join(" | "),
        [fact.start_date, fact.end_date ?? (fact.is_current ? "Present" : null)]
          .filter(Boolean)
          .join(" — "),
      );
      if (fact.location) lines.push(fact.location);
      if (fact.description) lines.push(fact.description);
      lines.push("");
    }
  }

  const projects = inSelectedOrder(source.projects, selection.project_ids);
  if (projects.length) {
    lines.push("PROJECTS");
    for (const fact of projects) {
      lines.push(fact.name);
      if (fact.description) lines.push(fact.description);
      if (fact.technologies.length) lines.push(fact.technologies.join(", "));
      lines.push("");
    }
  }

  const education = inSelectedOrder(source.education, selection.education_ids);
  if (education.length) {
    lines.push("EDUCATION");
    for (const fact of education) {
      lines.push(
        [fact.degree, fact.field, fact.institution].filter(Boolean).join(" | "),
        [fact.start_year, fact.end_year].filter((value) => value !== null).join(" — "),
      );
    }
  }

  const certifications = inSelectedOrder(source.certifications, selection.certification_ids);
  if (certifications.length) {
    lines.push("", "CERTIFICATIONS");
    for (const fact of certifications) {
      lines.push(
        [fact.name, fact.issuer, fact.issued_date, fact.expires_date].filter(Boolean).join(" | "),
      );
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function calculateMatchScore(
  source: Awaited<ReturnType<typeof loadTailoringSource>>,
  selection: FactSelection,
) {
  const selected = new Set(
    inSelectedOrder(source.skills, selection.skill_ids).map((fact) => fact.skill.toLowerCase()),
  );
  const mandatory = source.requirement_skills
    .filter((fact) => fact.is_mandatory)
    .map((fact) => fact.skill.toLowerCase());
  if (!mandatory.length) return null;
  return Math.round(
    (mandatory.filter((skill) => selected.has(skill)).length / mandatory.length) * 100,
  );
}

export const verifyCandidateResume = createServerFn({ method: "POST" })
  .middleware([requireTailoringAccess])
  .validator((input: unknown) =>
    z
      .object({
        candidate_id: z.string().uuid(),
        resume_id: z.string().uuid(),
        confirmed_against_source: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const [
      candidateResult,
      skillsResult,
      employmentResult,
      educationResult,
      projectsResult,
      certificationsResult,
      resumeResult,
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, first_name, last_name, current_title, current_employer, location, visa_status, availability, experience_years, primary_technology, summary",
        )
        .eq("id", data.candidate_id)
        .maybeSingle(),
      supabase
        .from("candidate_skills")
        .select("id, skill, years, is_primary")
        .eq("candidate_id", data.candidate_id)
        .order("is_primary", { ascending: false })
        .order("skill"),
      supabase
        .from("candidate_employment")
        .select("id, company, title, location, start_date, end_date, is_current, description")
        .eq("candidate_id", data.candidate_id)
        .order("start_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("candidate_education")
        .select("id, institution, degree, field, start_year, end_year")
        .eq("candidate_id", data.candidate_id)
        .order("end_year", { ascending: false, nullsFirst: false }),
      supabase
        .from("candidate_projects")
        .select("id, name, description, technologies")
        .eq("candidate_id", data.candidate_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("candidate_certifications")
        .select("id, name, issuer, issued_date, expires_date, credential_id")
        .eq("candidate_id", data.candidate_id)
        .order("issued_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("resumes")
        .select("id, file_name, extracted_text, verification_status")
        .eq("id", data.resume_id)
        .eq("candidate_id", data.candidate_id)
        .maybeSingle(),
    ]);
    const readError = [
      candidateResult.error,
      skillsResult.error,
      employmentResult.error,
      educationResult.error,
      projectsResult.error,
      certificationsResult.error,
      resumeResult.error,
    ].find((error) => error !== null);
    if (readError) throw new Error(readError.message);
    if (!candidateResult.data) throw new Error("Candidate not found or access denied");
    const resume = resumeResult.data;
    if (!resume) throw new Error("Resume not found or access denied");
    if (!resume.extracted_text?.trim()) {
      throw new Error("This resume has no extracted source text and cannot be verified");
    }

    const resumeTextHash = createHash("sha256").update(resume.extracted_text, "utf8").digest("hex");
    const verifiedFactsHash = createHash("sha256")
      .update(
        JSON.stringify({
          candidate: candidateResult.data,
          skills: skillsResult.data ?? [],
          employment: employmentResult.data ?? [],
          education: educationResult.data ?? [],
          projects: projectsResult.data ?? [],
          certifications: certificationsResult.data ?? [],
          source_resume: {
            id: resume.id,
            file_name: resume.file_name,
            extracted_text_sha256: resumeTextHash,
          },
        }),
        "utf8",
      )
      .digest("hex");

    if (resume.verification_status === "verified") {
      const { data: reset, error: resetError } = await supabase
        .from("resumes")
        .update({ verification_status: "pending" })
        .eq("id", data.resume_id)
        .eq("candidate_id", data.candidate_id)
        .select("id")
        .maybeSingle();
      if (resetError) throw new Error(resetError.message);
      if (!reset) throw new Error("Resume re-verification was not authorized");
    }

    const { data: verified, error } = await supabase
      .from("resumes")
      .update({ verification_status: "verified", verified_facts_hash: verifiedFactsHash })
      .eq("id", data.resume_id)
      .eq("candidate_id", data.candidate_id)
      .select("id, verification_status, verified_by, verified_at, verified_facts_hash")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!verified) throw new Error("Resume verification was not authorized");

    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string }).email ?? null,
      action: "resume.source_verified",
      entityType: "resume",
      entityId: verified.id,
      metadata: { candidate_id: data.candidate_id },
    });
    return verified;
  });

export const generateFactPreservingResume = createServerFn({ method: "POST" })
  .middleware([requireTailoringAccess])
  .validator((input: unknown) => IdPairSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const source = await loadTailoringSource(supabase, data.candidate_id, data.requirement_id);
    const selection = await runWithAiUsageGuard(supabase, userId, "resume_tailor", () =>
      selectRelevantFactIds(source),
    );
    const claimValidation = validateSelection(source, selection);
    const tailoredContent = renderFactPreservingResume(source, selection);
    if (!tailoredContent) throw new Error("No verified candidate facts were available to render");

    const { data: latest, error: latestError } = await supabase
      .from("resume_versions")
      .select("version_no")
      .eq("candidate_id", data.candidate_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(latestError.message);

    const { data: version, error } = await supabase
      .from("resume_versions")
      .insert({
        candidate_id: data.candidate_id,
        requirement_id: data.requirement_id,
        source_resume_id: source.sourceResume.id,
        version_no: (latest?.version_no ?? 0) + 1,
        status: "draft",
        tailored_summary: source.candidate.summary,
        tailored_content: tailoredContent,
        match_score: calculateMatchScore(source, selection),
        notes: "Fact-preserving ID selection; rendered only from the verified source snapshot.",
        source_facts: source.sourceFacts as unknown as Json,
        source_hash: source.sourceHash,
        claim_validation: {
          ...claimValidation,
          selection,
        } as unknown as Json,
        created_by: userId,
      })
      .select(
        "id, candidate_id, requirement_id, source_resume_id, version_no, status, file_path, tailored_summary, tailored_content, ats_score, match_score, notes, source_hash, claim_validation, approved_by, approved_at, created_at",
      )
      .single();
    if (error) throw new Error(error.message);

    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string }).email ?? null,
      action: "resume.tailoring_draft_created",
      entityType: "resume_version",
      entityId: version.id,
      metadata: {
        candidate_id: data.candidate_id,
        requirement_id: data.requirement_id,
        source_resume_id: source.sourceResume.id,
        claim_count: claimValidation.claim_count,
      },
    });

    return version;
  });

export const approveFactPreservingResume = createServerFn({ method: "POST" })
  .middleware([requireTailoringAccess])
  .validator((input: unknown) =>
    z
      .object({
        version_id: z.string().uuid(),
        confirmed_reviewed: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: current, error: currentError } = await supabase
      .from("resume_versions")
      .select(
        "id, candidate_id, requirement_id, source_resume_id, source_hash, status, claim_validation",
      )
      .eq("id", data.version_id)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new Error("Tailored resume not found or access denied");
    if (current.status !== "draft") throw new Error("Only a draft can be approved");
    if (!current.requirement_id || !current.source_resume_id || !current.source_hash) {
      throw new Error("Draft is missing source evidence and cannot be approved");
    }
    const validation = current.claim_validation as { valid?: boolean } | null;
    if (validation?.valid !== true) throw new Error("Claim validation has not passed");

    const source = await loadTailoringSource(
      supabase,
      current.candidate_id,
      current.requirement_id,
      current.source_resume_id,
    );
    if (source.sourceHash !== current.source_hash) {
      throw new Error("Candidate source facts changed; generate and review a new version");
    }

    const { data: approved, error } = await supabase
      .from("resume_versions")
      .update({ status: "approved" })
      .eq("id", current.id)
      .eq("status", "draft")
      .select(
        "id, candidate_id, requirement_id, source_resume_id, version_no, status, file_path, tailored_summary, tailored_content, ats_score, match_score, notes, source_hash, claim_validation, approved_by, approved_at, created_at",
      )
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!approved) throw new Error("Draft approval was not authorized");

    await writeAudit({
      actorId: userId,
      actorEmail: (claims as { email?: string }).email ?? null,
      action: "resume.tailoring_approved",
      entityType: "resume_version",
      entityId: approved.id,
      metadata: {
        candidate_id: approved.candidate_id,
        requirement_id: approved.requirement_id,
        source_resume_id: approved.source_resume_id,
      },
    });
    return approved;
  });

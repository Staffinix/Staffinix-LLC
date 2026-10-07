import { createServerFn } from "@tanstack/react-start";
import { requireCandidatesAccess } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  requestStructuredAiOutput,
  UNTRUSTED_DOCUMENT_SYSTEM_RULES,
} from "@/lib/ai-gateway.server";
import { providedCandidateChildKeys } from "@/lib/candidate-child-updates";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";
import { processDocumentInIsolatedWorker } from "@/lib/document-processing.server";
import { isCanonicalResumePathFor } from "@/lib/resume-storage-path";
import { MARKETING_TYPES } from "@/lib/candidates-constants";
import { normalizeUsPhone, US_PHONE_ERROR } from "@/lib/us-phone";
import { z } from "zod";

export { createDocumentUpload as createCandidateResumeUpload } from "@/lib/document-upload.functions";

// ============ Shared schemas ============

const STATUSES = ["active", "submitted", "placed", "on_hold", "inactive"] as const;
const AVAILS = ["immediate", "two_weeks", "one_month", "negotiable", "unavailable"] as const;
const RATE_TYPES = ["hourly", "annual", "monthly"] as const;
const SOURCES = ["manual", "paste", "pdf", "docx", "email"] as const;

const strictDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Date must be a real calendar date");

const nullableDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  strictDate.nullable().optional(),
);

const strictWebUrl = z
  .string()
  .trim()
  .max(400)
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "URL protocol must be HTTP or HTTPS");

const nullableWebUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  strictWebUrl.nullable().optional(),
);

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((value) => value.toLowerCase())
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const normalizedPhone = z
  .union([z.string().max(40), z.null(), z.undefined()])
  .transform((value, context) => {
    if (value == null || value.trim() === "") return null;
    const normalized = normalizeUsPhone(value);
    if (!normalized) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: US_PHONE_ERROR });
      return z.NEVER;
    }
    return normalized;
  });

const EmploymentSchema = z
  .object({
    company: z.string().trim().min(1).max(160),
    title: z.string().trim().max(160).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    start_date: nullableDate,
    end_date: nullableDate,
    is_current: z.boolean().default(false),
    description: z.string().trim().max(4000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.is_current && value.end_date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_date"],
        message: "Current employment cannot have an end date",
      });
    }
    if (value.start_date && value.end_date && value.end_date < value.start_date) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_date"],
        message: "Employment end date cannot precede start date",
      });
    }
  });

const EducationSchema = z
  .object({
    institution: z.string().trim().min(1).max(200),
    degree: z.string().trim().max(120).nullable().optional(),
    field: z.string().trim().max(160).nullable().optional(),
    start_year: z.number().int().min(1950).max(2100).nullable().optional(),
    end_year: z.number().int().min(1950).max(2100).nullable().optional(),
  })
  .refine((value) => !value.start_year || !value.end_year || value.end_year >= value.start_year, {
    path: ["end_year"],
    message: "Education end year cannot precede start year",
  });

const CertificationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    issuer: z.string().trim().max(160).nullable().optional(),
    issued_date: nullableDate,
    expires_date: nullableDate,
    credential_id: z.string().trim().max(160).nullable().optional(),
  })
  .refine(
    (value) => !value.issued_date || !value.expires_date || value.expires_date >= value.issued_date,
    { path: ["expires_date"], message: "Certification expiry cannot precede issue date" },
  );

const CandidateInputObjectSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: normalizedEmail,
  phone: normalizedPhone,
  location: z.string().trim().max(160).nullable().optional(),
  current_employer: z.string().trim().max(160).nullable().optional(),
  current_title: z.string().trim().max(160).nullable().optional(),
  required_job: z.string().trim().max(160).nullable().optional(),
  ready_to_relocate: z.boolean().nullable().optional(),
  preferred_location: z.string().trim().max(160).nullable().optional(),
  primary_technology: z.string().trim().max(120).nullable().optional(),
  visa_status: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value !== "C2C", "C2C is a marketing type, not a visa status")
    .nullable()
    .optional(),
  marketing_types: z
    .array(z.enum(MARKETING_TYPES))
    .max(MARKETING_TYPES.length)
    .refine((values) => new Set(values).size === values.length, "Marketing types must be unique")
    .default([]),
  availability: z.enum(AVAILS).nullable().optional(),
  min_rate: z.number().nonnegative().nullable().optional(),
  max_rate: z.number().nonnegative().nullable().optional(),
  rate_type: z.enum(RATE_TYPES).nullable().optional(),
  currency: z.string().trim().max(8).default("USD"),
  experience_years: z.number().nonnegative().max(60).nullable().optional(),
  linkedin_url: nullableWebUrl,
  github_url: nullableWebUrl,
  portfolio_url: nullableWebUrl,
  summary: z.string().trim().max(8000).nullable().optional(),
  ai_notes: z.string().trim().max(8000).nullable().optional(),
  ats_score: z.number().int().min(0).max(100).nullable().optional(),
  status: z.enum(STATUSES).default("active"),
  source: z.enum(SOURCES).default("manual"),
  skills: z
    .array(
      z.object({
        skill: z.string().trim().min(1).max(80),
        years: z.number().nonnegative().nullable().optional(),
        is_primary: z.boolean().default(false),
      }),
    )
    .max(120)
    .default([]),
  employment: z.array(EmploymentSchema).max(40).default([]),
  education: z.array(EducationSchema).max(20).default([]),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().trim().max(4000).nullable().optional(),
        technologies: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
      }),
    )
    .max(40)
    .default([]),
  certifications: z.array(CertificationSchema).max(40).default([]),
});

function validateCandidateCrossFields(
  value: Partial<z.infer<typeof CandidateInputObjectSchema>>,
  context: z.RefinementCtx,
) {
  if (value.min_rate != null && value.max_rate != null && value.max_rate < value.min_rate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["max_rate"],
      message: "Maximum rate cannot be lower than minimum rate",
    });
  }
  if ((value.min_rate != null || value.max_rate != null) && !value.rate_type) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rate_type"],
      message: "Rate type is required when a rate is provided",
    });
  }
  if ((value.employment ?? []).filter((job) => job.is_current).length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["employment"],
      message: "Only one employment record may be current",
    });
  }
  if (value.ready_to_relocate === false && !value.preferred_location?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["preferred_location"],
      message: "Preferred location is required when the candidate is not ready to relocate",
    });
  }
}

export const CandidateInputSchema = CandidateInputObjectSchema.superRefine(
  validateCandidateCrossFields,
);

export type CandidateInput = z.infer<typeof CandidateInputSchema>;

// ============ List / filter / paginate ============

const ListInputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  visa: z.array(z.string()).optional(),
  availability: z.array(z.enum(AVAILS)).optional(),
  status: z.array(z.enum(STATUSES)).optional(),
  location: z.string().trim().max(120).optional(),
  current_employer: z.string().trim().max(120).optional(),
  technology: z.string().trim().max(120).optional(),
  skill: z.string().trim().max(80).optional(),
  assigned_to: z.string().uuid().optional(),
  submission_state: z.enum(["submitted", "unsubmitted"]).optional(),
  submission_sort: z.enum(["asc", "desc"]).optional(),
  min_experience: z.number().min(0).max(60).optional(),
  max_experience: z.number().min(0).max(60).optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => ListInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    const candidateSelect = data.skill
      ? ("id,first_name,last_name,email,phone,location,current_employer,current_title,primary_technology,visa_status,marketing_types,availability,experience_years,min_rate,max_rate,rate_type,currency,status,created_at,updated_at,created_by,assigned_to,assigned_at,assigned_by,last_submitted_at,last_submitted_by,candidate_skills!inner(skill,is_primary),resumes(candidate_id),submissions(candidate_id,stage,submitted_by,submitted_at,created_at)" as const)
      : ("id,first_name,last_name,email,phone,location,current_employer,current_title,primary_technology,visa_status,marketing_types,availability,experience_years,min_rate,max_rate,rate_type,currency,status,created_at,updated_at,created_by,assigned_to,assigned_at,assigned_by,last_submitted_at,last_submitted_by,candidate_skills(skill,is_primary),resumes(candidate_id),submissions(candidate_id,stage,submitted_by,submitted_at,created_at)" as const);

    let q = supabase.from("candidates").select(candidateSelect, { count: "exact" });
    q = data.submission_sort
      ? q.order("last_submitted_at", {
          ascending: data.submission_sort === "asc",
          nullsFirst: false,
        })
      : q.order("created_at", { ascending: false });
    q = q
      .order("submitted_at", {
        referencedTable: "submissions",
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", { referencedTable: "submissions", ascending: false })
      .limit(1, { referencedTable: "submissions" })
      .range(from, to);

    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(
        `first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},primary_technology.ilike.${s}`,
      );
    }
    if (data.visa?.length) q = q.in("visa_status", data.visa);
    if (data.availability?.length) q = q.in("availability", data.availability);
    if (data.status?.length) q = q.in("status", data.status);
    if (data.location) q = q.ilike("location", `%${data.location}%`);
    if (data.current_employer) q = q.ilike("current_employer", `%${data.current_employer}%`);
    if (data.technology) q = q.ilike("primary_technology", `%${data.technology}%`);
    if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (data.submission_state === "submitted") q = q.not("last_submitted_at", "is", null);
    if (data.submission_state === "unsubmitted") q = q.is("last_submitted_at", null);
    if (data.min_experience != null) q = q.gte("experience_years", data.min_experience);
    if (data.max_experience != null) q = q.lte("experience_years", data.max_experience);

    if (data.skill) {
      q = q.ilike("candidate_skills.skill", `%${data.skill}%`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const candidateRows = rows ?? [];
    const profileIds = [
      ...new Set(
        candidateRows
          .flatMap((candidate) => [candidate.assigned_to, candidate.submissions[0]?.submitted_by])
          .filter(Boolean),
      ),
    ] as string[];
    const profilesResult = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", profileIds)
      : { data: [], error: null };
    if (profilesResult.error) throw new Error("Unable to resolve assigned recruiters.");

    const profileById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );

    return {
      rows: candidateRows.map(({ candidate_skills, resumes, submissions, ...candidate }) => {
        return {
          ...candidate,
          assigned_recruiter: candidate.assigned_to
            ? (profileById.get(candidate.assigned_to) ?? null)
            : null,
          latest_submission: submissions[0]
            ? {
                ...submissions[0],
                submitted_by_profile: submissions[0].submitted_by
                  ? (profileById.get(submissions[0].submitted_by) ?? null)
                  : null,
              }
            : null,
          top_skills: candidate_skills
            .slice()
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
            .slice(0, 6)
            .map((candidateSkill) => candidateSkill.skill),
          has_resume: resumes.length > 0,
        };
      }),
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

// ============ Get one (full profile) ============

export const getCandidate = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cand, error } = await supabase
      .from("candidates")
      .select(
        "id, first_name, last_name, email, phone, location, current_title, current_employer, required_job, ready_to_relocate, preferred_location, primary_technology, experience_years, visa_status, marketing_types, availability, status, summary, linkedin_url, github_url, portfolio_url, min_rate, max_rate, rate_type, currency, source, assigned_to, assigned_at, assigned_by, ats_score, ai_notes, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cand) throw new Error("Candidate not found");

    const [skills, employment, education, projects, certifications, resumes, versions] =
      await Promise.all([
        supabase
          .from("candidate_skills")
          .select("id, candidate_id, skill, years, is_primary, created_at")
          .eq("candidate_id", data.id)
          .order("is_primary", { ascending: false })
          .order("skill"),
        supabase
          .from("candidate_employment")
          .select(
            "id, candidate_id, company, title, location, start_date, end_date, is_current, description, created_at",
          )
          .eq("candidate_id", data.id)
          .order("start_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("candidate_education")
          .select("id, candidate_id, institution, degree, field, start_year, end_year, created_at")
          .eq("candidate_id", data.id)
          .order("end_year", { ascending: false, nullsFirst: false }),
        supabase
          .from("candidate_projects")
          .select("id, candidate_id, name, description, technologies, created_at")
          .eq("candidate_id", data.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("candidate_certifications")
          .select(
            "id, candidate_id, name, issuer, issued_date, expires_date, credential_id, created_at",
          )
          .eq("candidate_id", data.id)
          .order("issued_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("resumes")
          .select(
            "id, candidate_id, file_name, file_path, mime_type, size_bytes, source, is_primary, created_at, extracted_text, verification_status, verified_by, verified_at, verified_facts_hash",
          )
          .eq("candidate_id", data.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("resume_versions")
          .select(
            "id, candidate_id, requirement_id, source_resume_id, version_no, status, file_path, tailored_summary, tailored_content, ats_score, match_score, notes, source_hash, claim_validation, approved_by, approved_at, created_at",
          )
          .eq("candidate_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    const childQueries = [
      ["candidate_skills", skills.error],
      ["candidate_employment", employment.error],
      ["candidate_education", education.error],
      ["candidate_projects", projects.error],
      ["candidate_certifications", certifications.error],
      ["resumes", resumes.error],
      ["resume_versions", versions.error],
    ] as const;

    for (const [table, error] of childQueries) {
      if (error) {
        throw new Error(`Failed to load ${table}: ${error.message}`);
      }
    }

    return {
      ...cand,
      skills: skills.data ?? [],
      employment: employment.data ?? [],
      education: education.data ?? [],
      projects: projects.data ?? [],
      certifications: certifications.data ?? [],
      resumes: resumes.data ?? [],
      versions: versions.data ?? [],
    };
  });

// ============ Create / update / delete ============

type CandidateSupabase = import("@supabase/supabase-js").SupabaseClient<
  import("@/integrations/supabase/types").Database
>;

async function deleteCandidateChildRows(
  supabase: CandidateSupabase,
  table:
    | "candidate_skills"
    | "candidate_employment"
    | "candidate_education"
    | "candidate_projects"
    | "candidate_certifications",
  candidateId: string,
) {
  const { error } = await supabase.from(table).delete().eq("candidate_id", candidateId);
  if (error) throw new Error(`Failed to replace candidate ${table}: ${error.message}`);
}

async function replaceCandidateSkills(
  supabase: CandidateSupabase,
  candidateId: string,
  skills: CandidateInput["skills"],
) {
  await deleteCandidateChildRows(supabase, "candidate_skills", candidateId);
  if (!skills.length) return;
  const { error } = await supabase.from("candidate_skills").insert(
    skills.map((skill) => ({
      ...skill,
      candidate_id: candidateId,
      years: skill.years ?? null,
    })),
  );
  if (error) throw new Error(`Failed to save candidate skills: ${error.message}`);
}

async function replaceCandidateEmployment(
  supabase: CandidateSupabase,
  candidateId: string,
  employment: CandidateInput["employment"],
) {
  await deleteCandidateChildRows(supabase, "candidate_employment", candidateId);
  if (!employment.length) return;
  const { error } = await supabase.from("candidate_employment").insert(
    employment.map((job) => ({
      ...job,
      candidate_id: candidateId,
      start_date: job.start_date || null,
      end_date: job.end_date || null,
    })),
  );
  if (error) throw new Error(`Failed to save candidate employment: ${error.message}`);
}

async function replaceCandidateEducation(
  supabase: CandidateSupabase,
  candidateId: string,
  education: CandidateInput["education"],
) {
  await deleteCandidateChildRows(supabase, "candidate_education", candidateId);
  if (!education.length) return;
  const { error } = await supabase
    .from("candidate_education")
    .insert(education.map((item) => ({ ...item, candidate_id: candidateId })));
  if (error) throw new Error(`Failed to save candidate education: ${error.message}`);
}

async function replaceCandidateProjects(
  supabase: CandidateSupabase,
  candidateId: string,
  projects: CandidateInput["projects"],
) {
  await deleteCandidateChildRows(supabase, "candidate_projects", candidateId);
  if (!projects.length) return;
  const { error } = await supabase
    .from("candidate_projects")
    .insert(projects.map((project) => ({ ...project, candidate_id: candidateId })));
  if (error) throw new Error(`Failed to save candidate projects: ${error.message}`);
}

async function replaceCandidateCertifications(
  supabase: CandidateSupabase,
  candidateId: string,
  certifications: CandidateInput["certifications"],
) {
  await deleteCandidateChildRows(supabase, "candidate_certifications", candidateId);
  if (!certifications.length) return;
  const { error } = await supabase.from("candidate_certifications").insert(
    certifications.map((certification) => ({
      ...certification,
      candidate_id: candidateId,
      issued_date: certification.issued_date || null,
      expires_date: certification.expires_date || null,
    })),
  );
  if (error) throw new Error(`Failed to save candidate certifications: ${error.message}`);
}

type CandidateResumeInsert = {
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_primary: boolean;
  extracted_text: string | null;
  source: (typeof SOURCES)[number];
};

async function createCandidateGraph(
  supabase: CandidateSupabase,
  input: CandidateInput,
  resume: CandidateResumeInsert | null = null,
  assignedTo: string | null = null,
) {
  const { skills, employment, education, projects, certifications, ...candidate } = input;
  const { data, error } = await supabase
    .rpc("create_candidate_graph", {
      _candidate: { ...candidate, status: "active", assigned_to: assignedTo } as unknown as Json,
      _skills: skills as unknown as Json,
      _employment: employment as unknown as Json,
      _education: education as unknown as Json,
      _projects: projects as unknown as Json,
      _certifications: certifications as unknown as Json,
      _resume: resume as unknown as Json | null,
    })
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to create candidate: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to create candidate");
  }

  return data;
}

async function createCandidateGraphFromResumeUpload(
  supabase: CandidateSupabase,
  input: CandidateInput,
  uploadId: string,
  extractedText: string | null,
  assignedTo: string | null = null,
) {
  const { skills, employment, education, projects, certifications, ...candidate } = input;
  const { data, error } = await supabase
    .rpc("create_candidate_graph_from_resume_upload", {
      _candidate: { ...candidate, status: "active", assigned_to: assignedTo } as unknown as Json,
      _resume_upload_id: uploadId,
      _skills: skills as unknown as Json,
      _employment: employment as unknown as Json,
      _education: education as unknown as Json,
      _projects: projects as unknown as Json,
      _certifications: certifications as unknown as Json,
      _extracted_text: extractedText ?? undefined,
    })
    .maybeSingle();

  if (error) throw new Error(`Failed to create candidate: ${error.message}`);
  if (!data) throw new Error("Failed to create candidate");
  return data;
}

export const createCandidate = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => CandidateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    /*
     * The RPC is one PostgreSQL transaction. It derives tenant_id, created_by
     * and uploaded_by from the authenticated JWT, preserves RLS as the
     * authorization boundary, writes the audit record, and durably enqueues
     * embedding work before it commits.
     */
    const { getUserRoles } = await import("@/lib/rbac.server");
    const assignedTo = (await getUserRoles(supabase, userId)).includes("recruiter") ? userId : null;
    const created = await createCandidateGraph(supabase, data, null, assignedTo);

    return { id: created.candidate_id };
  });

const UpdateSchema = CandidateInputObjectSchema.omit({ status: true })
  .partial()
  .extend({ id: z.string().uuid() })
  .superRefine(validateCandidateCrossFields);

export const updateCandidate = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const { id, skills, employment, education, projects, certifications, ...fields } = data;

    /*
     * Do not add tenant_id from the request here.
     * RLS must decide whether the authenticated user can update this row.
     */
    const patch = fields;

    const { data: updated, error } = await supabase
      .from("candidates")
      .update(patch)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update candidate: ${error.message}`);
    }

    /*
     * With RLS, a candidate from another tenant is invisible to UPDATE.
     * Therefore an empty result is treated as not found/unauthorized.
     */
    if (!updated) {
      throw new Error("Candidate not found or access denied");
    }

    const childFieldsChanged = providedCandidateChildKeys({
      skills,
      employment,
      education,
      projects,
      certifications,
    });
    const hasChildChanges = childFieldsChanged.length > 0;

    if (hasChildChanges) {
      /*
       * Omitted collections are not touched. An explicit [] is the only way
       * to clear a collection. Each helper deletes and replaces one table,
       * and child-table RLS independently validates candidate ownership.
       */
      for (const childField of childFieldsChanged) {
        switch (childField) {
          case "skills":
            await replaceCandidateSkills(supabase, id, skills!);
            break;
          case "employment":
            await replaceCandidateEmployment(supabase, id, employment!);
            break;
          case "education":
            await replaceCandidateEducation(supabase, id, education!);
            break;
          case "projects":
            await replaceCandidateProjects(supabase, id, projects!);
            break;
          case "certifications":
            await replaceCandidateCertifications(supabase, id, certifications!);
            break;
        }
      }

      const { refreshCandidateEmbedding } = await import("@/lib/embedding-service.server");
      await refreshCandidateEmbedding(supabase, id);
    }

    const { writeAudit } = await import("@/lib/audit.server");

    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "candidate.updated",
      entityType: "candidate",
      entityId: id,
      metadata: {
        fields: Object.keys(fields),
        childFieldsChanged,
      },
    });

    return { ok: true };
  });

export const deleteCandidate = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    /*
     * The database RLS policy is the actual authorization boundary.
     * Never use supabaseAdmin here.
     */
    const { data: deleted, error } = await supabase
      .from("candidates")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to delete candidate: ${error.message}`);
    }

    if (!deleted) {
      throw new Error("Candidate not found or access denied");
    }

    const { writeAudit } = await import("@/lib/audit.server");

    await writeAudit({
      actorId: userId,
      actorEmail: (claims.email as string | undefined) ?? null,
      action: "candidate.deleted",
      entityType: "candidate",
      entityId: data.id,
    });

    return { ok: true };
  });

// ============ Resume parse + upload ============

const PARSE_INSTRUCTION = `Extract structured candidate data from the resume. Return ONLY valid JSON:
{
  "first_name": string,
  "last_name": string,
  "email": string | null,
  "phone": string | null,
  "location": string | null,
  "current_employer": string | null,
  "current_title": string | null,
  "primary_technology": string | null,
  "visa_status": string | null,
  "availability": "immediate" | "two_weeks" | "one_month" | "negotiable" | "unavailable" | null,
  "experience_years": number | null,
  "linkedin_url": string | null,
  "github_url": string | null,
  "portfolio_url": string | null,
  "summary": string | null,
  "ats_score": number | null,
  "skills": [{ "skill": string, "years": number | null, "is_primary": boolean }],
  "employment": [{ "company": string, "title": string | null, "location": string | null, "start_date": string | null, "end_date": string | null, "is_current": boolean, "description": string | null }],
  "education": [{ "institution": string, "degree": string | null, "field": string | null, "start_year": number | null, "end_year": number | null }],
  "projects": [{ "name": string, "description": string | null, "technologies": string[] }],
  "certifications": [{ "name": string, "issuer": string | null, "issued_date": string | null, "expires_date": string | null, "credential_id": string | null }]
}
Rules:
- visa_status one of: USC, GC, GC-EAD, H1B, H4-EAD, L2, OPT, CPT, TN, EAD or null.
- Dates in YYYY-MM-DD when possible, else null. Years as integers.
- ats_score: 0-100 estimate of resume ATS-friendliness.
- Mark top 3 technologies as is_primary=true.
- Use null / [] when unknown. No prose outside JSON.`;

const RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const ParseResumeSchema = z
  .object({
    upload_id: z.string().uuid().optional(),
    text: z.string().trim().min(20).max(60000).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.upload_id || value.text), "Provide a resume upload or text");

const CandidateAiOutputSchema = CandidateInputObjectSchema.pick({
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  location: true,
  current_employer: true,
  current_title: true,
  primary_technology: true,
  visa_status: true,
  availability: true,
  experience_years: true,
  linkedin_url: true,
  github_url: true,
  portfolio_url: true,
  summary: true,
  ats_score: true,
  skills: true,
  employment: true,
  education: true,
  projects: true,
  certifications: true,
}).strict();

const CreateCandidateWithResumeSchema = z
  .object({
    candidate: CandidateInputSchema,
    upload_id: z.string().uuid(),
  })
  .strict();

export const createCandidateWithResume = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => CreateCandidateWithResumeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: authorized, error: authorizeError } = await supabase
      .rpc("authorize_resume_upload", { _upload_id: data.upload_id })
      .maybeSingle();
    if (authorizeError || !authorized) {
      throw new Error(
        `Resume upload is invalid or expired: ${authorizeError?.message ?? "not found"}`,
      );
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from("resume-uploads")
      .download(authorized.staging_path);
    if (downloadError || !blob) {
      throw new Error(`Failed to read uploaded resume: ${downloadError?.message ?? "not found"}`);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== authorized.size_bytes) {
      await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
      throw new Error("Uploaded resume size does not match its server-issued grant");
    }
    const isPdf =
      authorized.mime_type === "application/pdf" &&
      bytes.length >= 5 &&
      String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
    const isDocx =
      authorized.mime_type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b;
    if (!isPdf && !isDocx) {
      await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
      throw new Error("Uploaded file content does not match its declared resume type");
    }

    let processedDocument: Awaited<ReturnType<typeof processDocumentInIsolatedWorker>>;
    try {
      processedDocument = await processDocumentInIsolatedWorker({
        bytes,
        mimeType: authorized.mime_type,
      });
    } catch (error) {
      await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
      throw error;
    }

    const { getUserRoles } = await import("@/lib/rbac.server");
    const assignedTo = (await getUserRoles(supabase, userId)).includes("recruiter") ? userId : null;
    const created = await createCandidateGraphFromResumeUpload(
      supabase,
      data.candidate,
      data.upload_id,
      processedDocument.extracted_text,
      assignedTo,
    );
    const { error: storeError } = await supabase.storage
      .from("resumes")
      .upload(created.resume_path, blob, {
        contentType: authorized.mime_type,
        upsert: false,
      });
    if (storeError) {
      throw new Error(`Candidate was created but resume storage failed: ${storeError.message}`);
    }

    await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
    return { id: created.candidate_id };
  });

export const parseAndCreateCandidate = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => ParseResumeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let uploadedResume:
      | {
          upload_id: string;
          file_name: string;
          mime_type: (typeof RESUME_MIME_TYPES)[number];
          size_bytes: number;
          staging_path: string;
          bytes: Uint8Array;
          blob: Blob;
        }
      | undefined;
    let extractedText = data.text ?? null;

    if (data.upload_id) {
      const { data: authorized, error: authorizeError } = await supabase
        .rpc("authorize_resume_upload", { _upload_id: data.upload_id })
        .maybeSingle();
      if (authorizeError || !authorized) {
        throw new Error(
          `Resume upload is invalid or expired: ${authorizeError?.message ?? "not found"}`,
        );
      }

      const { data: blob, error: downloadError } = await supabase.storage
        .from("resume-uploads")
        .download(authorized.staging_path);
      if (downloadError || !blob) {
        throw new Error(`Failed to read uploaded resume: ${downloadError?.message ?? "not found"}`);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength !== authorized.size_bytes) {
        await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
        throw new Error("Uploaded resume size does not match its server-issued grant");
      }
      const isPdf =
        authorized.mime_type === "application/pdf" &&
        bytes.length >= 5 &&
        String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
      const isDocx =
        authorized.mime_type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
        bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b;
      if (!isPdf && !isDocx) {
        await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
        throw new Error("Uploaded file content does not match its declared resume type");
      }

      let processedDocument: Awaited<ReturnType<typeof processDocumentInIsolatedWorker>>;
      try {
        processedDocument = await processDocumentInIsolatedWorker({
          bytes,
          mimeType: authorized.mime_type,
        });
      } catch (error) {
        await supabase.storage.from("resume-uploads").remove([authorized.staging_path]);
        throw error;
      }

      uploadedResume = {
        ...authorized,
        mime_type: authorized.mime_type as (typeof RESUME_MIME_TYPES)[number],
        bytes,
        blob,
      };

      if (isDocx) {
        extractedText = processedDocument.extracted_text;
      }
    }

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: PARSE_INSTRUCTION }];
    if (extractedText) {
      userContent.push({
        type: "text",
        text: `BEGIN_UNTRUSTED_RESUME\n${extractedText}\nEND_UNTRUSTED_RESUME`,
      });
    }
    if (uploadedResume?.mime_type === "application/pdf") {
      userContent.push({
        type: "file",
        file: {
          filename: uploadedResume.file_name,
          file_data: `data:application/pdf;base64,${Buffer.from(uploadedResume.bytes).toString("base64")}`,
        },
      });
    }

    const p = await runWithAiUsageGuard(supabase, userId, "candidate_parse", () =>
      requestStructuredAiOutput(
        {
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `${UNTRUSTED_DOCUMENT_SYSTEM_RULES}\nExtract candidate facts only. Return only the requested JSON object.`,
            },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        },
        CandidateAiOutputSchema,
      ),
    );

    const input: CandidateInput = CandidateInputSchema.parse({
      ...p,
      status: "active",
      source: uploadedResume
        ? uploadedResume.mime_type === "application/pdf"
          ? "pdf"
          : "docx"
        : "paste",
      currency: "USD",
    });

    const { getUserRoles } = await import("@/lib/rbac.server");
    const assignedTo = (await getUserRoles(supabase, userId)).includes("recruiter") ? userId : null;

    let created: { candidate_id: string; resume_path?: string };
    if (uploadedResume) {
      created = await createCandidateGraphFromResumeUpload(
        supabase,
        input,
        uploadedResume.upload_id,
        extractedText,
        assignedTo,
      );

      const { error: storeError } = await supabase.storage
        .from("resumes")
        .upload(created.resume_path!, uploadedResume.blob, {
          contentType: uploadedResume.mime_type,
          upsert: false,
        });
      if (storeError) {
        throw new Error(`Candidate was created but resume storage failed: ${storeError.message}`);
      }

      // Cleanup is not part of the business transaction. The staging object is
      // already expired and inaccessible if this best-effort removal fails.
      await supabase.storage.from("resume-uploads").remove([uploadedResume.staging_path]);
    } else {
      created = await createCandidateGraph(
        supabase,
        input,
        {
          file_name: "resume.txt",
          mime_type: "text/plain",
          size_bytes: extractedText?.length ?? null,
          is_primary: true,
          extracted_text: extractedText,
          source: input.source,
        },
        assignedTo,
      );
    }

    return { id: created.candidate_id, name: `${input.first_name} ${input.last_name}` };
  });

// ============ Signed URL for resume download ============
export const getResumeSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) =>
    z
      .object({
        path: z.string().trim().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    if (data.path.startsWith("inline://")) {
      return { url: null };
    }

    /*
     * IMPORTANT:
     * Do not create a signed URL solely because the caller knows a storage
     * path. First resolve the path through the `resumes` table.
     *
     * RLS on `resumes` must ensure that the authenticated user can only see
     * resume rows belonging to their tenant. Only after that succeeds do we
     * ask Storage for the signed URL.
     */
    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select("id, tenant_id, candidate_id, file_path, mime_type")
      .eq("file_path", data.path)
      .maybeSingle();

    if (resumeError) {
      throw new Error(`Failed to authorize resume: ${resumeError.message}`);
    }

    if (!resume) {
      throw new Error("Resume not found or access denied");
    }

    if (
      !isCanonicalResumePathFor({
        path: resume.file_path,
        tenantId: resume.tenant_id,
        candidateId: resume.candidate_id,
        mimeType: resume.mime_type,
      })
    ) {
      throw new Error("Resume has a non-canonical storage path");
    }

    const { data: signed, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(data.path, 60 * 10);

    if (error) {
      throw new Error(`Failed to create resume URL: ${error.message}`);
    }

    return {
      url: signed.signedUrl,
    };
  });

// ============ Semantic search over candidates ============
export const semanticSearchCandidates = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(500),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { generateQueryEmbedding } = await import("@/lib/embedding-service.server");
    const { embedding } = await runWithAiUsageGuard(
      supabase,
      context.userId,
      "semantic_search",
      () => generateQueryEmbedding(data.query),
    );
    const vecLiteral = `[${embedding.join(",")}]`;
    const { data: matches, error } = await supabase.rpc("search_candidates_semantic", {
      _query_embedding: vecLiteral as unknown as string,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    const ids = (matches ?? []).map((m) => m.candidate_id);
    if (!ids.length) return { rows: [] };
    /*
     * The semantic RPC MUST also be tenant-safe. The final candidates query
     * is intentionally performed through the authenticated Supabase client,
     * so RLS removes any candidate that does not belong to the current
     * tenant before anything is returned to the caller.
     *
     * Do not replace this with supabaseAdmin.
     */
    const { data: cands, error: candidatesError } = await supabase
      .from("candidates")
      .select(
        "id, first_name, last_name, current_title, current_employer, primary_technology, location, visa_status, availability, experience_years",
      )
      .in("id", ids)
      .limit(data.limit);

    if (candidatesError) {
      throw new Error(`Failed to load semantic search results: ${candidatesError.message}`);
    }

    const simMap = new Map((matches ?? []).map((m) => [m.candidate_id, m.similarity]));
    const rows = (cands ?? [])
      .map((c) => ({ ...c, similarity: simMap.get(c.id) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity);
    return { rows };
  });

// ============ Re-embed a requirement (called on demand) ============
export const embedRequirement = createServerFn({ method: "POST" })
  .middleware([requireCandidatesAccess])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { refreshRequirementEmbedding } = await import("@/lib/embedding-service.server");
    await runWithAiUsageGuard(supabase, context.userId, "requirement_embedding", () =>
      refreshRequirementEmbedding(supabase, data.id),
    );
    return { ok: true };
  });

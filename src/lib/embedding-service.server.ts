import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { fetchAiGateway } from "@/lib/ai-gateway.server";

type AuthenticatedSupabase = SupabaseClient<Database>;

export type CandidateEmbeddingAccess = Readonly<{
  kind: "candidate";
  entityId: string;
  tenantId: string;
}>;

export type RequirementEmbeddingAccess = Readonly<{
  kind: "requirement";
  entityId: string;
  tenantId: string;
}>;

type EmbeddingJob = {
  job_id: string;
  candidate_id: string;
  attempts: number;
};

type CandidateFacts = {
  first_name: string;
  last_name: string;
  current_title: string | null;
  current_employer: string | null;
  primary_technology: string | null;
  location: string | null;
  visa_status: string | null;
  availability: string | null;
  experience_years: number | null;
  summary: string | null;
};

const candidateAccessGrants = new WeakSet<object>();
const requirementAccessGrants = new WeakSet<object>();

function issueCandidateAccess(entityId: string, tenantId: string): CandidateEmbeddingAccess {
  const access = Object.freeze({ kind: "candidate" as const, entityId, tenantId });
  candidateAccessGrants.add(access);
  return access;
}

function issueRequirementAccess(entityId: string, tenantId: string): RequirementEmbeddingAccess {
  const access = Object.freeze({ kind: "requirement" as const, entityId, tenantId });
  requirementAccessGrants.add(access);
  return access;
}

/**
 * Authorize through the caller's authenticated Supabase client. This query is
 * intentionally evaluated by candidate RLS before any privileged write grant
 * can be issued.
 */
export async function authorizeCandidateAccess(
  supabase: AuthenticatedSupabase,
  candidateId: string,
): Promise<CandidateEmbeddingAccess> {
  const { data, error } = await supabase
    .from("candidates")
    .select("id, tenant_id")
    .eq("id", candidateId)
    .maybeSingle();

  if (error) throw new Error("Failed to authorize candidate embedding access", { cause: error });
  if (!data?.tenant_id) throw new Error("Candidate not found or access denied");
  return issueCandidateAccess(data.id, data.tenant_id);
}

/**
 * Authorize through requirement RLS. Application code cannot construct a
 * valid runtime grant by casting an object because writeRequirementEmbedding
 * also checks the module-private WeakSet.
 */
export async function authorizeRequirementAccess(
  supabase: AuthenticatedSupabase,
  requirementId: string,
): Promise<RequirementEmbeddingAccess> {
  const { data, error } = await supabase
    .from("requirements")
    .select("id, tenant_id")
    .eq("id", requirementId)
    .maybeSingle();

  if (error) throw new Error("Failed to authorize requirement embedding access", { cause: error });
  if (!data?.tenant_id) throw new Error("Requirement not found or access denied");
  return issueRequirementAccess(data.id, data.tenant_id);
}

async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string }> {
  const model = "google/gemini-embedding-001";
  const payload = z
    .object({
      data: z
        .array(
          z.object({ embedding: z.array(z.number().finite()).min(1).max(10_000) }).passthrough(),
        )
        .min(1)
        .max(8),
    })
    .passthrough()
    .parse(await fetchAiGateway("/v1/embeddings", { model, input: text.slice(0, 30_000) }));
  const embedding = payload.data[0].embedding;
  return { embedding, model };
}

/**
 * The only candidate_embeddings write in application code. A grant must have
 * been issued by authorizeCandidateAccess or by the private queue-claim path,
 * and tenant ownership is revalidated immediately before the admin upsert.
 */
export async function writeCandidateEmbedding(
  access: CandidateEmbeddingAccess,
  text: string,
): Promise<void> {
  if (!candidateAccessGrants.has(access)) {
    throw new Error("A verified candidate embedding access grant is required");
  }

  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from("candidates")
    .select("id")
    .eq("id", access.entityId)
    .eq("tenant_id", access.tenantId)
    .maybeSingle();
  if (candidateError)
    throw new Error("Failed to revalidate candidate embedding access", {
      cause: candidateError,
    });
  if (!candidate) throw new Error("Candidate embedding access is no longer valid");

  const { embedding, model } = await generateEmbedding(text);
  const { data: written, error: writeError } = await supabaseAdmin
    .from("candidate_embeddings")
    .upsert({
      candidate_id: access.entityId,
      embedding: `[${embedding.join(",")}]`,
      model,
      updated_at: new Date().toISOString(),
    })
    .select("candidate_id")
    .maybeSingle();

  if (writeError) throw new Error("Failed to persist candidate embedding", { cause: writeError });
  if (written?.candidate_id !== access.entityId) {
    throw new Error("Candidate embedding write returned no result");
  }
}

/**
 * The only requirement_embeddings write in application code. It has the same
 * runtime capability and tenant revalidation requirements as candidates.
 */
export async function writeRequirementEmbedding(
  access: RequirementEmbeddingAccess,
  text: string,
): Promise<void> {
  if (!requirementAccessGrants.has(access)) {
    throw new Error("A verified requirement embedding access grant is required");
  }

  const { data: requirement, error: requirementError } = await supabaseAdmin
    .from("requirements")
    .select("id")
    .eq("id", access.entityId)
    .eq("tenant_id", access.tenantId)
    .maybeSingle();
  if (requirementError)
    throw new Error("Failed to revalidate requirement embedding access", {
      cause: requirementError,
    });
  if (!requirement) throw new Error("Requirement embedding access is no longer valid");

  const { embedding, model } = await generateEmbedding(text);
  const { data: written, error: writeError } = await supabaseAdmin
    .from("requirement_embeddings")
    .upsert({
      requirement_id: access.entityId,
      embedding: `[${embedding.join(",")}]`,
      model,
      updated_at: new Date().toISOString(),
    })
    .select("requirement_id")
    .maybeSingle();

  if (writeError) throw new Error("Failed to persist requirement embedding", { cause: writeError });
  if (written?.requirement_id !== access.entityId) {
    throw new Error("Requirement embedding write returned no result");
  }
}

function buildCandidateEmbeddingText(
  candidate: CandidateFacts,
  skills: Array<{ skill: string; years: number | null; is_primary: boolean }>,
  employment: Array<{
    company: string;
    title: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
  }>,
  education: Array<{
    institution: string;
    degree: string | null;
    field: string | null;
    start_year: number | null;
    end_year: number | null;
  }>,
  projects: Array<{ name: string; description: string | null; technologies: string[] }>,
  certifications: Array<{
    name: string;
    issuer: string | null;
    issued_date: string | null;
    expires_date: string | null;
  }>,
  resumeText: string | null,
) {
  const lines = [`${candidate.first_name} ${candidate.last_name}`];
  if (candidate.current_title) lines.push(`Current title: ${candidate.current_title}`);
  if (candidate.current_employer) lines.push(`Current employer: ${candidate.current_employer}`);
  if (candidate.primary_technology)
    lines.push(`Primary technology: ${candidate.primary_technology}`);
  if (candidate.location) lines.push(`Location: ${candidate.location}`);
  if (candidate.visa_status) lines.push(`Visa status: ${candidate.visa_status}`);
  if (candidate.availability) lines.push(`Availability: ${candidate.availability}`);
  if (candidate.experience_years !== null)
    lines.push(`Experience: ${candidate.experience_years} years`);
  if (candidate.summary) lines.push(`Summary: ${candidate.summary}`);
  if (skills.length) {
    lines.push(
      `Skills: ${skills
        .map((item) => `${item.skill}${item.years === null ? "" : ` (${item.years} years)`}`)
        .join(", ")}`,
    );
  }
  for (const item of employment) {
    lines.push(
      [
        `Employment: ${item.title ?? "Role"} at ${item.company}`,
        item.location,
        item.start_date || item.end_date
          ? `${item.start_date ?? "unknown"} to ${item.is_current ? "present" : (item.end_date ?? "unknown")}`
          : null,
        item.description,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }
  for (const item of education) {
    lines.push(
      `Education: ${[item.degree, item.field, item.institution].filter(Boolean).join(", ")}${
        item.start_year || item.end_year
          ? ` (${item.start_year ?? "unknown"}-${item.end_year ?? "unknown"})`
          : ""
      }`,
    );
  }
  for (const item of projects) {
    lines.push(
      `Project: ${item.name}${item.description ? ` | ${item.description}` : ""}${
        item.technologies.length ? ` | ${item.technologies.join(", ")}` : ""
      }`,
    );
  }
  for (const item of certifications) {
    lines.push(
      `Certification: ${item.name}${item.issuer ? ` | ${item.issuer}` : ""}${
        item.issued_date ? ` | issued ${item.issued_date}` : ""
      }${item.expires_date ? ` | expires ${item.expires_date}` : ""}`,
    );
  }
  if (resumeText) lines.push(`Verified resume text:\n${resumeText.slice(0, 12_000)}`);
  return lines.join("\n").slice(0, 30_000);
}

async function loadCandidateEmbeddingText(supabase: AuthenticatedSupabase, candidateId: string) {
  const [candidate, skills, employment, education, projects, certifications, resume] =
    await Promise.all([
      supabase
        .from("candidates")
        .select(
          "first_name, last_name, current_title, current_employer, primary_technology, location, visa_status, availability, experience_years, summary",
        )
        .eq("id", candidateId)
        .maybeSingle(),
      supabase
        .from("candidate_skills")
        .select("skill, years, is_primary")
        .eq("candidate_id", candidateId),
      supabase
        .from("candidate_employment")
        .select("company, title, location, start_date, end_date, is_current, description")
        .eq("candidate_id", candidateId),
      supabase
        .from("candidate_education")
        .select("institution, degree, field, start_year, end_year")
        .eq("candidate_id", candidateId),
      supabase
        .from("candidate_projects")
        .select("name, description, technologies")
        .eq("candidate_id", candidateId),
      supabase
        .from("candidate_certifications")
        .select("name, issuer, issued_date, expires_date")
        .eq("candidate_id", candidateId),
      supabase
        .from("resumes")
        .select("extracted_text")
        .eq("candidate_id", candidateId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const error = [
    candidate.error,
    skills.error,
    employment.error,
    education.error,
    projects.error,
    certifications.error,
    resume.error,
  ].find(Boolean);
  if (error) throw new Error("Failed to load authorized candidate facts", { cause: error });
  if (!candidate.data) throw new Error("Candidate not found or access denied");

  return buildCandidateEmbeddingText(
    candidate.data,
    skills.data ?? [],
    employment.data ?? [],
    education.data ?? [],
    projects.data ?? [],
    certifications.data ?? [],
    resume.data?.extracted_text ?? null,
  );
}

export async function refreshCandidateEmbedding(
  supabase: AuthenticatedSupabase,
  candidateId: string,
) {
  const access = await authorizeCandidateAccess(supabase, candidateId);
  const text = await loadCandidateEmbeddingText(supabase, access.entityId);
  await writeCandidateEmbedding(access, text);
}

export async function refreshRequirementEmbedding(
  supabase: AuthenticatedSupabase,
  requirementId: string,
) {
  const access = await authorizeRequirementAccess(supabase, requirementId);
  const [requirement, skills] = await Promise.all([
    supabase
      .from("requirements")
      .select("title, primary_technology, location, visa_types, description")
      .eq("id", access.entityId)
      .maybeSingle(),
    supabase
      .from("requirement_skills")
      .select("skill, is_mandatory")
      .eq("requirement_id", access.entityId),
  ]);
  if (requirement.error)
    throw new Error("Failed to load authorized requirement", { cause: requirement.error });
  if (skills.error)
    throw new Error("Failed to load authorized requirement skills", { cause: skills.error });
  if (!requirement.data) throw new Error("Requirement not found or access denied");

  const text = [
    requirement.data.title,
    requirement.data.primary_technology,
    requirement.data.location,
    (requirement.data.visa_types ?? []).join(", "),
    requirement.data.description,
    `Mandatory: ${(skills.data ?? [])
      .filter((skill) => skill.is_mandatory)
      .map((skill) => skill.skill)
      .join(", ")}`,
    `Preferred: ${(skills.data ?? [])
      .filter((skill) => !skill.is_mandatory)
      .map((skill) => skill.skill)
      .join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  await writeRequirementEmbedding(access, text);
}

export async function generateQueryEmbedding(text: string) {
  return generateEmbedding(text);
}

async function completeJob(jobId: string) {
  const { error } = await supabaseAdmin.rpc("complete_candidate_embedding_job", {
    _job_id: jobId,
  });
  if (error) throw new Error("Failed to complete candidate embedding job", { cause: error });
}

async function failJob(jobId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown embedding failure";
  const { error: rpcError } = await supabaseAdmin.rpc("fail_candidate_embedding_job", {
    _job_id: jobId,
    _error: message,
  });
  if (rpcError)
    throw new Error("Failed to record candidate embedding job failure", { cause: rpcError });
}

async function processJob(job: EmbeddingJob) {
  try {
    // Only the service-role-only claim RPC can supply jobs to this path. The
    // candidate FK and tenant lookup turn that claimed job into a scoped grant.
    const { data: candidate, error } = await supabaseAdmin
      .from("candidates")
      .select("id, tenant_id")
      .eq("id", job.candidate_id)
      .maybeSingle();
    if (error) throw new Error("Failed to authorize queued candidate embedding", { cause: error });
    if (!candidate?.tenant_id) {
      await completeJob(job.job_id);
      return true;
    }

    const access = issueCandidateAccess(candidate.id, candidate.tenant_id);
    const text = await loadCandidateEmbeddingText(supabaseAdmin, candidate.id);
    await writeCandidateEmbedding(access, text);
    await completeJob(job.job_id);
    return true;
  } catch (error) {
    await failJob(job.job_id, error);
    return false;
  }
}

export async function processCandidateEmbeddingJobs(limit = 10) {
  const { data, error } = await supabaseAdmin.rpc("claim_candidate_embedding_jobs", {
    _limit: Math.min(Math.max(limit, 1), 25),
  });
  if (error) throw new Error("Failed to claim candidate embedding jobs", { cause: error });

  let completed = 0;
  let failed = 0;
  for (const job of data ?? []) {
    if (await processJob(job)) completed += 1;
    else failed += 1;
  }

  return { claimed: data?.length ?? 0, completed, failed };
}

import { createServerFn } from "@tanstack/react-start";
import { requireMatchingAccess } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  requestStructuredAiOutput,
  UNTRUSTED_DOCUMENT_SYSTEM_RULES,
} from "@/lib/ai-gateway.server";
import { writeAudit } from "@/lib/audit.server";
import { runWithAiUsageGuard } from "@/lib/ai-usage.server";
import {
  evaluateCandidateMatch,
  type MatchEligibility,
  type MatchFactor,
  type MatchLevel,
} from "@/lib/candidate-match-engine";

const MATCH_RATIONALE_MODEL =
  process.env.OPENROUTER_MATCH_MODEL?.trim() ||
  (process.env.OPENROUTER_API_KEY?.trim() ? "openai/gpt-4o-mini" : "google/gemini-3-flash-preview");
const MATCH_RATIONALE_PROMPT_VERSION = "match-rationale-human-review-v1";

// ============ Scoring helpers ============

type SkillRow = { skill: string; is_mandatory?: boolean; is_primary?: boolean };

type RequirementScoringInput = {
  title?: string | null;
  description?: string | null;
  primary_technology?: string | null;
  location?: string | null;
  work_mode?: string | null;
  visa_required?: string[] | string | null;
  visa_types?: string[] | null;
  min_experience_years?: number | null;
  max_experience_years?: number | null;
  skills?: Array<string | SkillRow>;
};

type CandidateScoringInput = {
  current_title?: string | null;
  required_job?: string | null;
  summary?: string | null;
  resume_text?: string | null;
  primary_technology?: string | null;
  location?: string | null;
  visa_status?: string | null;
  experience_years?: number | null;
  semantic_similarity?: number;
  skills?: Array<string | SkillRow>;
};

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "years",
  "year",
  "role",
  "developer",
  "engineer",
  "required",
  "preferred",
]);

const TECHNOLOGY_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  node: "nodejs",
  "node.js": "nodejs",
  reactjs: "react",
  postgresql: "postgres",
  "c#": "csharp",
  ".net": "dotnet",
  k8s: "kubernetes",
};

function canonicalTerm(value: string) {
  return TECHNOLOGY_ALIASES[value] ?? value;
}

function searchableTerms(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .flatMap((value) => value.toLowerCase().split(/[^a-z0-9+#.]+/))
        .map((value) => canonicalTerm(value.trim()))
        .filter((value) => value.length > 1 && !STOP_WORDS.has(value)),
    ),
  );
}

function domainMatch(req: RequirementScoringInput, cand: CandidateScoringInput) {
  const coreTerms = searchableTerms([
    req.title,
    req.primary_technology,
    ...(req.skills ?? []).map((skill) => (typeof skill === "string" ? skill : skill.skill)),
  ]);
  const contextTerms = searchableTerms([req.description]).slice(0, 40);
  if (coreTerms.length === 0 && contextTerms.length === 0) {
    return { score: 0, matched: [] as string[] };
  }

  const candidateText = searchableTerms([
    cand.current_title,
    cand.required_job,
    cand.primary_technology,
    cand.summary,
    cand.resume_text,
    ...(cand.skills ?? []).map((skill) => (typeof skill === "string" ? skill : skill.skill)),
  ]);
  const candidateSet = new Set(candidateText);
  const coreMatched = coreTerms.filter((term) => candidateSet.has(term));
  const contextMatched = contextTerms.filter((term) => candidateSet.has(term));
  const coreScore = coreTerms.length ? coreMatched.length / coreTerms.length : 0;
  const contextScore = contextTerms.length
    ? Math.min(1, contextMatched.length / Math.min(contextTerms.length, 8))
    : 0;
  const score = coreTerms.length ? coreScore * 0.85 + contextScore * 0.15 : contextScore;
  return { score, matched: Array.from(new Set([...coreMatched, ...contextMatched])) };
}

function norm(s: string) {
  return canonicalTerm(
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9+#.]/g, ""),
  );
}

function skillMatch(reqSkills: SkillRow[], candSkills: SkillRow[]) {
  const candSet = new Set(candSkills.map((s) => norm(s.skill)));
  const mandatory = reqSkills.filter((s) => s.is_mandatory);
  const preferred = reqSkills.filter((s) => !s.is_mandatory);
  const mHits = mandatory.filter((s) => candSet.has(norm(s.skill)));
  const pHits = preferred.filter((s) => candSet.has(norm(s.skill)));
  const mScore = mandatory.length ? mHits.length / mandatory.length : 1;
  const pScore = preferred.length ? pHits.length / preferred.length : 1;
  const overall = mandatory.length
    ? preferred.length
      ? mScore * 0.7 + pScore * 0.3
      : mScore
    : preferred.length
      ? pScore
      : 1;
  const missing = [
    ...mandatory.filter((s) => !candSet.has(norm(s.skill))).map((s) => s.skill),
    ...preferred.filter((s) => !candSet.has(norm(s.skill))).map((s) => s.skill),
  ];
  return {
    score: overall,
    matched: [...mHits, ...pHits].map((s) => s.skill),
    missing,
  };
}

function experienceMatch(min?: number | null, max?: number | null, candYears?: number | null) {
  if (min == null && max == null) return 1;
  if (candYears == null) return 0;
  const lo = min ?? 0;
  const hi = max ?? Math.max(lo, candYears);
  if (candYears >= lo && candYears <= hi) return 1;
  if (candYears < lo) return candYears / Math.max(lo, 1);
  return hi / Math.max(candYears, 1);
}

function visaMatch(
  reqVisas: string[] | string | null | undefined,
  candVisa: string | null | undefined,
) {
  if (!reqVisas) return 1;

  const reqStr = Array.isArray(reqVisas) ? reqVisas.join(" ") : String(reqVisas);
  if (!reqStr || reqStr === "—" || reqStr.toLowerCase().includes("any")) return 1;
  if (!candVisa) return 0;

  const cVisa = candVisa.toLowerCase().trim();
  const rLower = reqStr.toLowerCase();

  if (rLower.includes(cVisa)) return 1;
  if (
    (cVisa.includes("citizen") || cVisa.includes("usc")) &&
    (rLower.includes("citizen") ||
      rLower.includes("usc") ||
      rLower.includes("gc") ||
      rLower.includes("green card"))
  )
    return 1;
  if (
    (cVisa.includes("green card") || cVisa.includes("gc")) &&
    (rLower.includes("gc") || rLower.includes("green card") || rLower.includes("h1b"))
  )
    return 1;
  if (cVisa.includes("h1b") && rLower.includes("h1b")) return 1;
  if (cVisa.includes("opt") && rLower.includes("opt")) return 1;

  return 0;
}

function locationMatch(
  reqLoc: string | null | undefined,
  reqMode: string | null | undefined,
  candLoc: string | null | undefined,
) {
  if (reqMode === "remote") return 1;
  if (!reqLoc) return 1;
  if (!candLoc) return 0;
  const a = reqLoc.toLowerCase();
  const b = candLoc.toLowerCase();
  if (a === b) return 1;
  const at = new Set(a.split(/[,\s]+/).filter(Boolean));
  const bt = new Set(b.split(/[,\s]+/).filter(Boolean));
  const overlap = [...at].filter((x) => bt.has(x)).length;
  return overlap ? Math.min(1, 0.7 + overlap * 0.15) : 0;
}

function weightedOverall(components: Array<{ score: number; weight: number }>) {
  const totalWeight = components.reduce((total, component) => total + component.weight, 0);
  if (totalWeight === 0) return 0;
  return (
    components.reduce((total, component) => total + component.score * component.weight, 0) /
    totalWeight
  );
}

function evaluateHardConstraints(
  req: RequirementScoringInput,
  cand: CandidateScoringInput,
  requirementSkills: SkillRow[],
  candidateSkills: SkillRow[],
) {
  const reasons: string[] = [];
  const candidateSkillSet = new Set(candidateSkills.map((skill) => norm(skill.skill)));
  const missingMandatory = requirementSkills
    .filter((skill) => skill.is_mandatory && !candidateSkillSet.has(norm(skill.skill)))
    .map((skill) => skill.skill);

  if (missingMandatory.length > 0) {
    reasons.push(`Missing mandatory skills: ${missingMandatory.join(", ")}`);
  }
  if (req.min_experience_years != null) {
    if (cand.experience_years == null) reasons.push("Required experience is not recorded");
    else if (cand.experience_years < req.min_experience_years) {
      reasons.push(`Below the recorded ${req.min_experience_years}-year minimum experience`);
    }
  }
  if (req.visa_types?.length && visaMatch(req.visa_types, cand.visa_status) === 0) {
    reasons.push("Recorded work authorization does not match the requirement");
  }
  if (
    req.work_mode !== "remote" &&
    req.location &&
    locationMatch(req.location, req.work_mode, cand.location) === 0
  ) {
    reasons.push("Recorded location does not match the on-site/hybrid requirement");
  }

  return { passed: reasons.length === 0, reasons, missing_mandatory_skills: missingMandatory };
}

export function computeSingleMatchScore(
  req: RequirementScoringInput | null | undefined,
  cand: CandidateScoringInput | null | undefined,
): number {
  if (!req || !cand) return 0;

  const reqSkillsRows: SkillRow[] =
    req.skills && Array.isArray(req.skills)
      ? req.skills.map((s) => ({
          skill: typeof s === "string" ? s : s.skill,
          is_mandatory: typeof s === "object" ? Boolean(s.is_mandatory) : true,
        }))
      : req.primary_technology
        ? [{ skill: req.primary_technology, is_mandatory: true }]
        : [];

  const candSkillList: string[] = Array.isArray(cand.skills)
    ? cand.skills.map((skill: string | SkillRow) =>
        typeof skill === "string" ? skill : skill.skill,
      )
    : cand.primary_technology
      ? [cand.primary_technology]
      : [];
  const sk: SkillRow[] = candSkillList.map((s) => ({ skill: s, is_primary: true }));
  const sm = skillMatch(reqSkillsRows, sk);
  const em = experienceMatch(
    req.min_experience_years,
    req.max_experience_years,
    cand.experience_years,
  );
  const vm = visaMatch(req.visa_required || req.visa_types, cand.visa_status);
  const lm = locationMatch(req.location, req.work_mode, cand.location);
  const dm = domainMatch(req, cand);

  const kw =
    cand.primary_technology &&
    req.primary_technology &&
    norm(cand.primary_technology) === norm(req.primary_technology)
      ? 1
      : cand.primary_technology &&
          req.title &&
          req.title.toLowerCase().includes(cand.primary_technology.toLowerCase())
        ? 0.9
        : 0;

  const components: Array<{ score: number; weight: number }> = [];
  if (reqSkillsRows.length > 0) components.push({ score: sm.score, weight: 0.35 });
  if (req.min_experience_years != null || req.max_experience_years != null) {
    components.push({ score: em, weight: 0.12 });
  }
  if (req.visa_required || req.visa_types) components.push({ score: vm, weight: 0.13 });
  if (req.location || req.work_mode === "remote") components.push({ score: lm, weight: 0.1 });
  if (req.primary_technology || req.title) {
    components.push({ score: Math.max(kw, dm.score), weight: 0.15 });
  }
  if (typeof cand.semantic_similarity === "number") {
    components.push({ score: Math.max(0, Math.min(1, cand.semantic_similarity)), weight: 0.25 });
  }
  const overall = weightedOverall(components);

  return Math.min(100, Math.max(0, Math.round(overall * 100)));
}

// ============ Match candidates for a requirement ============

export const listMatchingRequirements = createServerFn({ method: "GET" })
  .middleware([requireMatchingAccess])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("requirements")
      .select("id, title, primary_technology, location, work_mode, status")
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to load requisitions for matching: ${error.message}`);
    return data ?? [];
  });

export const matchCandidatesForRequirement = createServerFn({ method: "POST" })
  .middleware([requireMatchingAccess])
  .validator((input: unknown) =>
    z
      .object({
        requirement_id: z.string().uuid(),
        candidate_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(250).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [
      { data: req, error: requirementError },
      { data: requirementSkills, error: skillsError },
    ] = await Promise.all([
      supabase
        .from("requirements")
        .select(
          "id, title, primary_technology, description, location, work_mode, visa_types, min_experience_years, max_experience_years",
        )
        .eq("id", data.requirement_id)
        .maybeSingle(),
      supabase
        .from("requirement_skills")
        .select("skill, is_mandatory")
        .eq("requirement_id", data.requirement_id),
    ]);
    if (requirementError)
      throw new Error(`Unable to load requirement for matching: ${requirementError.message}`);
    if (skillsError)
      throw new Error(`Unable to load requirement skills for matching: ${skillsError.message}`);
    if (!req) throw new Error("Requirement not found or access denied");

    const simMap = new Map<string, number>();

    const { data: matches } = await supabase.rpc("match_candidates_for_requirement", {
      _requirement_id: data.requirement_id,
      _limit: data.limit * 3,
    });
    if (matches?.length) {
      for (const m of matches) {
        simMap.set(m.candidate_id, m.similarity);
      }
    }

    const candidateSkillMap = new Map<string, SkillRow[]>();
    const [
      { data: dbCands, error: candidatesError },
      { data: candidateSkills, error: candidateSkillsError },
      { data: resumes, error: resumesError },
      { data: employment, error: employmentError },
      { data: education, error: educationError },
      { data: certifications, error: certificationsError },
      { data: projects, error: projectsError },
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, first_name, last_name, current_title, current_employer, required_job, primary_technology, location, visa_status, availability, experience_years, status, summary, updated_at",
        )
        .neq("status", "inactive")
        .order("updated_at", { ascending: false })
        .limit(1000),
      supabase.from("candidate_skills").select("candidate_id, skill, is_primary").limit(10000),
      supabase
        .from("resumes")
        .select("candidate_id, extracted_text, is_primary")
        .not("extracted_text", "is", null)
        .limit(5000),
      supabase.from("candidate_employment").select("candidate_id, title, description").limit(10000),
      supabase
        .from("candidate_education")
        .select("candidate_id, degree, field, institution")
        .limit(10000),
      supabase.from("candidate_certifications").select("candidate_id, name, issuer").limit(10000),
      supabase
        .from("candidate_projects")
        .select("candidate_id, name, description, technologies")
        .limit(10000),
    ]);
    if (candidatesError)
      throw new Error(`Unable to load matched candidates: ${candidatesError.message}`);
    if (candidateSkillsError)
      throw new Error(`Unable to load candidate skills: ${candidateSkillsError.message}`);
    if (resumesError) throw new Error(`Unable to load candidate resumes: ${resumesError.message}`);
    if (employmentError)
      throw new Error(`Unable to load candidate employment: ${employmentError.message}`);
    if (educationError)
      throw new Error(`Unable to load candidate education: ${educationError.message}`);
    if (certificationsError)
      throw new Error(`Unable to load candidate certifications: ${certificationsError.message}`);
    if (projectsError)
      throw new Error(`Unable to load candidate projects: ${projectsError.message}`);
    const cands = dbCands ?? [];
    for (const skill of candidateSkills ?? []) {
      candidateSkillMap.set(skill.candidate_id, [
        ...(candidateSkillMap.get(skill.candidate_id) ?? []),
        { skill: skill.skill, is_primary: skill.is_primary },
      ]);
    }
    const resumeMap = new Map<string, string>();
    for (const resume of resumes ?? []) {
      if (resume.extracted_text && (resume.is_primary || !resumeMap.has(resume.candidate_id))) {
        resumeMap.set(resume.candidate_id, resume.extracted_text);
      }
    }

    const groupByCandidate = <T extends { candidate_id: string }>(items: T[]) => {
      const grouped = new Map<string, T[]>();
      for (const item of items) {
        grouped.set(item.candidate_id, [...(grouped.get(item.candidate_id) ?? []), item]);
      }
      return grouped;
    };
    const employmentMap = groupByCandidate(employment ?? []);
    const educationMap = groupByCandidate(education ?? []);
    const certificationMap = groupByCandidate(certifications ?? []);
    const projectMap = groupByCandidate(projects ?? []);

    const reqSkillsRows: SkillRow[] = (requirementSkills ?? []).map((skill) => ({
      skill: skill.skill,
      is_mandatory: skill.is_mandatory,
    }));
    if (reqSkillsRows.length === 0 && req.primary_technology) {
      reqSkillsRows.push({ skill: req.primary_technology, is_mandatory: true });
    }

    const rows: MatchRow[] = cands.map((c) => {
      const sk = candidateSkillMap.get(c.id) ?? [];
      if (sk.length === 0 && c.primary_technology) {
        sk.push({ skill: c.primary_technology, is_primary: true });
      }
      const sem = Math.max(0, Math.min(1, simMap.get(c.id) ?? 0));
      const resumeText = resumeMap.get(c.id) ?? null;
      const evaluation = evaluateCandidateMatch({
        requirement: req,
        candidate: c,
        requirementSkills: reqSkillsRows,
        evidence: {
          skills: sk,
          resumeText,
          employment: employmentMap.get(c.id) ?? [],
          education: educationMap.get(c.id) ?? [],
          certifications: certificationMap.get(c.id) ?? [],
          projects: projectMap.get(c.id) ?? [],
          semanticSimilarity: simMap.has(c.id) ? sem : null,
        },
      });
      const factor = (key: MatchFactor["key"]) =>
        evaluation.factors.find((item) => item.key === key)?.score ?? 0;

      return {
        candidate: {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          current_title: c.current_title,
          current_employer: c.current_employer,
          required_job: c.required_job,
          primary_technology: c.primary_technology,
          location: c.location,
          visa_status: c.visa_status,
          availability: c.availability,
          experience_years: c.experience_years,
          status: c.status,
          has_resume: Boolean(resumeText),
          updated_at: c.updated_at,
        },
        match_level: evaluation.level,
        eligibility: evaluation.eligibility,
        summary: evaluation.summary,
        score_breakdown: evaluation.factors,
        review_notes: evaluation.review_notes,
        hard_constraints: {
          passed: evaluation.eligibility !== "hard_constraint_not_met",
          reasons: evaluation.hard_constraint_reasons,
          missing_mandatory_skills: evaluation.missing_required_skills,
        },
        scores: {
          overall: evaluation.overall,
          skill: factor("required_skills"),
          semantic: evaluation.semantic_score,
          experience: factor("experience"),
          visa:
            req.visa_types?.length && c.visa_status
              ? evaluation.hard_constraint_reasons.some((reason) =>
                  reason.includes("work authorization"),
                )
                ? 0
                : 100
              : 0,
          location: factor("location"),
          keyword: factor("role_relevance"),
          domain: factor("role_relevance"),
        },
        matched_skills: [
          ...evaluation.matched_required_skills,
          ...evaluation.matched_preferred_skills,
        ],
        matched_required_skills: evaluation.matched_required_skills,
        missing_required_skills: evaluation.missing_required_skills,
        matched_preferred_skills: evaluation.matched_preferred_skills,
        missing_preferred_skills: evaluation.missing_preferred_skills,
        matched_terms: evaluation.matched_preferred_skills,
        missing_skills: [
          ...evaluation.missing_required_skills,
          ...evaluation.missing_preferred_skills,
        ],
      };
    });

    rows.sort(
      (a, b) =>
        eligibilityRank(a.eligibility) - eligibilityRank(b.eligibility) ||
        b.scores.overall - a.scores.overall,
    );

    // Always ensure the specifically-requested candidate is included,
    // even if they rank beyond the slice limit.
    const sliced = rows.slice(0, data.limit);
    if (data.candidate_id && !sliced.some((r) => r.candidate.id === data.candidate_id)) {
      const extra = rows.find((r) => r.candidate.id === data.candidate_id);
      if (extra) sliced.push(extra);
    }

    return {
      rows: sliced,
      requirement: req,
      total_candidates_evaluated: rows.length,
      semantic_available: simMap.size > 0,
    };
  });

function eligibilityRank(value: MatchEligibility) {
  if (value === "meets_minimum") return 0;
  if (value === "needs_review") return 1;
  return 2;
}

export type MatchRow = {
  candidate: {
    id: string;
    first_name: string;
    last_name: string;
    current_title: string | null;
    current_employer: string | null;
    required_job: string | null;
    primary_technology: string | null;
    location: string | null;
    visa_status: string | null;
    availability: string | null;
    experience_years: number | null;
    status: string;
    has_resume: boolean;
    updated_at: string;
  };
  match_level: MatchLevel;
  eligibility: MatchEligibility;
  summary: string;
  score_breakdown: MatchFactor[];
  review_notes: string[];
  scores: {
    overall: number;
    skill: number;
    semantic: number | null;
    experience: number;
    visa: number;
    location: number;
    keyword: number;
    domain: number;
  };
  matched_skills: string[];
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_preferred_skills: string[];
  missing_preferred_skills: string[];
  matched_terms: string[];
  missing_skills: string[];
  hard_constraints: {
    passed: boolean;
    reasons: string[];
    missing_mandatory_skills: string[];
  };
};

// ============ Match requirements for a candidate ============

export const matchRequirementsForCandidate = createServerFn({ method: "POST" })
  .middleware([requireMatchingAccess])
  .validator((input: unknown) =>
    z
      .object({
        candidate_id: z.string(),
        limit: z.number().int().min(1).max(50).default(15),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: cand, error: candidateError }, { data: candidateSkills, error: skillsError }] =
      await Promise.all([
        supabase
          .from("candidates")
          .select(
            "id, first_name, last_name, current_title, current_employer, primary_technology, location, visa_status, availability, experience_years, status",
          )
          .eq("id", data.candidate_id)
          .maybeSingle(),
        supabase
          .from("candidate_skills")
          .select("skill, is_primary")
          .eq("candidate_id", data.candidate_id),
      ]);
    if (candidateError) throw new Error(`Unable to load candidate: ${candidateError.message}`);
    if (skillsError) throw new Error(`Unable to load candidate skills: ${skillsError.message}`);
    if (!cand) throw new Error("Candidate not found or access denied");

    const cSkills: SkillRow[] = (candidateSkills ?? []).map((skill) => ({
      skill: skill.skill,
      is_primary: skill.is_primary,
    }));
    if (cSkills.length === 0 && cand.primary_technology) {
      cSkills.push({ skill: cand.primary_technology, is_primary: true });
    }

    const { data: requirements, error: requirementsError } = await supabase
      .from("requirements")
      .select(
        "id, title, status, priority, client_id, primary_technology, location, work_mode, visa_types, min_experience_years, max_experience_years, rate_min, rate_max, rate_type, currency",
      )
      .eq("status", "open")
      .limit(data.limit * 3);
    if (requirementsError)
      throw new Error(`Unable to load requirements for matching: ${requirementsError.message}`);

    const requirementIds = (requirements ?? []).map((requirement) => requirement.id);
    const { data: requirementSkills, error: requirementSkillsError } = requirementIds.length
      ? await supabase
          .from("requirement_skills")
          .select("requirement_id, skill, is_mandatory")
          .in("requirement_id", requirementIds)
      : { data: [], error: null };
    if (requirementSkillsError)
      throw new Error(`Unable to load requirement skills: ${requirementSkillsError.message}`);
    const requirementSkillMap = new Map<string, SkillRow[]>();
    for (const skill of requirementSkills ?? []) {
      requirementSkillMap.set(skill.requirement_id, [
        ...(requirementSkillMap.get(skill.requirement_id) ?? []),
        { skill: skill.skill, is_mandatory: skill.is_mandatory },
      ]);
    }

    const rows = (requirements ?? []).map((r) => {
      const reqSkills = requirementSkillMap.get(r.id) ?? [];
      if (reqSkills.length === 0 && r.primary_technology) {
        reqSkills.push({ skill: r.primary_technology, is_mandatory: true });
      }
      const sm = skillMatch(reqSkills, cSkills);
      const em = experienceMatch(
        r.min_experience_years,
        r.max_experience_years,
        cand.experience_years,
      );
      const vm = visaMatch(r.visa_types, cand.visa_status);
      const lm = locationMatch(r.location, r.work_mode, cand.location);
      const kw =
        r.primary_technology &&
        cand.primary_technology &&
        norm(r.primary_technology) === norm(cand.primary_technology)
          ? 1
          : 0;
      const components: Array<{ score: number; weight: number }> = [];
      if (reqSkills.length > 0) components.push({ score: sm.score, weight: 0.35 });
      if (r.min_experience_years != null || r.max_experience_years != null) {
        components.push({ score: em, weight: 0.12 });
      }
      if (r.visa_types) components.push({ score: vm, weight: 0.13 });
      if (r.location || r.work_mode === "remote") components.push({ score: lm, weight: 0.1 });
      if (r.primary_technology || r.title) components.push({ score: kw, weight: 0.05 });
      const overall = weightedOverall(components);
      const hardConstraints = evaluateHardConstraints(r, cand, reqSkills, cSkills);
      return {
        requirement: r,
        hard_constraints: hardConstraints,
        scores: {
          overall: Math.round(overall * 100),
          skill: Math.round(sm.score * 100),
          semantic: null,
          experience: Math.round(em * 100),
          visa: Math.round(vm * 100),
          location: Math.round(lm * 100),
        },
        matched_skills: sm.matched,
        missing_skills: sm.missing,
      };
    });
    rows.sort(
      (a, b) =>
        Number(b.hard_constraints.passed) - Number(a.hard_constraints.passed) ||
        b.scores.overall - a.scores.overall,
    );
    return { rows: rows.slice(0, data.limit), candidate: cand };
  });

// ============ Match rationale (AI) ============

export const generateMatchRationale = createServerFn({ method: "POST" })
  .middleware([requireMatchingAccess])
  .validator((input: unknown) =>
    z
      .object({
        requirement_id: z.string(),
        candidate_id: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const [requirementResult, candidateResult, candidateSkillsResult, resumeResult] =
      await Promise.all([
        supabase
          .from("requirements")
          .select(
            "id, title, primary_technology, location, visa_types, min_experience_years, max_experience_years",
          )
          .eq("id", data.requirement_id)
          .maybeSingle(),
        supabase
          .from("candidates")
          .select(
            "id, first_name, last_name, current_title, current_employer, location, visa_status, experience_years, summary",
          )
          .eq("id", data.candidate_id)
          .maybeSingle(),
        supabase.from("candidate_skills").select("skill").eq("candidate_id", data.candidate_id),
        supabase
          .from("resumes")
          .select("extracted_text")
          .eq("candidate_id", data.candidate_id)
          .not("extracted_text", "is", null)
          .order("is_primary", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    if (requirementResult.error)
      throw new Error(`Unable to load requirement: ${requirementResult.error.message}`);
    if (candidateResult.error)
      throw new Error(`Unable to load candidate: ${candidateResult.error.message}`);
    if (candidateSkillsResult.error)
      throw new Error(`Unable to load candidate skills: ${candidateSkillsResult.error.message}`);
    if (resumeResult.error)
      throw new Error(`Unable to load candidate resume evidence: ${resumeResult.error.message}`);
    const req = requirementResult.data;
    const cand = candidateResult.data;
    if (!req || !cand) throw new Error("Requirement or candidate not found or access denied");
    try {
      const candName = `${cand.first_name || "Candidate"} ${cand.last_name || ""}`.trim();
      const prompt = `Analyze these untrusted database records and produce concise, actionable JSON.

BEGIN_UNTRUSTED_REQUIREMENT
REQUIREMENT:
- Title: ${req.title}
- Tech: ${req.primary_technology ?? "—"}
- Location: ${req.location ?? "—"}
- Experience: ${req.min_experience_years ?? "?"}-${req.max_experience_years ?? "?"} years
- Visa: ${req.visa_types?.join(", ") || "—"}
END_UNTRUSTED_REQUIREMENT

BEGIN_UNTRUSTED_CANDIDATE
CANDIDATE:
- ${candName}, ${cand.current_title ?? "—"} @ ${cand.current_employer ?? "—"}
- Location: ${cand.location ?? "—"}, Visa: ${cand.visa_status ?? "—"}, Exp: ${cand.experience_years ?? "?"} yrs
- Skills: ${(candidateSkillsResult.data ?? []).map((item) => item.skill).join(", ") || "—"}
- Summary: ${cand.summary ?? "—"}
- Resume evidence: ${resumeResult.data?.extracted_text?.slice(0, 12_000) ?? "No extracted resume text is available"}
END_UNTRUSTED_CANDIDATE

This is decision support for a recruiter. Do not make an automatic hiring or rejection decision.
Return ONLY JSON:
{ "strengths": string[], "gaps": string[], "recommendation": string, "verdict": "strong" | "possible" | "weak" }`;

      const rationale = await runWithAiUsageGuard(supabase, userId, "match_rationale", () =>
        requestStructuredAiOutput(
          {
            model: MATCH_RATIONALE_MODEL,
            temperature: 0.2,
            max_completion_tokens: 900,
            messages: [
              {
                role: "system",
                content: `${UNTRUSTED_DOCUMENT_SYSTEM_RULES}\nAct as a concise recruiting analyst. Return only JSON.`,
              },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          },
          z
            .object({
              strengths: z.array(z.string().trim().min(1).max(500)).max(20),
              gaps: z.array(z.string().trim().min(1).max(500)).max(20),
              recommendation: z.string().trim().min(1).max(2000),
              verdict: z.enum(["strong", "possible", "weak"]),
            })
            .strict(),
        ),
      );

      await writeAudit({
        actorId: userId,
        actorEmail: (claims.email as string | undefined) ?? null,
        action: "matching.rationale_generated",
        entityType: "requirement_candidate_match",
        metadata: {
          requirement_id: data.requirement_id,
          candidate_id: data.candidate_id,
          model: MATCH_RATIONALE_MODEL,
          prompt_version: MATCH_RATIONALE_PROMPT_VERSION,
        },
      });

      return rationale;
    } catch (error) {
      throw new Error(
        `Unable to generate match rationale: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });


import { normalizeVisaStatus } from "./matching-visa-filter.ts";

export type MatchLevel = "excellent" | "strong" | "good" | "partial" | "low";
export type MatchEligibility = "meets_minimum" | "needs_review" | "hard_constraint_not_met";

export type MatchSkill = {
  skill: string;
  is_mandatory?: boolean;
  is_primary?: boolean;
  source?: "structured" | "primary_technology" | "description";
};

export type MatchRequirement = {
  title: string;
  description?: string | null;
  primary_technology?: string | null;
  location?: string | null;
  work_mode?: string | null;
  visa_types?: string[] | null;
  min_experience_years?: number | null;
  max_experience_years?: number | null;
};

export type MatchCandidate = {
  current_title?: string | null;
  required_job?: string | null;
  summary?: string | null;
  primary_technology?: string | null;
  location?: string | null;
  visa_status?: string | null;
  availability?: string | null;
  experience_years?: number | null;
};

export type CandidateMatchEvidence = {
  skills: MatchSkill[];
  resumeText?: string | null;
  employment?: Array<{
    title?: string | null;
    description?: string | null;
  }>;
  education?: Array<{
    degree?: string | null;
    field?: string | null;
    institution?: string | null;
  }>;
  certifications?: Array<{ name: string; issuer?: string | null }>;
  projects?: Array<{
    name: string;
    description?: string | null;
    technologies?: string[] | null;
  }>;
  semanticSimilarity?: number | null;
};

export type MatchFactorKey =
  | "required_skills"
  | "experience"
  | "role_relevance"
  | "preferred_skills"
  | "location"
  | "education_certifications"
  | "availability";

export type MatchFactor = {
  key: MatchFactorKey;
  label: string;
  score: number;
  base_weight: number;
  applied_weight: number;
  contribution: number;
  evidence: string[];
};

export type CandidateMatchEvaluation = {
  overall: number;
  level: MatchLevel;
  eligibility: MatchEligibility;
  factors: MatchFactor[];
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_preferred_skills: string[];
  missing_preferred_skills: string[];
  hard_constraint_reasons: string[];
  review_notes: string[];
  summary: string;
  semantic_score: number | null;
};

const CONCEPT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bnode\s*\.?\s*js\b/g, "nodejs"],
  [/\breact\s*\.?\s*js\b/g, "react"],
  [/\bnext\s*\.?\s*js\b/g, "nextjs"],
  [/\bvue\s*\.?\s*js\b/g, "vue"],
  [/\btypescript\b|\bts\b/g, "typescript"],
  [/\bjavascript\b|\bjs\b/g, "javascript"],
  [/\bc\s*#\b/g, "csharp"],
  [/\bdot\s*net\b/g, "dotnet"],
  [/\bpostgresql\b/g, "postgres"],
  [/\bk8s\b/g, "kubernetes"],
  [/\bamazon web services\b/g, "aws"],
  [/\bgoogle cloud platform\b/g, "gcp"],
  [/\bdata engineering\b/g, "data engineer"],
  [/\bsoftware engineering\b/g, "software engineer"],
  [/\bdevops engineer(?:ing)?\b/g, "devops"],
];

const LOW_SIGNAL_ROLE_WORDS = new Set([
  "senior",
  "sr",
  "junior",
  "jr",
  "lead",
  "staff",
  "principal",
  "specialist",
  "role",
]);

const KNOWN_SKILLS: Array<{ label: string; aliases: string[] }> = [
  { label: "Python", aliases: ["python"] },
  { label: "SQL", aliases: ["sql"] },
  { label: "ETL", aliases: ["etl"] },
  { label: "Git", aliases: ["git"] },
  { label: "Airflow", aliases: ["airflow", "apache airflow"] },
  { label: "Spark", aliases: ["spark", "pyspark"] },
  { label: "Kafka", aliases: ["kafka", "apache kafka"] },
  { label: "AWS", aliases: ["aws", "amazon web services"] },
  { label: "Azure", aliases: ["azure"] },
  { label: "GCP", aliases: ["gcp", "google cloud platform"] },
  { label: "Java", aliases: ["java"] },
  { label: "React", aliases: ["react", "reactjs", "react.js"] },
  { label: "Node.js", aliases: ["node", "nodejs", "node.js"] },
  { label: "TypeScript", aliases: ["typescript"] },
  { label: ".NET", aliases: [".net", "dotnet"] },
  { label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { label: "Docker", aliases: ["docker"] },
  { label: "Snowflake", aliases: ["snowflake"] },
  { label: "Databricks", aliases: ["databricks"] },
  { label: "Oracle", aliases: ["oracle"] },
  { label: "MongoDB", aliases: ["mongodb", "mongo db"] },
];

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeMatchConcept(value: string) {
  let normalized = value.toLowerCase().replace(/(^|[^a-z0-9])\.net(?=$|[^a-z0-9])/g, "$1dotnet");
  for (const [pattern, replacement] of CONCEPT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptTokens(value: string) {
  return normalizeMatchConcept(value)
    .split(" ")
    .filter((token) => token.length > 1 && !LOW_SIGNAL_ROLE_WORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
}

function containsConcept(haystack: string, needle: string) {
  const normalizedHaystack = ` ${normalizeMatchConcept(haystack)} `;
  const normalizedNeedle = normalizeMatchConcept(needle);
  if (!normalizedNeedle) return false;
  if (normalizedHaystack.includes(` ${normalizedNeedle} `)) return true;
  const evidenceTokens = new Set(conceptTokens(haystack));
  const needleTokens = conceptTokens(needle);
  return needleTokens.length > 0 && needleTokens.every((token) => evidenceTokens.has(token));
}

export function inferPreferredSkills(description: string | null | undefined) {
  if (!description?.trim()) return [];
  return KNOWN_SKILLS.filter((skill) =>
    skill.aliases.some((alias) => containsConcept(description, alias)),
  ).map((skill) => skill.label);
}

function matchSkills(required: MatchSkill[], evidenceText: string) {
  const matched = required.filter((skill) => containsConcept(evidenceText, skill.skill));
  return {
    matched: matched.map((skill) => skill.skill),
    missing: required.filter((skill) => !matched.includes(skill)).map((skill) => skill.skill),
    score: required.length ? (matched.length / required.length) * 100 : 100,
  };
}

function roleRelevance(
  requirement: MatchRequirement,
  candidateText: string,
  semantic?: number | null,
) {
  const requirementRole = [requirement.title, requirement.primary_technology]
    .filter(Boolean)
    .join(" ");
  const requiredTokens = new Set(conceptTokens(requirementRole));
  const candidateTokens = new Set(conceptTokens(candidateText));
  const deterministic = requiredTokens.size
    ? ([...requiredTokens].filter((token) => candidateTokens.has(token)).length /
        requiredTokens.size) *
      100
    : 0;
  const phraseMatch = containsConcept(candidateText, requirement.title) ? 100 : deterministic;
  const semanticScore = typeof semantic === "number" ? clampScore(semantic * 100) : 0;
  return clampScore(Math.max(phraseMatch, semanticScore * 0.85));
}

function experienceScore(minimum: number, candidateYears: number | null | undefined) {
  if (candidateYears == null) return 0;
  if (minimum <= 0 || candidateYears >= minimum) return 100;
  return clampScore((candidateYears / minimum) * 100);
}

function locationScore(
  requirement: MatchRequirement,
  candidateLocation: string | null | undefined,
) {
  if (requirement.work_mode === "remote") return 100;
  if (!requirement.location) return 100;
  if (!candidateLocation) return 0;
  const required = new Set(conceptTokens(requirement.location));
  const candidate = new Set(conceptTokens(candidateLocation));
  if (!required.size) return 100;
  return clampScore(
    ([...required].filter((token) => candidate.has(token)).length / required.size) * 100,
  );
}

function availabilityRequirement(description: string | null | undefined) {
  const normalized = normalizeMatchConcept(description ?? "");
  if (/\b(?:immediate|immediately)\b/.test(normalized)) return "immediate";
  if (/\b(?:two|2) weeks?\b/.test(normalized)) return "two_weeks";
  if (/\b(?:one|1) months?\b/.test(normalized)) return "one_month";
  return null;
}

function educationRequirement(description: string | null | undefined) {
  const normalized = normalizeMatchConcept(description ?? "");
  if (/\b(?:phd|doctorate)\b/.test(normalized)) return "doctorate";
  if (/\bmaster(?:s)?\b/.test(normalized)) return "master";
  if (/\bbachelor(?:s)?\b/.test(normalized)) return "bachelor";
  if (/\bdegree\b/.test(normalized)) return "degree";
  return null;
}

function matchLevel(score: number): MatchLevel {
  if (score >= 90) return "excellent";
  if (score >= 75) return "strong";
  if (score >= 60) return "good";
  if (score >= 40) return "partial";
  return "low";
}

export function evaluateCandidateMatch(input: {
  requirement: MatchRequirement;
  candidate: MatchCandidate;
  requirementSkills: MatchSkill[];
  evidence: CandidateMatchEvidence;
}): CandidateMatchEvaluation {
  const { requirement, candidate, evidence } = input;
  const structuredMandatory = input.requirementSkills.filter((skill) => skill.is_mandatory);
  const structuredPreferred = input.requirementSkills.filter((skill) => !skill.is_mandatory);
  const primarySkill =
    structuredMandatory.length === 0 && requirement.primary_technology
      ? [
          {
            skill: requirement.primary_technology,
            is_mandatory: true,
            source: "primary_technology" as const,
          },
        ]
      : [];
  const requiredSkills = [...structuredMandatory, ...primarySkill];
  const explicitSkillNames = new Set(
    [...requiredSkills, ...structuredPreferred].map((skill) => normalizeMatchConcept(skill.skill)),
  );
  const derivedPreferred = inferPreferredSkills(requirement.description)
    .filter((skill) => !explicitSkillNames.has(normalizeMatchConcept(skill)))
    .map((skill) => ({ skill, is_mandatory: false, source: "description" as const }));
  const preferredSkills = [...structuredPreferred, ...derivedPreferred];

  const evidenceParts = [
    candidate.current_title,
    candidate.required_job,
    candidate.primary_technology,
    candidate.summary,
    evidence.resumeText,
    ...evidence.skills.map((skill) => skill.skill),
    ...(evidence.employment ?? []).flatMap((item) => [item.title, item.description]),
    ...(evidence.projects ?? []).flatMap((item) => [
      item.name,
      item.description,
      ...(item.technologies ?? []),
    ]),
  ].filter((value): value is string => Boolean(value?.trim()));
  const evidenceText = evidenceParts.join(" ");
  const requiredSkillMatch = matchSkills(requiredSkills, evidenceText);
  const preferredSkillMatch = matchSkills(preferredSkills, evidenceText);
  const roleText = [
    candidate.current_title,
    candidate.required_job,
    candidate.primary_technology,
    ...(evidence.employment ?? []).map((item) => item.title),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const factors: Array<Omit<MatchFactor, "applied_weight" | "contribution">> = [];
  if (requiredSkills.length) {
    factors.push({
      key: "required_skills",
      label: "Required technical skills",
      score: clampScore(requiredSkillMatch.score),
      base_weight: 35,
      evidence: requiredSkillMatch.matched,
    });
  }
  if (requirement.min_experience_years != null) {
    factors.push({
      key: "experience",
      label: "Relevant experience",
      score: experienceScore(requirement.min_experience_years, candidate.experience_years),
      base_weight: 20,
      evidence:
        candidate.experience_years == null ? [] : [`${candidate.experience_years} years recorded`],
    });
  }
  if (requirement.title || requirement.primary_technology) {
    factors.push({
      key: "role_relevance",
      label: "Job-role relevance",
      score: roleRelevance(requirement, roleText, evidence.semanticSimilarity),
      base_weight: 15,
      evidence: [
        candidate.current_title,
        candidate.required_job,
        candidate.primary_technology,
      ].filter((value): value is string => Boolean(value)),
    });
  }
  if (preferredSkills.length) {
    factors.push({
      key: "preferred_skills",
      label: "Preferred technical skills",
      score: clampScore(preferredSkillMatch.score),
      base_weight: 10,
      evidence: preferredSkillMatch.matched,
    });
  }
  if (requirement.location || requirement.work_mode) {
    factors.push({
      key: "location",
      label: "Location and work mode",
      score: locationScore(requirement, candidate.location),
      base_weight: 10,
      evidence: [candidate.location, requirement.work_mode].filter((value): value is string =>
        Boolean(value),
      ),
    });
  }

  const requiredEducation = educationRequirement(requirement.description);
  if (requiredEducation) {
    const educationText = (evidence.education ?? [])
      .flatMap((item) => [item.degree, item.field, item.institution])
      .filter((value): value is string => Boolean(value))
      .join(" ");
    const educationMatched =
      requiredEducation === "degree"
        ? Boolean(educationText)
        : containsConcept(educationText, requiredEducation);
    factors.push({
      key: "education_certifications",
      label: "Education and certifications",
      score: educationMatched ? 100 : 0,
      base_weight: 5,
      evidence: educationMatched ? [educationText] : [],
    });
  }

  const requiredAvailability = availabilityRequirement(requirement.description);
  if (requiredAvailability) {
    factors.push({
      key: "availability",
      label: "Availability",
      score: candidate.availability === requiredAvailability ? 100 : 0,
      base_weight: 5,
      evidence: candidate.availability ? [candidate.availability.replaceAll("_", " ")] : [],
    });
  }

  const applicableWeight = factors.reduce((sum, factor) => sum + factor.base_weight, 0);
  const rawOverall = applicableWeight
    ? factors.reduce((sum, factor) => sum + factor.score * factor.base_weight, 0) / applicableWeight
    : 0;
  const evidenceLimitedOverall = factors.length <= 1 ? Math.min(rawOverall, 85) : rawOverall;
  const overall = clampScore(evidenceLimitedOverall);
  const weightedFactors: MatchFactor[] = factors.map((factor) => {
    const appliedWeight = applicableWeight ? (factor.base_weight / applicableWeight) * 100 : 0;
    return {
      ...factor,
      applied_weight: clampScore(appliedWeight),
      contribution: clampScore((factor.score * appliedWeight) / 100),
    };
  });

  const hardConstraintReasons: string[] = [];
  const reviewNotes: string[] = [];
  const candidateEvidenceAvailable = evidenceParts.length > 0;
  if (requiredSkillMatch.missing.length) {
    const reason = `Mandatory skill evidence missing: ${requiredSkillMatch.missing.join(", ")}`;
    if (candidateEvidenceAvailable) hardConstraintReasons.push(reason);
    else reviewNotes.push(reason);
  }
  if (requirement.min_experience_years != null) {
    if (candidate.experience_years == null) {
      reviewNotes.push("Candidate experience is not recorded");
    } else if (candidate.experience_years < requirement.min_experience_years) {
      hardConstraintReasons.push(
        `Below the confirmed ${requirement.min_experience_years}-year minimum experience`,
      );
    }
  }
  if (requirement.visa_types?.length) {
    if (!candidate.visa_status) {
      reviewNotes.push("Work authorization is not recorded");
    } else {
      const acceptedVisas = requirement.visa_types.map(normalizeVisaStatus);
      if (!acceptedVisas.includes(normalizeVisaStatus(candidate.visa_status))) {
        hardConstraintReasons.push(
          "Recorded work authorization is not accepted by the requisition",
        );
      }
    }
  }
  if (requirement.work_mode && requirement.work_mode !== "remote" && requirement.location) {
    if (!candidate.location) reviewNotes.push("Candidate location is not recorded");
    else if (locationScore(requirement, candidate.location) === 0) {
      hardConstraintReasons.push("Recorded location does not match the on-site/hybrid requirement");
    }
  }
  if (structuredMandatory.length === 0 && !requirement.primary_technology) {
    reviewNotes.push(
      "The requisition has no structured mandatory skills; description skills are ranking signals only",
    );
  }
  if (requiredEducation && !(evidence.education ?? []).length) {
    reviewNotes.push("Education evidence is not recorded");
  }
  if (requiredAvailability && !candidate.availability) {
    reviewNotes.push("Availability is not recorded");
  }

  const eligibility: MatchEligibility = hardConstraintReasons.length
    ? "hard_constraint_not_met"
    : reviewNotes.length
      ? "needs_review"
      : "meets_minimum";
  const applicableTechnicalCount = requiredSkills.length + preferredSkills.length;
  const matchedTechnicalCount =
    requiredSkillMatch.matched.length + preferredSkillMatch.matched.length;
  const eligibilityText =
    eligibility === "meets_minimum"
      ? "Candidate meets the confirmed minimum requirements"
      : eligibility === "needs_review"
        ? "Candidate requires manual verification"
        : "Candidate has a confirmed minimum-requirement mismatch";
  const summary = `${eligibilityText} and matches ${matchedTechnicalCount} of ${applicableTechnicalCount} applicable technical requirements.`;

  return {
    overall,
    level: matchLevel(overall),
    eligibility,
    factors: weightedFactors,
    matched_required_skills: requiredSkillMatch.matched,
    missing_required_skills: requiredSkillMatch.missing,
    matched_preferred_skills: preferredSkillMatch.matched,
    missing_preferred_skills: preferredSkillMatch.missing,
    hard_constraint_reasons: hardConstraintReasons,
    review_notes: reviewNotes,
    summary,
    semantic_score:
      typeof evidence.semanticSimilarity === "number"
        ? clampScore(evidence.semanticSimilarity * 100)
        : null,
  };
}

export function getMatchLevelLabel(level: MatchLevel) {
  return {
    excellent: "Excellent Match",
    strong: "Strong Match",
    good: "Good Match",
    partial: "Partial Match",
    low: "Low Match",
  }[level];
}


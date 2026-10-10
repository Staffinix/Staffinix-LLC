const COUNT_PREFIXES = [
  /\bhow\s+many\s+(.+)/i,
  /\b(?:what(?:'s|\s+is)\s+the\s+)?(?:total\s+)?(?:number|count)\s+of\s+(.+)/i,
  /\bcount\s+(.+)/i,
] as const;

const LEADING_FILLER = /^(?:the\s+)?(?:total\s+)?/i;
const TRAILING_CONTEXT =
  /\s+(?:are\s+there|do\s+we\s+have|we\s+have)(?:\s+(?:in|on)\s+(?:the\s+)?(?:system|database|bench|staffinix))?[?.!]*$/i;
const TRAILING_ENTITY =
  /\s*\b(?:persons?|people|candidates?|profiles?|consultants?|talents?|employees?)\b\s*[?.!]*$/i;
const GENERIC_ENTITY =
  /^(?:persons?|people|candidates?|profiles?|consultants?|talents?|employees?)$/i;
const LEADING_ENTITY =
  /^(?:persons?|people|candidates?|profiles?|consultants?|talents?|employees?)\s+(?:(?:who|that)\s+)?(?:are|have|with)\s+/i;
const NON_CANDIDATE_ENTITY =
  /\b(?:requisitions?|requirements?|openings?|jobs?|submissions?|interviews?|placements?|clients?|customers?|vendors?|suppliers?)\b/i;

export type CopilotCandidateCountRow = {
  id: string;
  first_name: string;
  last_name: string;
  current_title: string | null;
  required_job: string | null;
  primary_technology: string | null;
  status: string;
  candidate_skills: Array<{ skill: string }>;
};

function normalizeToken(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "")
    .trim();
  if (normalized.length > 4 && normalized.endsWith("s") && !normalized.endsWith("ss")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function extractCandidateCountTerm(question: string): string | null {
  const normalizedQuestion = question.replace(/\s+/g, " ").trim();
  const match = COUNT_PREFIXES.map((pattern) => normalizedQuestion.match(pattern)).find(Boolean);
  if (!match?.[1]) return null;

  let term = match[1].replace(TRAILING_CONTEXT, "").trim();
  term = term.replace(TRAILING_ENTITY, "").replace(LEADING_FILLER, "").trim();
  term = term.replace(LEADING_ENTITY, "").trim();
  term = term.replace(/[?.!]+$/g, "").trim();

  if (NON_CANDIDATE_ENTITY.test(term)) return null;

  return term && !GENERIC_ENTITY.test(term) ? term : "";
}

export function candidateMatchesCountTerm(candidate: CopilotCandidateCountRow, term: string) {
  if (!term) return true;

  const queryTokens = term.split(/\s+/).map(normalizeToken).filter(Boolean);
  if (!queryTokens.length) return true;

  const searchable = [
    candidate.current_title,
    candidate.required_job,
    candidate.primary_technology,
    candidate.status,
    ...candidate.candidate_skills.map((skill) => skill.skill),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);

  return queryTokens.every((queryToken) =>
    searchable.some(
      (candidateToken) =>
        candidateToken === queryToken ||
        candidateToken.startsWith(queryToken) ||
        queryToken.startsWith(candidateToken),
    ),
  );
}

export function formatCandidateCountLabel(term: string) {
  if (!term) return "candidate";
  return term
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

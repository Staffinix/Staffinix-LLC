export const CANDIDATE_CHILD_KEYS = [
  "skills",
  "employment",
  "education",
  "projects",
  "certifications",
] as const;

export type CandidateChildKey = (typeof CANDIDATE_CHILD_KEYS)[number];

/**
 * Undefined means "leave this collection untouched". An explicit empty
 * array is intentionally retained because it means "clear this collection".
 */
export function providedCandidateChildKeys(
  input: Partial<Record<CandidateChildKey, unknown>>,
): CandidateChildKey[] {
  return CANDIDATE_CHILD_KEYS.filter((key) => input[key] !== undefined);
}
